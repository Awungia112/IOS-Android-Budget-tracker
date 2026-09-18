#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════
# Gate 7 — Manual E2E Test Runner
#
# Orchestrates the full legacy shared-account permission
# migration manual E2E test against the local Compose stack.
#
# Usage:
#   ./scripts/run-gate7-e2e.sh              # Full run
#   ./scripts/run-gate7-e2e.sh --skip-docker  # Skip docker start (if already running)
# ═══════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EVIDENCE_FILE="$PROJECT_DIR/docs/online-accounts/gate7-manual-e2e-output.md"

echo '══════════════════════════════════════════════'
echo '  GATE 7 MANUAL E2E TEST RUNNER'
echo '  Budget Wise PWA — Legacy Shared-Account'
echo '  Permission Migration'
echo '══════════════════════════════════════════════'
echo ''
echo "Project dir: $PROJECT_DIR"
echo "Date: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ''

# ── Pre-flight checks ──

if ! command -v docker &> /dev/null; then
  echo '❌ Docker is required but not found.'
  exit 1
fi

if ! docker version &> /dev/null; then
  echo '❌ Docker daemon is not running.'
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo '❌ Node.js is required but not found.'
  exit 1
fi

# ── Install dependencies if needed ──

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo '→ Installing dependencies...'
  cd "$PROJECT_DIR" && pnpm install
  echo '✓ Dependencies installed'
fi

# ── Check for existing Docker container conflicts ──

EXISTING=$(docker ps -a --filter 'name=budget-wise-gate7-e2e' --format '{{.Names}}' 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
  echo "→ Cleaning up existing container: $EXISTING"
  docker rm -f "$EXISTING" 2>/dev/null || true
fi

# ── Run the E2E test ──

echo '→ Running Gate 7 manual E2E test...'
echo ''

cd "$PROJECT_DIR"

# Run with the root vitest config, which includes scripts/**/*.test.ts
npx vitest run scripts/gate7-manual-e2e.test.ts \
  --config vitest.config.ts \
  --reporter verbose 2>&1

EXIT_CODE=$?

echo ''
echo '══════════════════════════════════════════════'

if [ $EXIT_CODE -eq 0 ]; then
  echo '  ✅ GATE 7 MANUAL E2E TEST PASSED'
  echo ''
  if [ -f "$EVIDENCE_FILE" ]; then
    echo "  Evidence report: $EVIDENCE_FILE"
    echo ''
    echo '  SQL evidence can be viewed by connecting to the'
    echo '  PostgreSQL database at 127.0.0.1:55432'
    echo '  (credentials: budget/budget, database: budget)'
  fi
else
  echo '  ❌ GATE 7 MANUAL E2E TEST FAILED'
  echo '  Check the output above for details.'
fi

echo '══════════════════════════════════════════════'
exit $EXIT_CODE
