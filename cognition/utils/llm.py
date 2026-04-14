"""
LLM client abstraction.

We intentionally keep the surface small: a single ``complete`` coroutine
that takes a system prompt plus a user prompt and returns text.  Real
deployments can plug in OpenAI / Anthropic / Ollama by implementing
``LLMClient``; the default ``MockLLM`` lets the whole cognition layer
run with zero external dependencies so tests stay hermetic.
"""

from __future__ import annotations

import asyncio
import json
import re
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from .logger import get_logger

log = get_logger("utils.llm")


class LLMClient(ABC):
    """Abstract async LLM interface."""

    @abstractmethod
    async def complete(self, prompt: str, *, system: Optional[str] = None) -> str:
        ...

    async def json(
        self,
        prompt: str,
        *,
        system: Optional[str] = None,
        fallback: Any = None,
    ) -> Any:
        """
        Ask the LLM for JSON and parse it, tolerating fenced code blocks
        or leading prose.  Returns ``fallback`` on parse failure.
        """
        raw = await self.complete(prompt, system=system)
        match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", raw)
        if not match:
            log.warning("LLM json(): no JSON payload found, using fallback")
            return fallback
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            log.warning(f"LLM json(): parse error ({exc}); using fallback")
            return fallback


class MockLLM(LLMClient):
    """
    Deterministic stand-in LLM.

    It inspects the prompt and returns structurally-correct responses so
    the whole pipeline (plan -> hypothesize -> reflect -> synthesize)
    can execute end-to-end without hitting a network.  Swap for a real
    client in production.
    """

    def __init__(self, *, latency_s: float = 0.0) -> None:
        self.latency_s = latency_s
        self._call_count = 0

    async def complete(self, prompt: str, *, system: Optional[str] = None) -> str:
        if self.latency_s:
            await asyncio.sleep(self.latency_s)
        self._call_count += 1
        lower = prompt.lower()

        # Order matters — check the most specific markers first so the
        # reflection / hypothesis / synthesis prompts don't get captured
        # by the planner branch just because they quote the goal.
        if "self-correction" in lower or "perform the self-correction" in lower:
            return self._mock_reflection(prompt)
        if "generate up to" in lower and "hypothes" in lower:
            return self._mock_hypotheses(prompt)
        if "synthesize" in lower or "synthesise" in lower or "final answer" in lower:
            return (
                "Based on the executed plan and observations, the goal has been "
                "addressed with the best available evidence."
            )
        if "decompose" in lower or "execution plan" in lower:
            return self._mock_plan(prompt)
        return f"[MockLLM response #{self._call_count}] Understood."

    # ------------------------------------------------------------------
    # Mock generators — produce valid JSON the parsers expect.
    # ------------------------------------------------------------------
    def _mock_plan(self, prompt: str) -> str:
        goal = self._extract_goal(prompt)
        plan: List[Dict[str, Any]] = [
            {
                "id": 1,
                "step": f"Gather context relevant to: {goal}",
                "tool": "recall",
                "args": goal,
                "depends_on": [],
            },
            {
                "id": 2,
                "step": "Perform primary action towards the goal",
                "tool": "echo",
                "args": goal,
                "depends_on": [1],
            },
            {
                "id": 3,
                "step": "Verify outcome and summarize",
                "tool": None,
                "args": None,
                "depends_on": [2],
            },
        ]
        return json.dumps(plan)

    def _mock_hypotheses(self, prompt: str) -> str:
        return json.dumps(
            [
                {"hypothesis": "The current step will produce useful signal.", "confidence": 0.7},
                {"hypothesis": "The chosen tool is appropriate for the input.", "confidence": 0.6},
                {"hypothesis": "No hidden dependency will block progress.", "confidence": 0.55},
            ]
        )

    def _mock_reflection(self, prompt: str) -> str:
        return json.dumps(
            {
                "progress": "forward",
                "delta": "New evidence gathered; approach remains valid.",
                "lesson": "Continue executing the plan; no replanning required.",
                "replan": False,
            }
        )

    def _extract_goal(self, prompt: str) -> str:
        match = re.search(r"goal\s*[:\-]\s*(.+)", prompt, flags=re.IGNORECASE)
        return match.group(1).strip().splitlines()[0] if match else "the user goal"
