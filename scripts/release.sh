#!/bin/bash
set -e

# Wrapper around release-it that automatically passes the correct --preRelease
# flag based on the current git branch.
#
# Branch → Tag format:
#   main    → vX.Y.Z          (production)
#   qa      → vX.Y.Z-qa.N    (QA TestFlight)
#   develop → vX.Y.Z-test.N  (staging TestFlight)
#
# Passes any additional arguments through to release-it (e.g. --dry-run, minor, major).

BRANCH=$(git branch --show-current)
ARGS=("$@")

case "$BRANCH" in
  main)
    PRE_RELEASE_FLAG=""
    echo "[release] Branch: main → production release (no suffix)"
    ;;
  qa)
    PRE_RELEASE_FLAG="--preRelease=qa"
    echo "[release] Branch: qa → pre-release with -qa suffix"
    ;;
  develop)
    PRE_RELEASE_FLAG="--preRelease=test"
    echo "[release] Branch: develop → pre-release with -test suffix"
    ;;
  *)
    echo "[release] ERROR: Release is only allowed from main, qa, or develop branches."
    echo "[release] Current branch: $BRANCH"
    exit 1
    ;;
esac

# Run release-it with the appropriate pre-release flag.
# Additional arguments (e.g. --dry-run, minor, major) are forwarded.
exec npx release-it ${PRE_RELEASE_FLAG} "${ARGS[@]}"
