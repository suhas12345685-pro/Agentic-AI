# Skill: Directive System

## Description
Manages CLAUDE.md and AGENTS.md files to prevent Claude Code from repeating mistakes across sessions.

## Trigger
Active on every Claude Code session via automatic file loading.

## Files
- `CLAUDE.md`: Project conventions, forbidden patterns, bash aliases
- `AGENTS.md`: Sub-agent role definitions
- `src/skills/*/SKILL.md`: Auto-triggered skill definitions

## Phase
All phases
