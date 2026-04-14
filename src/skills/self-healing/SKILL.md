# Skill: Self-Healing

## Description
4-layer reliability system ensuring JARVIS runs 24/7 without human supervision.

## Trigger
Automatic — runs continuously in the background.

## Layers
- **Layer 0 (Preflight)**: Validates environment variables before start
- **Layer 1 (OS-Level)**: systemd/Task Scheduler restarts on crash
- **Layer 2 (Watchdog)**: Cron checks log freshness every 3 min, kills stalled processes
- **Layer 3 (Guardian)**: Detects expired tokens, revoked permissions, alerts user

## Phase
P3 — Awareness
