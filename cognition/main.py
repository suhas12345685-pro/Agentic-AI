"""
Runnable demo for the Human-Level Cognition Layer.

    python -m cognition.main

Walks through: perceive a snippet of text, run a goal through the
cognitive loop, print the trace.  Uses the MockLLM so no network or
API keys are required.
"""

from __future__ import annotations

import asyncio
import json

from .agent import CognitiveAgent
from .utils.logger import get_logger

log = get_logger("main")


async def demo() -> None:
    agent = CognitiveAgent()

    # 1. Perceive some external content.
    await agent.perceive(
        "The cognition layer uses a dual-memory system: a short-term "
        "sliding window for the current task, and a long-term RAG store "
        "for past experiences and successful reasoning paths."
    )

    # 2. Run a goal end-to-end.
    goal = "Plan and verify a calculation of 2 + 3 * 4, then remember the result."
    trace = await agent.run(goal)

    print("\n================= RUN TRACE =================")
    print(json.dumps(trace.to_dict(), indent=2, default=str))
    print("============================================\n")
    print(f"ANSWER: {trace.answer}")


def main() -> None:
    asyncio.run(demo())


if __name__ == "__main__":
    main()
