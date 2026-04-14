# Skill: Temporal Memory

## Description
4-tier memory system providing working (RAM), episodic (SQLite), semantic (ChromaDB), and procedural (JSON) memory.

## Trigger
Automatically engaged on every interaction for context injection and storage.

## Tiers
- **T1 Working**: In-RAM, last 20 turns, instant access
- **T2 Episodic**: SQLite, timestamped conversations
- **T3 Semantic**: ChromaDB, vector similarity search
- **T4 Procedural**: JSON/Python, skills and how-to knowledge

## Phase
P2 — Intelligence
