"""
CognitiveAgent — the composed, user-facing class.

A single instance wires every subsystem together:

    Perception  (Ingestor + Embedder)
        |
        v
    Memory      (ShortTermMemory + LongTermMemory)
        |
        v
    Reasoning   (Planner + HypothesisGenerator + ReasoningEngine)
        |
        v
    Reflection  (Reflector)
        |
        v
    Execution   (ToolRegistry)

Subclass to override any piece — e.g. swap the LLM client, register
domain-specific tools, or provide a custom Reflector.
"""

from __future__ import annotations

from typing import List, Optional

from .execution.registry import ToolRegistry
from .execution.tools import register_default_tools
from .memory.long_term import LongTermMemory
from .memory.short_term import ShortTermMemory
from .perception.embedder import Embedder
from .perception.ingest import Chunk, Ingestor
from .reasoning.engine import ReasoningEngine, RunTrace
from .reasoning.hypothesis import HypothesisGenerator
from .reasoning.planner import Planner
from .reflection.reflector import Reflector
from .utils.llm import LLMClient, MockLLM
from .utils.logger import get_logger

log = get_logger("agent")


class CognitiveAgent:
    """
    High-level cognitive agent.

    Args:
        llm: Any ``LLMClient`` implementation. Defaults to ``MockLLM``
            so the agent always runs.
        short_term_capacity: Turns retained in working memory.
        persist_dir: Where to persist long-term memory (optional).
        register_defaults: Whether to attach the built-in mock tools.
    """

    def __init__(
        self,
        *,
        llm: Optional[LLMClient] = None,
        short_term_capacity: int = 32,
        persist_dir: Optional[str] = None,
        register_defaults: bool = True,
        tools: Optional[ToolRegistry] = None,
        embedder: Optional[Embedder] = None,
    ) -> None:
        self.llm: LLMClient = llm or MockLLM()
        self.embedder = embedder or Embedder()
        self.ingestor = Ingestor()

        self.short_term = ShortTermMemory(capacity=short_term_capacity)
        self.long_term = LongTermMemory(embedder=self.embedder, persist_dir=persist_dir)

        self.tools = tools or ToolRegistry()
        if register_defaults:
            register_default_tools(self.tools, long_term=self.long_term, llm=self.llm)

        self.planner = Planner(self.llm)
        self.hypothesizer = HypothesisGenerator(self.llm)
        self.reflector = Reflector(self.llm, long_term=self.long_term)

        self.engine = ReasoningEngine(
            llm=self.llm,
            planner=self.planner,
            hypothesis_generator=self.hypothesizer,
            reflector=self.reflector,
            tools=self.tools,
            short_term=self.short_term,
            long_term=self.long_term,
        )
        log.info(
            f"CognitiveAgent ready (tools={len(self.tools)}, "
            f"embedder_dim={self.embedder.dim}, stm_cap={short_term_capacity})"
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def run(self, goal: str) -> RunTrace:
        """Decompose, execute, reflect, synthesize."""
        return await self.engine.run(goal)

    async def perceive(self, source: str) -> List[Chunk]:
        """
        Ingest a new source into long-term memory.

        The ingestor chunks the input; each chunk is embedded and
        stored as a long-term ``experience`` record.
        """
        chunks = await self.ingestor.ingest(source)
        for chunk in chunks:
            await self.long_term.remember(
                chunk.content,
                kind="experience",
                metadata={"source": chunk.source, **chunk.metadata},
            )
        log.info(f"perceived {len(chunks)} chunk(s) from {source[:60]!r}")
        return chunks

    def register_tool(self, fn, *, name: str | None = None, description: str = "") -> None:
        """Convenience wrapper around ``self.tools.register``."""
        self.tools.register(fn, name=name, description=description)
