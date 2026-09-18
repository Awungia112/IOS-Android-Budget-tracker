#!/bin/bash
set -e

# Creates a test tag from any branch for CI testing.
# Test tags trigger: build:mobile + package:android + package:ios:simulator + package:ios (TestFlight)
# No version bump, no changelog, no GitLab release.

VERSION=$(node -p "require('./package.json').version")
TIMESTAMP=$(date +%Y%m%d%H%M%S)
TAG="v${VERSION}-test.${TIMESTAMP}"

echo "Creating test tag: $TAG"
echo "Branch: $(git branch --show-current)"
echo ""

git tag "$TAG"
git push origin "$TAG"

echo ""
echo "Test tag $TAG pushed successfully."
echo "CI will build: APK + simulator .app + signed .ipa (TestFlight)"
