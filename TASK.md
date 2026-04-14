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
- [ ] `node index.js --mode cli` starts without errors
- [ ] LLM router classifies queries and routes to correct model
- [ ] JARVIS personality applied to all responses
- [ ] Working memory retains last 20 turns
- [ ] Dataset generator produces 1,000 valid JSON examples

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
- [ ] All 4 memory tiers functional and tested
- [ ] ReAct loop completes multi-step tasks
- [ ] Web search returns grounded results
- [ ] Code execution runs in sandbox safely
- [ ] RAG engine retrieves relevant context from documents

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
- [ ] Screen vision captures and describes screen content
- [ ] Voice pipeline processes speech end-to-end
- [ ] Gateway dashboard opens at localhost:4747
- [ ] Watchdog detects and recovers from crashes
- [ ] Security guard blocks injection attempts

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
- [ ] Planner breaks complex goals into executable sub-tasks
- [ ] Browser automation completes multi-page workflows
- [ ] Multi-agent system coordinates specialist sub-agents
- [ ] CI/CD pipeline auto-fixes failures
- [ ] HuggingFace deployment serves model via API
