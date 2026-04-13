# JARVIS — Agentic AI System

> *"Sometimes you gotta run before you can walk."* — Tony Stark

A hyper-capable, open-source agentic AI assistant built on DeepSeek R1 7B, fine-tuned with Unsloth, and deployed on HuggingFace. Designed to reason, remember, and act.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Core Components](#core-components)
- [Memory System](#memory-system)
- [LLM Router](#llm-router)
- [Skill Modules](#skill-modules)
- [Deployment](#deployment)
- [Setup](#setup)
- [Roadmap](#roadmap)

---

## System Architecture

```
USER INPUT (Telegram / Voice / CLI)
          │
          ▼
┌─────────────────────┐
│   INPUT PROCESSOR   │  ← Intent classification, context injection
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│   COGNITIVE BRAIN   │  ← ReAct loop: Reason → Act → Observe → Repeat
│   (LLM Router)      │
└─────────────────────┘
     │         │
     ▼         ▼
┌─────────┐ ┌──────────────┐
│ MEMORY  │ │  SKILL AGENT │  ← Tool execution
│ ENGINE  │ │  DISPATCHER  │
└─────────┘ └──────────────┘
     │              │
     ▼              ▼
┌─────────────────────┐
│   RESPONSE BUILDER  │  ← JARVIS personality layer
└─────────────────────┘
          │
          ▼
     USER OUTPUT
```

---

## Core Components

### 1. Intelligence Brain (LLM Router)

Routes every query to the most capable model for the task:

| Task Type | Model Used | Why |
|---|---|---|
| Complex reasoning | DeepSeek R1 7B (local) | Best open-source LRM |
| Quick responses | Qwen 2.5 3B (local) | Fast, lightweight |
| Code generation | DeepSeek Coder | Specialized |
| Fallback | HuggingFace API | When local fails |

### 2. Cognitive Brain (ReAct Loop)

```
OBSERVE → THINK → ACT → OBSERVE → THINK → ACT → ...
```

The ReAct (Reasoning + Acting) loop gives JARVIS the ability to:
- Break complex tasks into sub-tasks
- Use tools mid-reasoning
- Self-correct when a tool returns unexpected results
- Know when to stop and respond

### 3. Personality Layer

JARVIS responds with:
- British wit and dry humor
- Unwavering loyalty to the user
- Confidence without arrogance
- Addresses user as "Sir" by default

---

## Memory System

Four-tier memory architecture:

```
TIER 1: Working Memory (RAM)
└── Current conversation context (last 20 turns)

TIER 2: Episodic Memory (SQLite)
└── Past conversations, timestamped, searchable

TIER 3: Semantic Memory (ChromaDB)
└── Facts, knowledge, embeddings — vector search

TIER 4: Procedural Memory (JSON/Python)
└── Skills, tools, how-to knowledge
```

Every response is automatically stored and retrievable.

---

## LLM Router

```python
def route_query(query: str) -> str:
    if is_complex_reasoning(query):
        return call_deepseek_r1(query)
    elif is_code_task(query):
        return call_deepseek_coder(query)
    elif is_simple_qa(query):
        return call_qwen_fast(query)
    else:
        return call_huggingface_api(query)
```

---

## Skill Modules

| Skill | What it does | Status |
|---|---|---|
| Web search | Real-time internet search | ✅ v1 |
| File read/write | Read, edit, create files | ✅ v1 |
| Code execution | Run Python scripts | ✅ v1 |
| Screen vision | See your screen | 🔄 v2 |
| Voice pipeline | STT → LLM → TTS | 🔄 v2 |
| Browser control | Automate web tasks | 🔄 v2 |
| System control | Launch apps, control PC | 🔄 v3 |
| Payment (x402) | Crypto micro-payments | 🔄 v4 |

---

## Deployment

### Local (Ollama)
```bash
ollama pull deepseek-r1:7b
python jarvis.py --mode local
```

### HuggingFace Spaces
```bash
git push huggingface main
# Auto-deploys on push
```

### Telegram Bot
```bash
export TELEGRAM_TOKEN=your_token
python jarvis.py --mode telegram
```

---

## Setup

```bash
# Clone the repo
git clone https://github.com/suhas12345685-pro/Jarvis
cd Jarvis

# Install dependencies
npm install        # Node.js modules
pip install -r requirements.txt   # Python modules

# Configure
cp .env.example .env
# Add your API keys to .env

# Run
node index.js
```

### Requirements
- Node.js 18+
- Python 3.10+
- Ollama (for local LLM)
- 8GB+ RAM
- 10GB+ free disk space

---

## Fine-tuning (Unsloth + Colab)

1. Open `training/finetune.ipynb` in Google Colab
2. Select T4 GPU runtime (free)
3. Run all cells
4. Model auto-uploads to HuggingFace

Dataset format:
```json
{
  "instruction": "What is the weather like?",
  "input": "",
  "output": "Checking atmospheric conditions, Sir. Current temperature in Hyderabad is 38°C with clear skies. Might I suggest staying hydrated."
}
```

---

## Roadmap

### Phase 1 — Foundation (Now)
- [x] Node.js architecture
- [x] Telegram interface
- [x] Basic LLM routing
- [ ] Dataset creation (1,000 JARVIS conversations)
- [ ] Unsloth fine-tune on Colab
- [ ] HuggingFace deployment

### Phase 2 — Intelligence (Month 2)
- [ ] 4-tier memory system
- [ ] ReAct reasoning loop
- [ ] Web search skill
- [ ] Code execution skill

### Phase 3 — Awareness (Month 3)
- [ ] Screen vision (screenshot-desktop)
- [ ] Voice pipeline (STT→LLM→TTS)
- [ ] System state monitoring
- [ ] Location awareness

### Phase 4 — Autonomy (Month 4+)
- [ ] Long-horizon planning
- [ ] Browser automation
- [ ] Multi-agent orchestration
- [ ] Open-source release

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18 |
| LLM (local) | Ollama + DeepSeek R1 7B |
| Fine-tuning | Unsloth + Google Colab |
| Vector DB | ChromaDB |
| Relational DB | SQLite |
| Knowledge graph | NetworkX |
| Messaging | Telegram Bot API |
| Hosting | HuggingFace Spaces |
| Voice | VB-Cable + faster-whisper |

---

## License

MIT — free to use, modify, and distribute.

---

*Built by Suhas, age 14, Hyderabad, India.*  
*"With great power comes great responsibility."*


# JARVIS — Agentic AI System

> *"Sometimes you gotta run before you can walk."* — Tony Stark

A hyper-capable, open-source agentic AI assistant built on DeepSeek R1 7B, fine-tuned with Unsloth, and deployed on HuggingFace. Designed to reason, remember, and act.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Core Components](#core-components)
- [Memory System](#memory-system)
- [LLM Router](#llm-router)
- [Skill Modules](#skill-modules)
- [Deployment](#deployment)
- [Setup](#setup)
- [Roadmap](#roadmap)

---

## System Architecture

```
USER INPUT (Telegram / Voice / CLI)
          │
          ▼
┌─────────────────────┐
│   INPUT PROCESSOR   │  ← Intent classification, context injection
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│   COGNITIVE BRAIN   │  ← ReAct loop: Reason → Act → Observe → Repeat
│   (LLM Router)      │
└─────────────────────┘
     │         │
     ▼         ▼
┌─────────┐ ┌──────────────┐
│ MEMORY  │ │  SKILL AGENT │  ← Tool execution
│ ENGINE  │ │  DISPATCHER  │
└─────────┘ └──────────────┘
     │              │
     ▼              ▼
┌─────────────────────┐
│   RESPONSE BUILDER  │  ← JARVIS personality layer
└─────────────────────┘
          │
          ▼
     USER OUTPUT
```

---

## Core Components

### 1. Intelligence Brain (LLM Router)

Routes every query to the most capable model for the task:

| Task Type | Model Used | Why |
|---|---|---|
| Complex reasoning | DeepSeek R1 7B (local) | Best open-source LRM |
| Quick responses | Qwen 2.5 3B (local) | Fast, lightweight |
| Code generation | DeepSeek Coder | Specialized |
| Fallback | HuggingFace API | When local fails |

### 2. Cognitive Brain (ReAct Loop)

```
OBSERVE → THINK → ACT → OBSERVE → THINK → ACT → ...
```

The ReAct (Reasoning + Acting) loop gives JARVIS the ability to:
- Break complex tasks into sub-tasks
- Use tools mid-reasoning
- Self-correct when a tool returns unexpected results
- Know when to stop and respond

### 3. Personality Layer

JARVIS responds with:
- British wit and dry humor
- Unwavering loyalty to the user
- Confidence without arrogance
- Addresses user as "Sir" by default

---

## Memory System

Four-tier memory architecture:

```
TIER 1: Working Memory (RAM)
└── Current conversation context (last 20 turns)

TIER 2: Episodic Memory (SQLite)
└── Past conversations, timestamped, searchable

TIER 3: Semantic Memory (ChromaDB)
└── Facts, knowledge, embeddings — vector search

TIER 4: Procedural Memory (JSON/Python)
└── Skills, tools, how-to knowledge
```

Every response is automatically stored and retrievable.

---

## LLM Router

```python
def route_query(query: str) -> str:
    if is_complex_reasoning(query):
        return call_deepseek_r1(query)
    elif is_code_task(query):
        return call_deepseek_coder(query)
    elif is_simple_qa(query):
        return call_qwen_fast(query)
    else:
        return call_huggingface_api(query)
```

---

## Skill Modules

| Skill | What it does | Status |
|---|---|---|
| Web search | Real-time internet search | ✅ v1 |
| File read/write | Read, edit, create files | ✅ v1 |
| Code execution | Run Python scripts | ✅ v1 |
| Screen vision | See your screen | 🔄 v2 |
| Voice pipeline | STT → LLM → TTS | 🔄 v2 |
| Browser control | Automate web tasks | 🔄 v2 |
| System control | Launch apps, control PC | 🔄 v3 |
| Payment (x402) | Crypto micro-payments | 🔄 v4 |

---

## Deployment

### Local (Ollama)
```bash
ollama pull deepseek-r1:7b
python jarvis.py --mode local
```

### HuggingFace Spaces
```bash
git push huggingface main
# Auto-deploys on push
```

### Telegram Bot
```bash
export TELEGRAM_TOKEN=your_token
python jarvis.py --mode telegram
```

---

## Setup

```bash
# Clone the repo
git clone https://github.com/suhas12345685-pro/Jarvis
cd Jarvis

# Install dependencies
npm install        # Node.js modules
pip install -r requirements.txt   # Python modules

# Configure
cp .env.example .env
# Add your API keys to .env

# Run
node index.js
```

### Requirements
- Node.js 18+
- Python 3.10+
- Ollama (for local LLM)
- 8GB+ RAM
- 10GB+ free disk space

---

## Fine-tuning (Unsloth + Colab)

1. Open `training/finetune.ipynb` in Google Colab
2. Select T4 GPU runtime (free)
3. Run all cells
4. Model auto-uploads to HuggingFace

Dataset format:
```json
{
  "instruction": "What is the weather like?",
  "input": "",
  "output": "Checking atmospheric conditions, Sir. Current temperature in Hyderabad is 38°C with clear skies. Might I suggest staying hydrated."
}
```

---

## Roadmap

### Phase 1 — Foundation (Now)
- [x] Node.js architecture
- [x] Telegram interface
- [x] Basic LLM routing
- [ ] Dataset creation (1,000 JARVIS conversations)
- [ ] Unsloth fine-tune on Colab
- [ ] HuggingFace deployment

### Phase 2 — Intelligence (Month 2)
- [ ] 4-tier memory system
- [ ] ReAct reasoning loop
- [ ] Web search skill
- [ ] Code execution skill

### Phase 3 — Awareness (Month 3)
- [ ] Screen vision (screenshot-desktop)
- [ ] Voice pipeline (STT→LLM→TTS)
- [ ] System state monitoring
- [ ] Location awareness

### Phase 4 — Autonomy (Month 4+)
- [ ] Long-horizon planning
- [ ] Browser automation
- [ ] Multi-agent orchestration
- [ ] Open-source release

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18 |
| LLM (local) | Ollama + DeepSeek R1 7B |
| Fine-tuning | Unsloth + Google Colab |
| Vector DB | ChromaDB |
| Relational DB | SQLite |
| Knowledge graph | NetworkX |
| Messaging | Telegram Bot API |
| Hosting | HuggingFace Spaces |
| Voice | VB-Cable + faster-whisper |

---

## License

MIT — free to use, modify, and distribute.

---
