# AGENTS.md — JARVIS Sub-Agent Role Definitions

> Used by Claude Code for multi-agent orchestration.

## Agent Roles

### Research Agent
- **Role**: Gather information from the web, documentation, and codebase
- **Capabilities**: Web search, file reading, documentation parsing
- **Trigger**: Questions requiring external knowledge or codebase exploration
- **Output**: Structured findings with sources

### Code Agent
- **Role**: Write, modify, and debug code across the JARVIS codebase
- **Capabilities**: File creation/editing, test writing, dependency management
- **Trigger**: Implementation tasks, bug fixes, feature additions
- **Output**: Working code with inline comments where logic is non-obvious

### File Agent
- **Role**: Manage project structure, configuration, and deployment files
- **Capabilities**: File operations, directory management, config generation
- **Trigger**: Project scaffolding, config changes, file reorganization
- **Output**: Clean file structure following project conventions

### Analysis Agent
- **Role**: Review code quality, architecture decisions, and performance
- **Capabilities**: Code review, dependency audit, architecture analysis
- **Trigger**: Pre-commit review, performance investigation, refactoring decisions
- **Output**: Actionable findings with priority levels

## Coordination Rules

1. Each agent works within its defined scope
2. Agents pass structured messages, not raw data
3. The orchestrator (src/brain/orchestrator.js) routes tasks to appropriate agents
4. All agents respect CLAUDE.md conventions
5. No agent modifies files outside its designated directories without orchestrator approval
