"""
ReasoningEngine — the core cognitive loop.

    goal
      -> Planner.decompose
      -> for each ready step:
            HypothesisGenerator.generate     (think before acting)
            ToolRegistry.execute             (act)
            Reflector.reflect                (self-correct)
            maybe replan
      -> synthesize final answer

The loop is fully asynchronous; independent steps (siblings in the
DAG with all dependencies satisfied) run concurrently via
``asyncio.gather``.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from ..utils.llm import LLMClient
from ..utils.logger import get_logger
from .hypothesis import HypothesisGenerator
from .planner import PlanStep, Planner

if TYPE_CHECKING:
    from ..execution.registry import ToolRegistry
    from ..memory.long_term import LongTermMemory
    from ..memory.short_term import ShortTermMemory
    from ..reflection.reflector import Reflector

log = get_logger("reasoning.engine")


@dataclass
class RunTrace:
    goal: str
    plan: List[PlanStep] = field(default_factory=list)
    answer: str = ""
    replans: int = 0

    def to_dict(self) -> dict:
        return {
            "goal": self.goal,
            "answer": self.answer,
            "replans": self.replans,
            "plan": [
                {
                    "id": s.id,
                    "step": s.step,
                    "tool": s.tool,
                    "status": s.status,
                    "result": s.result,
                    "hypotheses": [h.to_dict() if hasattr(h, "to_dict") else h for h in s.hypotheses],
                    "reflection": s.reflection,
                }
                for s in self.plan
            ],
        }


class ReasoningEngine:
    def __init__(
        self,
        *,
        llm: LLMClient,
        planner: Planner,
        hypothesis_generator: HypothesisGenerator,
        reflector: "Reflector",
        tools: "ToolRegistry",
        short_term: "ShortTermMemory",
        long_term: Optional["LongTermMemory"] = None,
        max_replans: int = 2,
    ) -> None:
        self.llm = llm
        self.planner = planner
        self.hypothesizer = hypothesis_generator
        self.reflector = reflector
        self.tools = tools
        self.short_term = short_term
        self.long_term = long_term
        self.max_replans = max_replans

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------
    async def run(self, goal: str) -> RunTrace:
        log.info(f"=== cognitive run begin: {goal!r} ===")
        self.short_term.add("user", goal, metadata={"phase": "goal"})

        context = await self._recall_relevant(goal)
        plan = await self.planner.plan(
            goal,
            available_tools=self.tools.names(),
            context=context,
        )
        trace = RunTrace(goal=goal, plan=plan)
        self.short_term.add(
            "thought",
            f"Plan generated with {len(plan)} step(s).",
            metadata={"phase": "plan"},
        )

        await self._execute_plan(goal, trace)
        trace.answer = await self._synthesize(goal, trace)

        self.short_term.add("assistant", trace.answer, metadata={"phase": "answer"})
        if self.long_term:
            await self.long_term.remember(
                content=f"GOAL: {goal}\nANSWER: {trace.answer}",
                kind="reasoning_path",
                metadata={"replans": trace.replans, "steps": len(trace.plan)},
            )
        log.info(f"=== cognitive run end ({len(trace.plan)} steps, {trace.replans} replan) ===")
        return trace

    # ------------------------------------------------------------------
    # Plan execution — DAG-aware, concurrent
    # ------------------------------------------------------------------
    async def _execute_plan(self, goal: str, trace: RunTrace) -> None:
        plan_by_id: Dict[int, PlanStep] = {s.id: s for s in trace.plan}

        while any(s.status == "pending" for s in trace.plan):
            ready = [
                s for s in trace.plan
                if s.status == "pending"
                and all(plan_by_id.get(dep) and plan_by_id[dep].status == "done"
                        for dep in s.depends_on)
            ]

            if not ready:
                blocked = [s for s in trace.plan if s.status == "pending"]
                if blocked:
                    log.warning(
                        f"plan deadlocked (failed upstream or missing deps); "
                        f"marking {len(blocked)} blocked step(s) as failed"
                    )
                    for s in blocked:
                        s.status = "failed"
                        s.result = "blocked: upstream dependency did not complete"
                break

            await asyncio.gather(*(self._run_step(goal, s, plan_by_id) for s in ready))

            if await self._should_replan(trace):
                if trace.replans >= self.max_replans:
                    log.warning("max replans reached — continuing with current plan")
                else:
                    trace.replans += 1
                    log.info(f"replanning (attempt {trace.replans})")
                    context = self.short_term.render(n=20)
                    new_plan = await self.planner.plan(
                        goal,
                        available_tools=self.tools.names(),
                        context=context,
                    )
                    # Append new pending steps that don't collide with existing ids.
                    used = {s.id for s in trace.plan}
                    next_id = max(used) + 1
                    for s in new_plan:
                        if s.id in used:
                            s.id = next_id
                            next_id += 1
                        trace.plan.append(s)
                        plan_by_id[s.id] = s

    async def _run_step(
        self,
        goal: str,
        step: PlanStep,
        plan_by_id: Dict[int, PlanStep],
    ) -> None:
        step.status = "in_progress"
        log.info(f"step {step.id} start: {step.step!r}")
        self.short_term.add("thought", f"[step {step.id}] {step.step}", metadata={"step_id": step.id})

        # 1. Hypothesize
        step.hypotheses = await self.hypothesizer.generate(
            goal=goal, step=step.step, tool=step.tool, args=step.args,
        )
        for h in step.hypotheses:
            self.short_term.add(
                "thought",
                f"hypothesis (c={h.confidence:.2f}): {h.hypothesis}",
                metadata={"step_id": step.id, "kind": "hypothesis"},
            )

        # 2. Act
        observation: Any
        if step.tool:
            try:
                observation = await self.tools.execute(step.tool, step.args)
                step.status = "done"
            except Exception as exc:  # noqa: BLE001 — surface tool errors as observations
                observation = f"tool_error: {exc}"
                step.status = "failed"
                log.error(f"step {step.id} tool {step.tool!r} failed: {exc}")
        else:
            # Pure reasoning step — ask the LLM directly.
            upstream = self._summarize_upstream(step, plan_by_id)
            prompt = (
                f"Goal: {goal}\n"
                f"Current sub-task: {step.step}\n"
                f"Upstream results: {upstream or '(none)'}\n"
                f"Produce the result for this sub-task."
            )
            observation = await self.llm.complete(prompt)
            step.status = "done"

        step.result = observation
        self.short_term.add(
            "observation",
            str(observation)[:800],
            metadata={"step_id": step.id, "tool": step.tool},
        )

        # 3. Reflect
        step.reflection = await self.reflector.reflect(
            goal=goal,
            step=step.step,
            hypotheses=[h.to_dict() for h in step.hypotheses],
            observation=observation,
        )
        self.short_term.add(
            "reflection",
            str(step.reflection),
            metadata={"step_id": step.id},
        )
        log.info(
            f"step {step.id} end: status={step.status} "
            f"progress={step.reflection.get('progress')} replan={step.reflection.get('replan')}"
        )

    # ------------------------------------------------------------------
    # Replanning decision
    # ------------------------------------------------------------------
    async def _should_replan(self, trace: RunTrace) -> bool:
        for step in trace.plan:
            r = step.reflection or {}
            if r.get("replan") is True:
                return True
            if step.status == "failed" and r.get("progress") == "backward":
                return True
        return False

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    async def _recall_relevant(self, goal: str) -> str:
        if self.long_term is None:
            return ""
        try:
            hits = await self.long_term.recall(goal, k=3)
        except Exception as exc:  # noqa: BLE001
            log.warning(f"long-term recall failed: {exc}")
            return ""
        if not hits:
            return ""
        lines = [f"- ({h.kind}, score={h.score:.2f}) {h.content[:240]}" for h in hits]
        return "Relevant prior experience:\n" + "\n".join(lines)

    def _summarize_upstream(self, step: PlanStep, plan_by_id: Dict[int, PlanStep]) -> str:
        parts: List[str] = []
        for dep in step.depends_on:
            up = plan_by_id.get(dep)
            if not up:
                continue
            parts.append(f"[{dep}] {str(up.result)[:240]}")
        return "\n".join(parts)

    async def _synthesize(self, goal: str, trace: RunTrace) -> str:
        summary_lines = [
            f"- Step {s.id} ({s.status}): {s.step} -> {str(s.result)[:240]}"
            for s in trace.plan
        ]
        prompt = (
            f"Goal: {goal}\n"
            f"Execution summary:\n" + "\n".join(summary_lines) + "\n\n"
            f"Synthesize a final answer for the user. Be direct and avoid "
            f"mentioning internal step ids."
        )
        try:
            return await self.llm.complete(prompt)
        except Exception as exc:  # noqa: BLE001
            log.error(f"synthesis failed: {exc}")
            return "I completed the plan but could not compose a final answer."
