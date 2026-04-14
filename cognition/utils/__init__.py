"""Cross-cutting utilities: logger + LLM abstraction."""

from .logger import get_logger
from .llm import LLMClient, MockLLM

__all__ = ["get_logger", "LLMClient", "MockLLM"]
