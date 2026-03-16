#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-dir>"
  exit 1
fi

SOURCE_DIR="$1"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[restore] source:  $SOURCE_DIR"
echo "[restore] target:  $PROJECT_DIR"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "[restore] backup directory not found: $SOURCE_DIR"
  exit 1
fi

restore_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -e "$src" ]; then
    mkdir -p "$(dirname "$dest")"
    rm -rf "$dest"
    cp -R "$src" "$dest"
    echo "[restore] restored: $src -> $dest"
  else
    echo "[restore] missing, skipped: $src"
  fi
}

restore_if_exists "$SOURCE_DIR/.env.local" "$PROJECT_DIR/.env.local"
restore_if_exists "$SOURCE_DIR/data" "$PROJECT_DIR/data"

restore_memory_file() {
  local kid_id="$1"
  local src="$SOURCE_DIR/openclaw-memory/${kid_id}-MEMORY.md"
  local kid_upper
  kid_upper="$(printf '%s' "$kid_id" | tr '[:lower:]' '[:upper:]')"
  local env_key="KID_CHAT_WORKSPACE_${kid_upper}"
  local workspace_dir="${!env_key:-$HOME/.openclaw/workspace-$kid_id}"
  local dest="$workspace_dir/MEMORY.md"

  if [ -f "$src" ]; then
    mkdir -p "$workspace_dir"
    cp "$src" "$dest"
    echo "[restore] restored: $src -> $dest"
  else
    echo "[restore] missing, skipped: $src"
  fi
}

restore_memory_file grace
restore_memory_file george

echo "[restore] next steps:"
echo "  cd $PROJECT_DIR"
echo "  npm install"
echo "  npm run build"
echo "  pm2 restart kid-chat-mvp   # or your configured PM2 name"
