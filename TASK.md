# TASK.md — JARVIS Build Phases

> Claude Code build instructions. Execute one phase at a time.

---

## Phase 1 — Foundation

### Tasks
1. Create project structure (dirs, package.json, .env.example)
2. Build LLM router (`src/brain/llm-router.js`) — routes to DeepSeek R1 / Qwen / HuggingFace
3. Build personality wrapper (`src/personality/wrapper.js`) — JARVIS character on all outputs
4. Build Telegram interface (`src/interfaces/telegram.js`) — basic message handling
5. Build working memory (`src/memory/working.js`) — in-RAM, last 20 turns
6. Build entry point (`index.js`) — loads config, boots brain, starts interfaces
7. Generate training dataset (`training/dataset/generate.js`) — 1,000 JARVIS conversations in Alpaca format

### Success Criteria
- [x] `node index.js --mode cli` starts without errors
- [x] LLM router classifies queries and routes to correct model
- [x] JARVIS personality applied to all responses
- [x] Working memory retains last 20 turns
- [x] Dataset generator produces 1,000 valid JSON examples

---

## Phase 2 — Intelligence

### Tasks
1. Build episodic memory (`src/memory/episodic.js`) — SQLite storage
2. Build semantic memory (`src/memory/semantic.js`) — ChromaDB + embeddings
3. Build procedural memory (`src/memory/procedural.js`) — skill/tool knowledge
4. Build ReAct loop (`src/brain/react-loop.js`) — Observe → Think → Act → Repeat
5. Build web search skill (`src/skills/web-search/`)
6. Build code execution skill (`src/skills/code-exec/`)
7. Build RAG engine (`src/skills/rag-engine/`)
8. Build MCP server skill (`src/skills/mcp-server/`)

### Success Criteria
- [x] All 4 memory tiers functional and tested
- [x] ReAct loop completes multi-step tasks
- [x] Web search returns grounded results
- [x] Code execution runs in sandbox safely
- [x] RAG engine retrieves relevant context from documents

---

## Phase 3 — Awareness

### Tasks
1. Build screen vision (`src/skills/screen-vision/`) — screenshot + LLaVA
2. Build voice pipeline (`src/skills/voice-pipeline/`) — Deepgram STT → LLM → ElevenLabs TTS
3. Build system monitor (`src/skills/system-monitor/`)
4. Build proactive cron (`src/skills/proactive-cron/`) — scheduled autonomous tasks
5. Build Gateway UI (`gateway/`) — React + Express dashboard
6. Build self-healing watchdog (`src/skills/self-healing/`)
7. Build security guard (`src/security/`) — injection defense + sandboxing

### Success Criteria
- [x] Screen vision captures and describes screen content
- [x] Voice pipeline processes speech end-to-end
- [x] Gateway dashboard opens at localhost:4747
- [x] Watchdog detects and recovers from crashes
- [x] Security guard blocks injection attempts

---

## Phase 4 — Autonomy

### Tasks
1. Build long-horizon planner (`src/brain/planner.js`)
2. Build browser automation skill (`src/skills/browser-auto/`)
3. Build multi-agent system (`src/skills/multi-agent/`)
4. Build CI/CD headless pipeline (`src/skills/cicd-headless/`)
5. Build self-improvement loop
6. Build HuggingFace deployment (`deploy/hf_space/`)

### Success Criteria
- [x] Planner breaks complex goals into executable sub-tasks
- [x] Browser automation completes multi-page workflows
- [x] Multi-agent system coordinates specialist sub-agents
- [x] CI/CD pipeline auto-fixes failures
- [x] Self-improvement loop analyses episodic memory and generates typed suggestions
- [x] HuggingFace deployment serves model via API

---

## Phase 5 — Cross-Domain Intelligence (CDKT Framework)

### Overview
A framework for interdisciplinary knowledge transfer, collaboration, and innovation synthesis.
Enables JARVIS to approach problems from multiple domain perspectives simultaneously.

### Components
1. `src/skills/cdkt/domain-registry.js` — 8 pre-seeded domains with principles, methodologies, concepts, analogies
2. `src/skills/cdkt/cross-domain-mapper.js` — Relevance scoring + 10 universal structural patterns
3. `src/skills/cdkt/knowledge-synthesizer.js` — Multi-domain principle extraction + strategy generation
4. `src/skills/cdkt/collaboration-engine.js` — Specialist → Devil's Advocate → Mediator council pipeline
5. `src/skills/cdkt/index.js` — SkillExecutor integration: `cdkt_map`, `cdkt_synthesise`, `cdkt_council`

### Skills Added
| Skill | Description |
|---|---|
| `cdkt_map` | Fast zero-LLM domain relevance map and pattern detection |
| `cdkt_synthesise` | Multi-domain solution strategy synthesis (3–5 LLM calls) |
| `cdkt_council` | Full Innovation Report via interdisciplinary council (8–12 LLM calls) |

### Success Criteria
- [x] DomainRegistry stores and searches 8 seeded domains
- [x] CrossDomainMapper scores relevance and detects 10 universal patterns
- [x] KnowledgeSynthesizer extracts principles and generates ranked strategies
- [x] CollaborationEngine runs Specialist → Devil's Advocate → Mediator pipeline
- [x] All three CDKT skills registered in SkillExecutor and routed in Orchestrator
- [x] `cdkt_map` returns domain relevance without any LLM calls
- [x] `cdkt_council` outputs structured Innovation Report in markdown
