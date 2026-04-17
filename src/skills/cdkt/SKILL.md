# CDKT — Cross-Domain Knowledge Transfer Framework

## Purpose

Applies structured interdisciplinary reasoning to complex problems by:
1. Mapping which knowledge domains are most relevant
2. Identifying universal structural patterns that recur across fields
3. Synthesising novel solution strategies that borrow from multiple domains
4. Running a virtual interdisciplinary council that produces a formal Innovation Report

## Architecture

```
DomainRegistry          ← 8 pre-seeded domains (biology, physics, economics,
                          computer-science, psychology, engineering,
                          philosophy, mathematics) + custom domain support

CrossDomainMapper       ← Scores domain relevance, detects 10 universal
                          structural patterns, builds pairwise analogy bridges

KnowledgeSynthesizer    ← Extracts applicable principles per domain,
                          generates 1–3 ranked synthesis strategies

CollaborationEngine     ← Specialist → Devil's Advocate → Mediator pipeline
                          Outputs: Innovation Report (JSON + Markdown)
```

## Skills Registered

| Skill | Speed | LLM calls | Best for |
|---|---|---|---|
| `cdkt_map` | Fast | 0 | Quick scan of which domains apply |
| `cdkt_synthesise` | Medium | 3–5 | Solution strategy generation |
| `cdkt_council` | Thorough | 8–12 | Full innovation report |

## Usage

```js
// Via SkillExecutor
const result = await executor.execute('cdkt_map', 'How do we scale a distributed database?');
const strategy = await executor.execute('cdkt_synthesise', 'Reduce employee burnout in remote teams');
const report = await executor.execute('cdkt_council', 'Design a resilient urban food system');

// JSON args for council (optional)
const report2 = await executor.execute('cdkt_council',
  JSON.stringify({ problem: 'Reduce traffic congestion', domains: 4 })
);

// Direct API
import { getCDKT } from './cdkt/index.js';
const { registry, mapper, synthesizer, engine } = getCDKT();

// Register a custom domain
registry.register({
  id: 'neuroscience',
  name: 'Neuroscience',
  description: 'Study of the nervous system and brain function',
  core_principles: ['Hebbian learning: neurons that fire together wire together'],
  methodologies: ['fMRI', 'electrophysiology', 'lesion studies'],
  key_concepts: ['plasticity', 'synapse', 'neural pathway', 'cognitive load'],
  analogies: [{ target: 'computer-science', bridge: 'neural nets mirror biological neurons' }],
});
```

## Universal Patterns

Ten structural patterns are pre-loaded and matched against any problem:

1. **Feedback Loop** — self-regulation via output → input
2. **Emergence** — complex behaviour from simple local interactions
3. **Optimisation Under Constraint** — maximise/minimise subject to limits
4. **Modularity** — composable independent units
5. **Phase Transition** — threshold-triggered qualitative shift
6. **Natural Selection / Evolutionary Search** — iterative variation + selection
7. **Redundancy for Resilience** — duplicate critical paths
8. **Abstraction Hierarchy** — progressive information hiding
9. **Incentive Alignment** — design rewards to align individual and collective goals
10. **Scale-Free Power Laws** — a few nodes account for most impact

## Output Formats

### `cdkt_map` → plain text
```
Top domains:
  • Engineering (score 6) — keywords: system, failure, feedback
  • Biology (score 4) — keywords: resilience, feedback
...
```

### `cdkt_synthesise` → markdown
```
## Interdisciplinary Synthesis Report
**Primary Strategy:** Adaptive Resilience Engine
**Core Insight:** ...
**Domain contributions:**
  • [Engineering] Design redundant failure pathways
  • [Biology] Apply homeostatic regulation principles
...
```

### `cdkt_council` → full Innovation Report (markdown)
```
# JARVIS Innovation Council Report
## Executive Summary
## Key Decisions
## Interdisciplinary Innovations
## Implementation Roadmap
## Risk Matrix
## Success Metrics
```
