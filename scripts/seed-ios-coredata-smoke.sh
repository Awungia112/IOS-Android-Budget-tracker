#!/usr/bin/env bash
set -euo pipefail

BUNDLE_ID="de.deutschland-im-plus.MeinBudget"
PREFS_PATH=""
WAL_PATH=""
SHM_PATH=""
SQLITE_PATH=""

usage() {
  cat <<'EOF'
Usage:
  pnpm smoke:ios-coredata:seed -- /path/to/D_in_Plus.sqlite [options]

Options:
  --bundle-id <id>   iOS app bundle identifier. Defaults to de.deutschland-im-plus.MeinBudget.
  --prefs <path>     Legacy preferences plist to copy into the app preference domain.
  --wal <path>       Explicit SQLite WAL file. Defaults to <sqlite>-wal when present.
  --shm <path>       Explicit SQLite SHM file. Defaults to <sqlite>-shm when present.
  -h, --help         Show this help.

The target simulator must be booted and the app must have been launched once.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle-id)
      BUNDLE_ID="${2:-}"
      shift 2
      ;;
    --prefs)
      PREFS_PATH="${2:-}"
      shift 2
      ;;
    --wal)
      WAL_PATH="${2:-}"
      shift 2
      ;;
    --shm)
      SHM_PATH="${2:-}"
      shift 2
      ;;
    --)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n "$SQLITE_PATH" ]]; then
        echo "Only one SQLite path can be provided." >&2
        usage >&2
        exit 2
      fi
      SQLITE_PATH="$1"
      shift
      ;;
  esac
done

if [[ -z "$SQLITE_PATH" ]]; then
  echo "Missing SQLite path." >&2
  usage >&2
  exit 2
fi

if [[ ! -f "$SQLITE_PATH" ]]; then
  echo "SQLite file not found: $SQLITE_PATH" >&2
  exit 1
fi

if [[ -n "$PREFS_PATH" && ! -f "$PREFS_PATH" ]]; then
  echo "Preferences plist not found: $PREFS_PATH" >&2
  exit 1
fi

if [[ -n "$WAL_PATH" && ! -f "$WAL_PATH" ]]; then
  echo "WAL file not found: $WAL_PATH" >&2
  exit 1
fi

if [[ -n "$SHM_PATH" && ! -f "$SHM_PATH" ]]; then
  echo "SHM file not found: $SHM_PATH" >&2
  exit 1
fi

if [[ -z "$WAL_PATH" && -f "${SQLITE_PATH}-wal" ]]; then
  WAL_PATH="${SQLITE_PATH}-wal"
fi

if [[ -z "$SHM_PATH" && -f "${SQLITE_PATH}-shm" ]]; then
  SHM_PATH="${SQLITE_PATH}-shm"
fi

APP_DATA="$(xcrun simctl get_app_container booted "$BUNDLE_ID" data 2>/dev/null || true)"

if [[ -z "$APP_DATA" || ! -d "$APP_DATA" ]]; then
  cat >&2 <<EOF
Could not find app data container for $BUNDLE_ID on the booted simulator.
Boot a simulator, install the app, and launch it once before running this script.
EOF
  exit 1
fi

DOCUMENTS_DIR="$APP_DATA/Documents"
PREFERENCES_DIR="$APP_DATA/Library/Preferences"

mkdir -p "$DOCUMENTS_DIR" "$PREFERENCES_DIR"

cp -f "$SQLITE_PATH" "$DOCUMENTS_DIR/D_in_Plus.sqlite"

if [[ -n "$WAL_PATH" ]]; then
  cp -f "$WAL_PATH" "$DOCUMENTS_DIR/D_in_Plus.sqlite-wal"
fi

if [[ -n "$SHM_PATH" ]]; then
  cp -f "$SHM_PATH" "$DOCUMENTS_DIR/D_in_Plus.sqlite-shm"
fi

if [[ -n "$PREFS_PATH" ]]; then
  cp -f "$PREFS_PATH" "$PREFERENCES_DIR/${BUNDLE_ID}.plist"
fi

cat <<EOF
Seeded iOS Core Data smoke fixture.

Bundle ID: $BUNDLE_ID
App data:  $APP_DATA
SQLite:    $DOCUMENTS_DIR/D_in_Plus.sqlite
WAL:       ${WAL_PATH:+$DOCUMENTS_DIR/D_in_Plus.sqlite-wal}
SHM:       ${SHM_PATH:+$DOCUMENTS_DIR/D_in_Plus.sqlite-shm}
Prefs:     ${PREFS_PATH:+$PREFERENCES_DIR/${BUNDLE_ID}.plist}

Relaunch the app and open /sqlite-smoke to run the Core Data smoke panel.
EOF
