# CLAUDE.md — JARVIS Project Conventions

> Loaded automatically by Claude Code on every session.

## Project Overview

JARVIS (Just A Rather Very Intelligent System) — an agentic AI assistant built on DeepSeek R1 7B, fine-tuned with Unsloth, deployed on HuggingFace. Node.js 18 runtime with Python for MCP servers and knowledge graph.

## Architecture

- **Entry point**: `index.js` — boots JARVIS core, loads config, starts interfaces
- **Brain** (`src/brain/`): LLM router, ReAct loop, planner, orchestrator
- **Memory** (`src/memory/`): 4-tier system — working (RAM), episodic (SQLite), semantic (ChromaDB), procedural (JSON)
- **Skills** (`src/skills/`): Modular tool system, each skill has its own `SKILL.md`
- **Personality** (`src/personality/`): JARVIS character wrapper applied to all outputs
- **Interfaces** (`src/interfaces/`): Telegram, CLI, voice
- **Security** (`src/security/`): Injection defense, domain allowlist, plan mode, sandbox
- **Gateway** (`gateway/`): React + Express dashboard on port 4747

## Coding Conventions

- **Language**: JavaScript (Node.js 18+) for core, Python 3.10+ for MCP/ML
- **Modules**: ES module syntax (`import`/`export`) — `"type": "module"` in package.json
- **Async**: Always use `async/await`, never raw callbacks
- **Error handling**: Wrap external calls (Ollama, APIs) in try/catch. Log errors, never crash silently
- **Naming**: camelCase for JS variables/functions, snake_case for Python, UPPER_SNAKE for constants
- **Config**: All secrets via `.env` + `dotenv`. Never hardcode API keys
- **Database**: Use `better-sqlite3` (synchronous). Prepared statements only — never string-concat SQL
- **Logging**: Use `src/utils/logger.js`. Format: `[JARVIS][module] message`

## Forbidden Patterns

- Never use `eval()` or `new Function()` with user input
- Never concatenate user input into SQL queries
- Never fetch URLs not in `ALLOWED_DOMAINS`
- Never write files outside `SANDBOX_DIR`
- Never store plaintext API keys in code or logs
- Never use `console.log` directly — use the logger
- Never install packages without updating package.json

## Testing

- Run `npm test` before committing
- Each module should have basic smoke tests
- Test with `node --test` (built-in Node.js test runner)

## Build Phases

See `TASK.md` for the 4-phase build plan. Complete each phase fully before starting the next.

## Common Commands

```bash
node index.js                    # Start JARVIS core
node index.js --mode telegram    # Start with Telegram interface
node index.js --mode cli         # Start with CLI interface
cd gateway && npm start          # Start Gateway dashboard
node training/dataset/generate.js # Generate training dataset
bash scripts/preflight.sh        # Run preflight checks
```
