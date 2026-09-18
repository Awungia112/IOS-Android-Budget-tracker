#!/bin/bash

# ==========================================================
# Mac Mini Build Station Setup
# TICKET-101: Install Development Tools and Dependencies
# ==========================================================
# This script installs all required tools for iOS CI/CD.
# Only Xcode configuration requires admin (sudo) access.
# ==========================================================

set -e  # Exit on error

NODE_VER="node@22"
XCODE_ID="497799835"
CAPACITOR_VER="8.0.0"

echo ""
echo "=========================================="
echo "  Mac Mini Build Station Setup"
echo "=========================================="
echo ""

# ==========================================================
# PHASE 1: Homebrew (No sudo required)
# ==========================================================
echo "[1/6] Checking Homebrew..."

if ! command -v brew &> /dev/null; then
    echo "  Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "  Homebrew already installed"
fi

# Detect architecture and set brew path
if [[ "$(uname -m)" == "arm64" ]]; then
    BREW_PATH="/opt/homebrew/bin/brew"
else
    BREW_PATH="/usr/local/bin/brew"
fi

# Add brew to current session
eval "$($BREW_PATH shellenv)"

# Persist brew to shell profile
BREW_ENV_CMD="eval \"\$($BREW_PATH shellenv)\""
if ! grep -qF "$BREW_ENV_CMD" ~/.zprofile 2>/dev/null; then
    echo "$BREW_ENV_CMD" >> ~/.zprofile
    echo "  Added Homebrew to ~/.zprofile"
fi

# ==========================================================
# PHASE 2: Install Tools via Homebrew (No sudo required)
# ==========================================================
echo ""
echo "[2/6] Installing development tools via Homebrew..."

brew install "$NODE_VER" gitlab-runner fastlane mas

echo "  Installed: node@20, gitlab-runner, fastlane, mas"

# ==========================================================
# PHASE 3: Configure Node.js PATH (No sudo required)
# ==========================================================
echo ""
echo "[3/6] Configuring Node.js PATH..."

# node@20 is keg-only, add to PATH instead of linking
NODE_BIN="$(brew --prefix "$NODE_VER")/bin"
NODE_PATH_CMD="export PATH=\"$NODE_BIN:\$PATH\""

if ! grep -qF "$NODE_PATH_CMD" ~/.zshrc 2>/dev/null; then
    echo "$NODE_PATH_CMD" >> ~/.zshrc
    echo "  Added Node.js to ~/.zshrc"
fi

export PATH="$NODE_BIN:$PATH"

# ==========================================================
# PHASE 4: Configure npm for user-level global installs (No sudo)
# ==========================================================
echo ""
echo "[4/6] Configuring npm for user-level global installs..."

mkdir -p ~/.npm-global
npm config set prefix "$HOME/.npm-global"

NPM_PATH_CMD='export PATH="$HOME/.npm-global/bin:$PATH"'
if ! grep -qF "$NPM_PATH_CMD" ~/.zshrc 2>/dev/null; then
    echo "$NPM_PATH_CMD" >> ~/.zshrc
    echo "  Added npm global bin to ~/.zshrc"
fi

export PATH="$HOME/.npm-global/bin:$PATH"

# Install Capacitor CLI (no sudo needed now)
echo "  Installing Capacitor CLI v$CAPACITOR_VER..."
npm install -g "@capacitor/cli@$CAPACITOR_VER"

# ==========================================================
# PHASE 5: Xcode Installation & Configuration (Requires sudo)
# ==========================================================
echo ""
echo "[5/6] Xcode setup..."

# Check if Xcode is installed
if [ ! -d "/Applications/Xcode.app" ]; then
    echo "  Xcode not found. Installing via Mac App Store..."
    echo "  (This may take a while - Xcode is ~12GB)"
    mas install "$XCODE_ID"
fi

# Install Command Line Tools (no sudo needed)
if ! xcode-select -p &> /dev/null; then
    echo "  Installing Xcode Command Line Tools..."
    xcode-select --install
    echo "  Waiting for Command Line Tools installation..."
    echo "  (Click 'Install' in the popup dialog)"
    # Wait for installation to complete
    until xcode-select -p &> /dev/null; do
        sleep 5
    done
else
    echo "  Command Line Tools already installed"
fi

# These commands require admin privileges
echo ""
echo "  Xcode configuration requires admin access."
echo "  Enter your password when prompted (or skip if no admin access):"
echo ""

if sudo -v 2>/dev/null; then
    echo "  Setting Xcode developer directory..."
    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

    echo "  Accepting Xcode license..."
    sudo xcodebuild -license accept

    echo "  Enabling Developer Mode..."
    sudo DevToolsSecurity -enable

    echo "  Xcode configured successfully"
else
    echo "  [SKIPPED] No admin access - Xcode commands need to be run by admin:"
    echo "    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    echo "    sudo xcodebuild -license accept"
    echo "    sudo DevToolsSecurity -enable"
fi

# ==========================================================
# PHASE 6: Verification
# ==========================================================
echo ""
echo "[6/6] Verifying installations..."
echo ""
echo "=========================================="
echo "  INSTALLATION SUMMARY"
echo "=========================================="

# Check each tool
check_tool() {
    if command -v "$1" &> /dev/null; then
        echo "  [OK] $1: $($2)"
    else
        echo "  [MISSING] $1"
    fi
}

check_tool "node" "node -v"
check_tool "npm" "npm -v"
check_tool "fastlane" "fastlane --version 2>&1 | head -n 1"
check_tool "gitlab-runner" "gitlab-runner --version 2>&1 | head -n 1"
check_tool "cap" "cap --version 2>&1"

echo ""
echo "  Xcode path: $(xcode-select -p 2>/dev/null || echo '[NOT CONFIGURED]')"
echo ""
echo "=========================================="
echo "  TICKET-101 COMPLETE"
echo "=========================================="
echo ""
echo "  Restart terminal or run: source ~/.zshrc"
echo ""
echo "  Next:(GitLab Runner Registration)"
echo ""
echo "=========================================="
