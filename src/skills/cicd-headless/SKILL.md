# Skill: CI/CD Headless

## Description
GitHub Actions pipeline that auto-fixes CI failures using Claude Code in headless mode.

## Trigger
CI failure events from GitHub Actions.

## Flow
1. GitHub Action detects test/lint/build failure
2. Runs `claude -p "Fix this CI failure: <error>"` in headless mode
3. Claude Code fixes the issue and pushes to the PR branch
4. CI re-runs automatically

## Phase
P4 — Autonomy
