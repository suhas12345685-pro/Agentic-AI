# Self-Improvement Loop

## Purpose
Periodically evaluates JARVIS's own performance by reviewing recent episodic memory, detecting failure patterns, and suggesting concrete improvements.

## How It Works
1. Fetches the last N interactions from episodic memory (SQLite)
2. Sends them to the LLM for reflection using a structured prompt
3. Parses suggestions into typed actions: `prompt_patch`, `skill_config`, `cron_task`
4. Optionally auto-applies safe, reversible changes (controlled by `autoApply` flag)

## Configuration
- `intervalMs` — How often to run (default: 1 hour)
- `autoApply` — Whether to auto-apply suggestions (default: false, requires human approval)
- `maxSuggestionsPerCycle` — Max suggestions per run (default: 3)

## Usage
```js
import SelfImprovementLoop from './src/skills/self-improvement/index.js';

const loop = new SelfImprovementLoop({ memory, intervalMs: 3600000, autoApply: false });
loop.start();

// Run once manually:
const report = await loop.runOnce();
console.log(report.analysis.summary);
```

## Safety
- `autoApply` is off by default — all suggestions are logged for human review
- Prompt patches are written to `.suggestion` sidecar files, not the originals
- Max 3 suggestions per cycle prevents runaway changes
