"""
Metacognitive Reflector.

After every plan step the Reflector answers three questions:

    1. Did this step move me closer to the goal?   (progress)
    2. What did I learn?                            (lesson)
    3. Do I need to change course?                  (replan)

The response is always a normalized dict so the engine can act on it
programmatically.  Every reflection is logged *and* persisted to
long-term memory when one is available, forming the agent's growing
library of self-observations.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..memory.long_term import LongTermMemory
from ..utils.llm import LLMClient
from ..utils.logger import get_logger

log = get_logger("reflection.reflector")


REFLECTION_SYSTEM_PROMPT = (
    "You are the metacognitive module of a cognitive agent. Given the "
    "user's goal, the step just executed, the pre-step hypotheses, and "
    "the observation, evaluate the step. Return ONLY a JSON object with "
    "fields: progress ('forward' | 'flat' | 'backward'), delta (short "
    "description of what changed), lesson (what the agent should "
    "remember), replan (boolean — true if the agent should revise the "
    "plan)."
)

_VALID_PROGRESS = {"forward", "flat", "backward"}


class Reflector:
    def __init__(
        self,
        llm: LLMClient,
        *,
        long_term: Optional[LongTermMemory] = None,
    ) -> None:
        self.llm = llm
        self.long_term = long_term

    async def reflect(
        self,
        *,
        goal: str,
        step: str,
        hypotheses: List[Dict[str, Any]],
        observation: Any,
    ) -> Dict[str, Any]:
        obs_repr = str(observation)[:1200]
        prompt = (
            f"Goal: {goal}\n"
            f"Step just executed: {step}\n"
            f"Hypotheses before action: {hypotheses}\n"
            f"Observation: {obs_repr}\n"
            f"Perform the self-correction check. Respond with JSON only."
        )
        raw = await self.llm.json(prompt, system=REFLECTION_SYSTEM_PROMPT, fallback=None)
        result = self._normalize(raw)
        log.info(
            f"reflection: progress={result['progress']} replan={result['replan']} "
            f"lesson={result['lesson'][:80]!r}"
        )

        if self.long_term is not None and result["lesson"]:
            try:
                await self.long_term.remember(
                    content=f"LESSON: {result['lesson']} (step: {step})",
                    kind="fact",
                    metadata={"progress": result["progress"], "replan": result["replan"]},
                )
            except Exception as exc:  # noqa: BLE001
                log.warning(f"could not persist lesson: {exc}")

        return result

    # ------------------------------------------------------------------
    # Normalization
    # ------------------------------------------------------------------
    def _normalize(self, raw: Any) -> Dict[str, Any]:
        if not isinstance(raw, dict):
            return {
                "progress": "flat",
                "delta": "no structured reflection available",
                "lesson": "",
                "replan": False,
            }

        progress = str(raw.get("progress", "flat")).lower()
        if progress not in _VALID_PROGRESS:
            progress = "flat"

        replan_raw = raw.get("replan", False)
        if isinstance(replan_raw, str):
            replan = replan_raw.strip().lower() in {"true", "yes", "1"}
        else:
            replan = bool(replan_raw)

        return {
            "progress": progress,
            "delta": str(raw.get("delta", "")).strip(),
            "lesson": str(raw.get("lesson", "")).strip(),
            "replan": replan,
        }
