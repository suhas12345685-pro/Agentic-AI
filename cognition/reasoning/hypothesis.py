"""
HypothesisGenerator — *think before you act*.

Before executing a plan step, the agent generates N candidate
hypotheses about what it expects to happen.  Later, the Reflector
compares actual observations against these predictions to detect
surprise / model error.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List

from ..utils.llm import LLMClient
from ..utils.logger import get_logger

log = get_logger("reasoning.hypothesis")

HYPOTHESIS_SYSTEM_PROMPT = (
    "You are the hypothesis module of a cognitive agent. For the given "
    "plan step, produce short predictions about what will happen if the "
    "agent executes it. Respond ONLY with a JSON array of objects with "
    "fields: hypothesis (string) and confidence (float in [0, 1])."
)


@dataclass
class Hypothesis:
    hypothesis: str
    confidence: float

    def to_dict(self) -> dict:
        return {"hypothesis": self.hypothesis, "confidence": self.confidence}


class HypothesisGenerator:
    def __init__(self, llm: LLMClient, *, max_hypotheses: int = 3) -> None:
        self.llm = llm
        self.max_hypotheses = max_hypotheses

    async def generate(self, *, goal: str, step: str, tool: str | None, args: Any) -> List[Hypothesis]:
        prompt = (
            f"Goal: {goal}\n"
            f"Upcoming step: {step}\n"
            f"Tool: {tool or '(none)'}\n"
            f"Tool args: {args!r}\n"
            f"Generate up to {self.max_hypotheses} hypotheses."
        )
        raw = await self.llm.json(prompt, system=HYPOTHESIS_SYSTEM_PROMPT, fallback=[])
        out: List[Hypothesis] = []
        if isinstance(raw, list):
            for item in raw[: self.max_hypotheses]:
                if not isinstance(item, dict):
                    continue
                text = str(item.get("hypothesis") or "").strip()
                if not text:
                    continue
                try:
                    confidence = float(item.get("confidence", 0.5))
                except (TypeError, ValueError):
                    confidence = 0.5
                out.append(Hypothesis(text, max(0.0, min(1.0, confidence))))

        if not out:
            out.append(Hypothesis("The step will execute without surprises.", 0.5))

        log.info(f"generated {len(out)} hypothesis/es for step: {step[:60]!r}")
        for h in out:
            log.debug(f"  h={h.hypothesis!r} c={h.confidence:.2f}")
        return out
