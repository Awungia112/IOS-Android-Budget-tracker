#!/bin/bash
set -e

# Called by release-it's after:bump hook.
# Reads the version from root package.json (already bumped by release-it)
# and syncs it to all monorepo packages and android build config.

VERSION=$(node -p "require('./package.json').version")

echo "Syncing version $VERSION across monorepo..."

# Sync packages/app/package.json
node -e "
const fs = require('fs');
const path = 'packages/app/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
console.log('  Updated ' + path);
"

# Sync packages/core/package.json
node -e "
const fs = require('fs');
const path = 'packages/core/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
console.log('  Updated ' + path);
"

# Sync android/app/build.gradle
GRADLE_FILE="android/app/build.gradle"

# Use OS-appropriate sed -i flag (BSD on macOS, GNU on Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
  SED_INPLACE=(-i '')
else
  SED_INPLACE=(-i)
fi

# Update versionName fallback in the ternary expression
# Matches: versionName project.hasProperty('VERSION_NAME') ? VERSION_NAME : "3.3.2"
sed "${SED_INPLACE[@]}" \
  "s/versionName project.hasProperty('VERSION_NAME') ? VERSION_NAME : \"[^\"]*\"/versionName project.hasProperty('VERSION_NAME') ? VERSION_NAME : \"$VERSION\"/" \
  "$GRADLE_FILE"

# Increment versionCode fallback in the ternary expression
# Matches: versionCode project.hasProperty('VERSION_CODE') ? VERSION_CODE.toInteger() : 147
CURRENT_CODE=$(grep 'versionCode project.hasProperty' "$GRADLE_FILE" | grep -oE '[0-9]+' | tail -1)
NEW_CODE=$((CURRENT_CODE + 1))
sed "${SED_INPLACE[@]}" \
  "s/versionCode project.hasProperty('VERSION_CODE') ? VERSION_CODE.toInteger() : $CURRENT_CODE/versionCode project.hasProperty('VERSION_CODE') ? VERSION_CODE.toInteger() : $NEW_CODE/" \
  "$GRADLE_FILE"

echo "  Updated $GRADLE_FILE (versionName=$VERSION, versionCode=$NEW_CODE)"

# Stage synced files so release-it includes them in the release commit
git add packages/app/package.json packages/core/package.json android/app/build.gradle

echo "Version sync complete."
