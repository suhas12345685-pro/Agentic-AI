"""
Embedder — pluggable text -> vector encoder.

Resolution order:

1. ``sentence-transformers`` (local, offline) if installed.
2. OpenAI embeddings API if ``OPENAI_API_KEY`` is present *and*
   ``openai`` is installed.
3. A deterministic hashing embedder (fallback) so the system always
   works.  The hashing embedder is *not* semantically meaningful but
   keeps dimensionality and determinism — handy for tests and CI.

All public methods are async; CPU-bound model inference is offloaded
to a thread with ``asyncio.to_thread``.
"""

from __future__ import annotations

import hashlib
import math
import os
from typing import List, Optional, Sequence

from ..utils.logger import get_logger

log = get_logger("perception.embedder")


class Embedder:
    def __init__(
        self,
        *,
        model: Optional[str] = None,
        dim: int = 384,
        backend: Optional[str] = None,
    ) -> None:
        self.dim = dim
        self.model_name = model or os.environ.get(
            "COGNITION_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
        )
        self._backend = backend or os.environ.get("COGNITION_EMBED_BACKEND")
        self._local_model = None
        self._openai_client = None
        self._resolve_backend()

    # ------------------------------------------------------------------
    # Backend resolution
    # ------------------------------------------------------------------
    def _resolve_backend(self) -> None:
        if self._backend == "hash":
            log.info("Embedder backend: hash (forced)")
            return

        # 1. sentence-transformers
        if self._backend in (None, "local"):
            try:
                from sentence_transformers import SentenceTransformer  # type: ignore

                import asyncio as _asyncio  # noqa: F401 — only to keep import-time light
                self._local_model = SentenceTransformer(self.model_name)
                self.dim = self._local_model.get_sentence_embedding_dimension()
                self._backend = "local"
                log.info(f"Embedder backend: local ({self.model_name}, dim={self.dim})")
                return
            except Exception as exc:  # noqa: BLE001
                log.debug(f"sentence-transformers unavailable: {exc}")

        # 2. OpenAI
        if self._backend in (None, "openai") and os.environ.get("OPENAI_API_KEY"):
            try:
                import openai  # type: ignore

                self._openai_client = openai.AsyncOpenAI()
                self._backend = "openai"
                self.dim = 1536 if "small" in (self.model_name or "") else 3072
                log.info(f"Embedder backend: openai ({self.model_name})")
                return
            except Exception as exc:  # noqa: BLE001
                log.debug(f"openai backend unavailable: {exc}")

        self._backend = "hash"
        log.warning(
            "Embedder falling back to hash backend. "
            "Install sentence-transformers or set OPENAI_API_KEY for semantic embeddings."
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def embed(self, text: str) -> List[float]:
        vectors = await self.embed_many([text])
        return vectors[0]

    async def embed_many(self, texts: Sequence[str]) -> List[List[float]]:
        if self._backend == "local" and self._local_model is not None:
            import asyncio

            def _run() -> List[List[float]]:
                vecs = self._local_model.encode(list(texts), normalize_embeddings=True)
                return [v.tolist() for v in vecs]

            return await asyncio.to_thread(_run)

        if self._backend == "openai" and self._openai_client is not None:
            resp = await self._openai_client.embeddings.create(
                model=self.model_name or "text-embedding-3-small",
                input=list(texts),
            )
            return [item.embedding for item in resp.data]

        return [self._hash_embed(t) for t in texts]

    # ------------------------------------------------------------------
    # Fallback embedder
    # ------------------------------------------------------------------
    def _hash_embed(self, text: str) -> List[float]:
        """Bag-of-words hashing trick -> L2-normalized vector."""
        vec = [0.0] * self.dim
        for token in _tokenize(text):
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            vec[h % self.dim] += 1.0
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]


def _tokenize(text: str) -> List[str]:
    return [t for t in "".join(c.lower() if c.isalnum() else " " for c in text).split() if t]
