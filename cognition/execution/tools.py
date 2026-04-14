"""
Mock built-in tools — enough surface to prove the pipeline end-to-end
without real external services.

``register_default_tools`` attaches:

- echo:      Returns the argument back (useful as a no-op in plans).
- calc:      Safely evaluates an arithmetic expression.
- recall:    Runs a semantic query against long-term memory.
- remember:  Persists a fact into long-term memory.
- summarize: Asks the LLM to summarize the provided text.
"""

from __future__ import annotations

import ast
import operator as op
from typing import TYPE_CHECKING, Optional

from ..utils.logger import get_logger

if TYPE_CHECKING:
    from ..memory.long_term import LongTermMemory
    from ..utils.llm import LLMClient
    from .registry import ToolRegistry

log = get_logger("execution.tools")

_ALLOWED_OPS = {
    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv,
    ast.Mod: op.mod, ast.Pow: op.pow, ast.FloorDiv: op.floordiv,
    ast.USub: op.neg, ast.UAdd: op.pos,
}


def _safe_eval(expr: str) -> float:
    """Evaluate a numeric expression without ``eval``."""
    tree = ast.parse(expr, mode="eval")

    def _visit(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return _visit(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_OPS:
            return _ALLOWED_OPS[type(node.op)](_visit(node.left), _visit(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_OPS:
            return _ALLOWED_OPS[type(node.op)](_visit(node.operand))
        raise ValueError(f"disallowed expression: {ast.dump(node)}")

    return _visit(tree)


def register_default_tools(
    registry: "ToolRegistry",
    *,
    long_term: Optional["LongTermMemory"] = None,
    llm: Optional["LLMClient"] = None,
) -> None:
    @registry.tool(name="echo", description="Return the argument unchanged.")
    async def echo(args):  # noqa: D401
        return args

    @registry.tool(
        name="calc",
        description="Evaluate an arithmetic expression (e.g. '2 + 3 * 4').",
    )
    async def calc(args):
        expr = str(args).strip()
        try:
            return _safe_eval(expr)
        except Exception as exc:  # noqa: BLE001
            return f"calc_error: {exc}"

    if long_term is not None:
        @registry.tool(
            name="recall",
            description="Semantic search over long-term memory.",
        )
        async def recall(args):
            query = str(args)
            hits = await long_term.recall(query, k=5)
            if not hits:
                return "no matching memory"
            return [
                {"kind": h.kind, "score": h.score, "content": h.content[:400]}
                for h in hits
            ]

        @registry.tool(
            name="remember",
            description="Persist a fact into long-term memory.",
        )
        async def remember(args):
            content = str(args)
            rec = await long_term.remember(content, kind="fact")
            return f"stored id={rec.id[:8]}"

    if llm is not None:
        @registry.tool(
            name="summarize",
            description="Summarize the provided text in 2-3 sentences.",
        )
        async def summarize(args):
            prompt = f"Summarize the following in 2-3 sentences:\n{args}"
            return await llm.complete(prompt)
