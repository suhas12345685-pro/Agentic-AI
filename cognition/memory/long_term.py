"""
Long-term memory — persistent RAG store.

Preferred backend is Chroma (with its built-in persistence).  If
``chromadb`` is not installed the class degrades to an in-process
numpy/pure-python cosine index that can still be snapshotted to disk
as JSON, so the same public API works in every environment.

Records capture three kinds of experience the agent should be able to
retrieve later:

- ``experience``   : raw episodes (what happened)
- ``reasoning_path``: successful plan/hypothesis traces
- ``fact``         : distilled knowledge snippets
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from ..perception.embedder import Embedder
from ..utils.logger import get_logger

log = get_logger("memory.long_term")


@dataclass
class MemoryRecord:
    id: str
    content: str
    kind: str = "experience"
    metadata: Dict[str, Any] = field(default_factory=dict)
    ts: float = field(default_factory=time.time)
    score: Optional[float] = None  # populated on retrieval


class LongTermMemory:
    """
    RAG store for past experiences and reasoning paths.

    Args:
        embedder:  Shared embedder (reuse the agent's instance).
        persist_dir: Directory for persistence.  Required for Chroma,
            optional for the fallback (in-memory if omitted).
        collection:  Logical partition name.
    """

    def __init__(
        self,
        *,
        embedder: Embedder,
        persist_dir: Optional[str] = None,
        collection: str = "cognition",
    ) -> None:
        self.embedder = embedder
        self.persist_dir = persist_dir
        self.collection_name = collection
        self._chroma = None
        self._fallback_records: List[MemoryRecord] = []
        self._fallback_vectors: List[List[float]] = []
        self._resolve_backend()

    # ------------------------------------------------------------------
    # Backend
    # ------------------------------------------------------------------
    def _resolve_backend(self) -> None:
        try:
            import chromadb  # type: ignore

            if self.persist_dir:
                os.makedirs(self.persist_dir, exist_ok=True)
                client = chromadb.PersistentClient(path=self.persist_dir)
            else:
                client = chromadb.Client()
            self._chroma = client.get_or_create_collection(self.collection_name)
            log.info(f"LongTermMemory backend: chroma ({self.collection_name})")
            return
        except Exception as exc:  # noqa: BLE001 — chroma is optional
            log.debug(f"chromadb unavailable: {exc}")

        log.warning("LongTermMemory falling back to in-memory cosine store")
        if self.persist_dir:
            self._load_snapshot()

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------
    async def remember(
        self,
        content: str,
        *,
        kind: str = "experience",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> MemoryRecord:
        record = MemoryRecord(
            id=str(uuid.uuid4()),
            content=content,
            kind=kind,
            metadata=dict(metadata or {}),
        )
        vector = await self.embedder.embed(content)

        if self._chroma is not None:
            # Chroma metadata values must be primitives; serialize nested structures.
            flat_meta = {k: _stringify(v) for k, v in record.metadata.items()}
            flat_meta["kind"] = kind
            flat_meta["ts"] = record.ts
            await asyncio.to_thread(
                self._chroma.add,
                ids=[record.id],
                documents=[content],
                embeddings=[vector],
                metadatas=[flat_meta],
            )
        else:
            self._fallback_records.append(record)
            self._fallback_vectors.append(vector)
            self._save_snapshot()

        log.info(f"remembered kind={kind} id={record.id[:8]}")
        return record

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------
    async def recall(
        self,
        query: str,
        *,
        k: int = 5,
        kind: Optional[str] = None,
    ) -> List[MemoryRecord]:
        if not query.strip():
            return []

        vector = await self.embedder.embed(query)

        if self._chroma is not None:
            where = {"kind": kind} if kind else None
            res = await asyncio.to_thread(
                self._chroma.query,
                query_embeddings=[vector],
                n_results=k,
                where=where,
            )
            ids = res.get("ids", [[]])[0]
            docs = res.get("documents", [[]])[0]
            metas = res.get("metadatas", [[]])[0]
            dists = res.get("distances", [[]])[0]
            out: List[MemoryRecord] = []
            for rid, doc, meta, dist in zip(ids, docs, metas, dists):
                meta = dict(meta or {})
                out.append(
                    MemoryRecord(
                        id=rid,
                        content=doc,
                        kind=str(meta.pop("kind", "experience")),
                        metadata=meta,
                        ts=float(meta.pop("ts", 0.0) or 0.0),
                        score=1.0 - float(dist),
                    )
                )
            return out

        # Fallback: cosine similarity in pure Python.
        scored: List[tuple] = []
        for rec, vec in zip(self._fallback_records, self._fallback_vectors):
            if kind and rec.kind != kind:
                continue
            scored.append((_cosine(vector, vec), rec))
        scored.sort(key=lambda t: t[0], reverse=True)
        results: List[MemoryRecord] = []
        for score, rec in scored[:k]:
            clone = MemoryRecord(
                id=rec.id,
                content=rec.content,
                kind=rec.kind,
                metadata=dict(rec.metadata),
                ts=rec.ts,
                score=score,
            )
            results.append(clone)
        return results

    # ------------------------------------------------------------------
    # Snapshot helpers (fallback backend only)
    # ------------------------------------------------------------------
    def _snapshot_path(self) -> Optional[Path]:
        if not self.persist_dir:
            return None
        return Path(self.persist_dir) / f"{self.collection_name}.json"

    def _save_snapshot(self) -> None:
        path = self._snapshot_path()
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "records": [asdict(r) for r in self._fallback_records],
            "vectors": self._fallback_vectors,
        }
        path.write_text(json.dumps(payload))

    def _load_snapshot(self) -> None:
        path = self._snapshot_path()
        if path is None or not path.exists():
            return
        try:
            payload = json.loads(path.read_text())
            self._fallback_records = [MemoryRecord(**r) for r in payload.get("records", [])]
            self._fallback_vectors = list(payload.get("vectors", []))
            log.info(f"loaded {len(self._fallback_records)} records from snapshot")
        except Exception as exc:  # noqa: BLE001
            log.warning(f"snapshot load failed: {exc}")


# ----------------------------------------------------------------------
# Math helpers
# ----------------------------------------------------------------------
def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)


def _stringify(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        return str(value)
