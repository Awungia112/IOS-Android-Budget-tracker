#!/usr/bin/env bash
# Gate 5 evidence collector
# Runs unit + integration tests and saves output to evidence.txt
set -e

EVIDENCE="gate5-evidence.txt"

echo "════════════════════════════════════════════════" | tee "$EVIDENCE"
echo "  Gate 5: Legacy Online-Account Detection" | tee -a "$EVIDENCE"
echo "  $(date)" | tee -a "$EVIDENCE"
echo "════════════════════════════════════════════════" | tee -a "$EVIDENCE"

echo "" | tee -a "$EVIDENCE"
echo ">>> Running unit tests (52 tests, 15 for detectOnlineAccount)..." | tee -a "$EVIDENCE"
npx vitest run packages/core/src/migration/migration.service.test.ts --reporter verbose 2>&1 | tee -a "$EVIDENCE"

echo "" | tee -a "$EVIDENCE"
echo ">>> Running integration tests (9 tests)..." | tee -a "$EVIDENCE"
npx vitest run --config vitest.integration.config.ts \
  packages/core/src/migration/__integration__tests__/migration.integration.test.ts \
  --reporter verbose 2>&1 | tee -a "$EVIDENCE"

echo "" | tee -a "$EVIDENCE"
echo "════════════════════════════════════════════════" | tee -a "$EVIDENCE"
echo "  DONE — Evidence saved to $EVIDENCE" | tee -a "$EVIDENCE"
echo "  Attach this file to the ticket." | tee -a "$EVIDENCE"
echo "════════════════════════════════════════════════" | tee -a "$EVIDENCE"
