#!/usr/bin/env bash
set -euo pipefail

#######################################
# CONFIGURATION
#######################################

GITLAB_URL="${GITLAB_URL:-https://git.adorsys.de/}"
RUNNER_NAME="${RUNNER_NAME:-budget-wise-macos-runner}"
RUNNER_TAGS="${RUNNER_TAGS:-macos,ios,apple}"
CONCURRENT_JOBS=${CONCURRENT_JOBS:-1}

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

#######################################
# PRECHECKS
#######################################

echo "Running prechecks..."

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Error: This script must be run on macOS"
  exit 1
fi

if ! command -v gitlab-runner >/dev/null 2>&1; then
  echo "Error: gitlab-runner is not installed. Try: brew install gitlab-runner"
  exit 1
fi

echo "Prechecks passed"

#######################################
# SECRET INPUT
#######################################

if [[ -z "${RUNNER_TOKEN:-}" ]]; then
  echo "Enter GitLab Runner registration token (input hidden):"
  read -rs RUNNER_TOKEN
  echo ""
fi

if [[ -z "$RUNNER_TOKEN" ]]; then
  echo "Error: Runner token is required"
  exit 1
fi

#######################################
# REGISTER RUNNER
#######################################

CONFIG_FILE="$HOME/.gitlab-runner/config.toml"
mkdir -p "$(dirname "$CONFIG_FILE")"
touch "$CONFIG_FILE"

if grep -q "name = \"$RUNNER_NAME\"" "$CONFIG_FILE"; then
  echo "Runner '$RUNNER_NAME' already exists in config.toml, skipping registration."
else
  echo "Registering GitLab Runner..."
  gitlab-runner register \
    --non-interactive \
    --url "$GITLAB_URL" \
    --token "$RUNNER_TOKEN" \
    --executor "shell" \
    --description "$RUNNER_NAME" \
    --tag-list "$RUNNER_TAGS" \
    --run-untagged="false" \
    --locked="true" \
    --shell "bash" \
    --custom_build_dir-enabled="true"
fi

#######################################
# GLOBAL CONFIG TUNING
#######################################

echo "Optimizing global configuration..."
sed -i '' "s/^concurrent = .*/concurrent = $CONCURRENT_JOBS/" "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

#######################################
# INSTALL / START SERVICE
#######################################

LAUNCH_AGENT="$HOME/Library/LaunchAgents/gitlab-runner.plist"

if [[ -f "$LAUNCH_AGENT" ]]; then
  echo "Runner LaunchAgent already installed, skipping installation."
else
  echo "Installing GitLab Runner as LaunchAgent..."
  if gitlab-runner install --user="$(whoami)"  --working-directory="$HOME"; then
    echo "GitLab Runner installed successfully."
  else
    echo "Runner installation failed, but continuing."
  fi
fi

echo "Starting or restarting runner service..."
gitlab-runner stop 2>/dev/null || true
gitlab-runner start

#######################################
# VERIFY
#######################################

echo "Verifying runner status..."
sleep 2
gitlab-runner verify

if gitlab-runner status 2>&1 | grep -q "Service is running"; then
  echo "GitLab macOS Runner is installed and running."
else
  echo "Runner service installed but may not be running properly."
fi