#!/bin/bash
# JARVIS Preflight — Layer 0 Self-Healing
# Validates all required environment variables and dependencies before JARVIS starts.

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "==========================================="
echo "   JARVIS Preflight Check"
echo "==========================================="

ERRORS=0

check() {
  local label="$1"
  local condition="$2"
  if eval "$condition"; then
    echo -e "  ${GREEN}\u2713${NC} $label"
  else
    echo -e "  ${RED}\u2717${NC} $label"
    ERRORS=$((ERRORS + 1))
  fi
}

warn() {
  local label="$1"
  local condition="$2"
  if eval "$condition"; then
    echo -e "  ${GREEN}\u2713${NC} $label"
  else
    echo -e "  ${YELLOW}!${NC} $label (optional, skipped)"
  fi
}

# Node.js version
check "Node.js 18+ installed" "node -v | grep -E 'v(1[89]|[2-9][0-9])' >/dev/null"

# Python version
check "Python 3.10+ installed" "python3 --version | grep -E 'Python 3\.(1[0-9]|[2-9][0-9])' >/dev/null"

# Required directories
check "data/ directory exists" "[ -d data ]"
check "tmp/sandbox/ directory exists" "[ -d tmp/sandbox ]"

# Required files
check ".env file exists" "[ -f .env ]"
check "package.json exists" "[ -f package.json ]"
check "node_modules/ installed" "[ -d node_modules ]"

# Optional services
warn "Ollama running" "curl -s http://localhost:11434/api/tags >/dev/null 2>&1"
warn "ChromaDB available" "command -v chroma >/dev/null 2>&1"

# Environment variables (warn only — they may be intentionally empty in dev)
if [ -f .env ]; then
  source .env
  warn "TELEGRAM_BOT_TOKEN set" "[ -n \"\$TELEGRAM_BOT_TOKEN\" ]"
  warn "BRAVE_SEARCH_API_KEY set" "[ -n \"\$BRAVE_SEARCH_API_KEY\" ]"
fi

echo "==========================================="

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}Preflight failed: $ERRORS error(s)${NC}"
  exit 1
fi

echo -e "${GREEN}Preflight passed. JARVIS is cleared for takeoff.${NC}"
exit 0
