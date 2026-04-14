"""
Planner — decomposes a high-level goal into an executable plan.

The planner asks the LLM for a JSON array of steps and validates the
shape before handing back structured :class:`PlanStep` objects.  If
the LLM response is malformed, the planner falls back to a single
"do the whole goal" step so the engine never crashes mid-run.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional

from ..utils.llm import LLMClient
from ..utils.logger import get_logger

log = get_logger("reasoning.planner")


@dataclass
class PlanStep:
    id: int
    step: str
    tool: Optional[str] = None
    args: Any = None
    depends_on: List[int] = field(default_factory=list)
    status: str = "pending"           # pending | in_progress | done | failed
    result: Any = None
    hypotheses: list = field(default_factory=list)
    reflection: Optional[dict] = None


PLAN_SYSTEM_PROMPT = (
    "You are the planning module of a cognitive agent. Decompose the "
    "user's goal into the smallest reasonable number of concrete steps. "
    "Return ONLY a JSON array. Each element must have: id (int, starting "
    "at 1), step (string), tool (string or null, chosen from the "
    "available tool names), args (string or object passed to the tool), "
    "depends_on (array of prior step ids)."
)


class Planner:
    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    async def plan(
        self,
        goal: str,
        *,
        available_tools: Optional[List[str]] = None,
        context: Optional[str] = None,
    ) -> List[PlanStep]:
        tools_desc = ", ".join(available_tools or []) or "(none registered)"
        context_block = f"Context:\n{context}\n" if context else ""
        user_prompt = (
            f"Goal: {goal}\n"
            f"Available tools: {tools_desc}\n"
            f"{context_block}"
            f"Decompose the goal into an execution plan. Respond with JSON only."
        )

        raw = await self.llm.json(user_prompt, system=PLAN_SYSTEM_PROMPT, fallback=None)
        steps = self._validate(raw, goal)
        log.info(f"planner produced {len(steps)} step(s)")
        for s in steps:
            log.debug(f"  step {s.id}: {s.step} (tool={s.tool}, deps={s.depends_on})")
        return steps

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------
    def _validate(self, raw: Any, goal: str) -> List[PlanStep]:
        if not isinstance(raw, list) or not raw:
            log.warning("planner LLM returned unusable payload; using single-step fallback")
            return [PlanStep(id=1, step=goal)]

        steps: List[PlanStep] = []
        seen_ids: set = set()
        for idx, item in enumerate(raw, start=1):
            if not isinstance(item, dict):
                continue
            try:
                step_id = int(item.get("id", idx))
            except (TypeError, ValueError):
                step_id = idx
            if step_id in seen_ids:
                step_id = idx
            seen_ids.add(step_id)

            deps_raw = item.get("depends_on") or []
            deps: List[int] = []
            if isinstance(deps_raw, list):
                for d in deps_raw:
                    try:
                        deps.append(int(d))
                    except (TypeError, ValueError):
                        continue

            steps.append(
                PlanStep(
                    id=step_id,
                    step=str(item.get("step") or item.get("task") or "<no description>"),
                    tool=(str(item["tool"]) if item.get("tool") else None),
                    args=item.get("args"),
                    depends_on=deps,
                )
            )

        return steps or [PlanStep(id=1, step=goal)]
