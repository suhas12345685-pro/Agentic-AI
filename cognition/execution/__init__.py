"""Execution interface: tool registry + mock built-ins."""

from .registry import ToolRegistry, ToolSpec, tool
from .tools import register_default_tools

__all__ = ["ToolRegistry", "ToolSpec", "tool", "register_default_tools"]
