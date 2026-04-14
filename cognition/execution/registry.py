"""
ToolRegistry — the agent's action surface.

Tools are registered as coroutines (or sync functions — they are
wrapped transparently) and looked up by name from the reasoning
engine.  Each ``ToolSpec`` carries a human-readable description so
the planner can pick the right tool.

Usage::

    registry = ToolRegistry()

    @registry.tool(name="echo", description="Echo back the input string.")
    async def echo(args):
        return args

The module-level ``tool`` decorator is a convenience that binds to a
process-wide default registry; most callers should instantiate their
own registry and use ``registry.tool(...)``.
"""

from __future__ import annotations

import asyncio
import inspect
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional, Union

from ..utils.logger import get_logger

log = get_logger("execution.registry")

ToolFn = Callable[[Any], Union[Any, Awaitable[Any]]]


@dataclass
class ToolSpec:
    name: str
    description: str
    fn: ToolFn
    metadata: Dict[str, Any] = field(default_factory=dict)


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: Dict[str, ToolSpec] = {}

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------
    def register(
        self,
        fn: ToolFn,
        *,
        name: Optional[str] = None,
        description: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ToolSpec:
        tool_name = name or getattr(fn, "__name__", None)
        if not tool_name:
            raise ValueError("register(): a name is required for lambdas")
        if tool_name in self._tools:
            log.warning(f"overwriting existing tool: {tool_name}")
        spec = ToolSpec(
            name=tool_name,
            description=description or (inspect.getdoc(fn) or "").strip(),
            fn=fn,
            metadata=dict(metadata or {}),
        )
        self._tools[tool_name] = spec
        log.info(f"registered tool: {tool_name}")
        return spec

    def tool(
        self,
        *,
        name: Optional[str] = None,
        description: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Callable[[ToolFn], ToolFn]:
        """Decorator form of ``register``."""
        def decorator(fn: ToolFn) -> ToolFn:
            self.register(fn, name=name, description=description, metadata=metadata)
            return fn
        return decorator

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------
    def names(self) -> List[str]:
        return list(self._tools.keys())

    def describe(self) -> List[Dict[str, str]]:
        return [{"name": s.name, "description": s.description} for s in self._tools.values()]

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def __len__(self) -> int:
        return len(self._tools)

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------
    async def execute(self, name: str, args: Any) -> Any:
        spec = self._tools.get(name)
        if spec is None:
            known = ", ".join(self._tools.keys()) or "(none)"
            raise KeyError(f"unknown tool {name!r}. known: {known}")

        log.info(f"executing tool: {name}")
        result = spec.fn(args)
        if inspect.isawaitable(result):
            return await result
        # Offload blocking sync fns so we don't stall the loop.
        if callable(result):  # zero-arg closure case
            return await asyncio.to_thread(result)
        return result


# ----------------------------------------------------------------------
# Module-level convenience: default registry + decorator
# ----------------------------------------------------------------------
default_registry = ToolRegistry()


def tool(
    *,
    name: Optional[str] = None,
    description: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> Callable[[ToolFn], ToolFn]:
    """Decorator that registers against ``default_registry``."""
    return default_registry.tool(name=name, description=description, metadata=metadata)
