"""Perception layer: unstructured data -> chunks -> vector embeddings."""

from .ingest import Chunk, Ingestor
from .embedder import Embedder

__all__ = ["Chunk", "Ingestor", "Embedder"]
