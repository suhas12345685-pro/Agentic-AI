"""
Short-term memory — a bounded sliding window of recent turns.

This mimics human working memory: small, fast, ordered, and
automatically forgetting the oldest entries when capacity is
exceeded.  Each ``Turn`` captures a role, content, and arbitrary
metadata (e.g. which plan step produced it).
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any, Deque, Dict, Iterable, List, Optional

from ..utils.logger import get_logger

log = get_logger("memory.short_term")


@dataclass
class Turn:
    role: str  # "user" | "assistant" | "tool" | "thought" | "observation" | "reflection"
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ShortTermMemory:
    """
    Sliding-window conversation/task context.

    Args:
        capacity: maximum number of turns to retain.
    """

    def __init__(self, *, capacity: int = 32) -> None:
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        self.capacity = capacity
        self._buffer: Deque[Turn] = deque(maxlen=capacity)

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------
    def add(self, role: str, content: str, *, metadata: Optional[Dict[str, Any]] = None) -> Turn:
        turn = Turn(role=role, content=content, metadata=dict(metadata or {}))
        self._buffer.append(turn)
        log.debug(f"+turn role={role} len(buf)={len(self._buffer)}/{self.capacity}")
        return turn

    def extend(self, turns: Iterable[Turn]) -> None:
        for turn in turns:
            self._buffer.append(turn)

    def clear(self) -> None:
        self._buffer.clear()

    # ------------------------------------------------------------------
    # Access
    # ------------------------------------------------------------------
    def recent(self, n: Optional[int] = None) -> List[Turn]:
        if n is None or n >= len(self._buffer):
            return list(self._buffer)
        return list(self._buffer)[-n:]

    def render(self, n: Optional[int] = None) -> str:
        """Pretty-print the window for prompt injection."""
        lines = [f"[{t.role.upper()}] {t.content}" for t in self.recent(n)]
        return "\n".join(lines)

    def __len__(self) -> int:
        return len(self._buffer)

    def __iter__(self):
        return iter(self._buffer)
