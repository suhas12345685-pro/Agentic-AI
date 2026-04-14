"""
Ingestor — accepts raw sources (plain text, URLs, file paths) and
produces a list of normalized :class:`Chunk` objects ready for
embedding.

Network fetches are guarded by a short timeout and run in a thread so
the async event loop is never blocked.  If ``httpx`` / ``requests``
are absent the URL branch simply falls back to ``urllib``.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlparse

from ..utils.logger import get_logger

log = get_logger("perception.ingest")


@dataclass
class Chunk:
    """A single unit of perceived content."""

    content: str
    source: str
    metadata: dict = field(default_factory=dict)


class Ingestor:
    """
    Convert heterogeneous inputs to uniform ``Chunk`` lists.

    Args:
        chunk_size:  Target characters per chunk (soft limit).
        overlap:     Characters of overlap between consecutive chunks.
        http_timeout:  Seconds before URL fetches are abandoned.
    """

    def __init__(
        self,
        *,
        chunk_size: int = 800,
        overlap: int = 80,
        http_timeout: float = 10.0,
    ) -> None:
        if overlap >= chunk_size:
            raise ValueError("overlap must be smaller than chunk_size")
        self.chunk_size = chunk_size
        self.overlap = overlap
        self.http_timeout = http_timeout

    # ------------------------------------------------------------------
    # Public dispatch
    # ------------------------------------------------------------------
    async def ingest(self, source: str, *, metadata: Optional[dict] = None) -> List[Chunk]:
        """Detect the source type and dispatch to the right ingest path."""
        metadata = dict(metadata or {})
        if self._looks_like_url(source):
            log.info(f"Ingesting URL: {source}")
            text = await self._fetch_url(source)
            metadata.setdefault("type", "url")
        elif Path(source).is_file():
            log.info(f"Ingesting file: {source}")
            text = await asyncio.to_thread(Path(source).read_text, "utf-8")
            metadata.setdefault("type", "file")
        else:
            log.debug("Ingesting raw text")
            text = source
            metadata.setdefault("type", "text")

        cleaned = self._clean(text)
        chunks = [
            Chunk(content=part, source=source, metadata=dict(metadata))
            for part in self._split(cleaned)
        ]
        log.info(f"Produced {len(chunks)} chunk(s) from source")
        return chunks

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _looks_like_url(source: str) -> bool:
        try:
            parsed = urlparse(source)
            return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
        except ValueError:
            return False

    async def _fetch_url(self, url: str) -> str:
        def _blocking_fetch() -> str:
            try:
                import httpx  # type: ignore

                r = httpx.get(url, timeout=self.http_timeout, follow_redirects=True)
                r.raise_for_status()
                return r.text
            except ImportError:
                from urllib.request import Request, urlopen

                req = Request(url, headers={"User-Agent": "cognition-ingestor/1.0"})
                with urlopen(req, timeout=self.http_timeout) as resp:  # noqa: S310
                    return resp.read().decode("utf-8", errors="replace")

        try:
            return await asyncio.to_thread(_blocking_fetch)
        except Exception as exc:  # noqa: BLE001 — surface ingestion failures uniformly
            log.error(f"URL fetch failed ({url}): {exc}")
            return ""

    @staticmethod
    def _clean(text: str) -> str:
        # Strip HTML tags crudely; good enough for RAG over web pages.
        without_tags = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.IGNORECASE)
        without_tags = re.sub(r"<style[\s\S]*?</style>", " ", without_tags, flags=re.IGNORECASE)
        without_tags = re.sub(r"<[^>]+>", " ", without_tags)
        collapsed = re.sub(r"\s+", " ", without_tags).strip()
        return collapsed

    def _split(self, text: str) -> List[str]:
        if not text:
            return []
        if len(text) <= self.chunk_size:
            return [text]

        step = self.chunk_size - self.overlap
        return [text[i : i + self.chunk_size] for i in range(0, len(text), step)]
