"""
Human-Level Cognition Layer

A modular, asynchronous framework that gives an AI agent:

    Perception  -> text/web -> vector embeddings
    Memory      -> sliding-window short-term + RAG long-term
    Reasoning   -> goal decomposition + hypothesis generation
    Reflection  -> metacognitive self-correction after every step
    Execution   -> pluggable tool registry

The public surface is intentionally small: instantiate a
``CognitiveAgent``, register tools, and call ``await agent.run(goal)``.
"""

from .agent import CognitiveAgent
from .execution.registry import ToolRegistry, tool
from .memory.short_term import ShortTermMemory
from .memory.long_term import LongTermMemory
from .perception.embedder import Embedder
from .reasoning.engine import ReasoningEngine
from .reflection.reflector import Reflector

__all__ = [
    "CognitiveAgent",
    "ToolRegistry",
    "tool",
    "ShortTermMemory",
    "LongTermMemory",
    "Embedder",
    "ReasoningEngine",
    "Reflector",
]
