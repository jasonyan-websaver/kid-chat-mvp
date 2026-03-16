#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${BACKUP_ROOT:-$PROJECT_DIR/backups}"
BACKUP_DIR="$BACKUP_ROOT/kid-chat-mvp-$STAMP"
ARCHIVE_MODE="${ARCHIVE_MODE:-tar.gz}"
RETAIN_COUNT="${RETAIN_COUNT:-14}"

mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/openclaw-memory"

echo "[backup] project dir: $PROJECT_DIR"
echo "[backup] backup dir:  $BACKUP_DIR"

copy_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -e "$src" ]; then
    mkdir -p "$(dirname "$dest")"
    cp -R "$src" "$dest"
    echo "[backup] copied: $src"
  else
    echo "[backup] missing, skipped: $src"
  fi
}

copy_if_exists "$PROJECT_DIR/.env.local" "$BACKUP_DIR/.env.local"
copy_if_exists "$PROJECT_DIR/data" "$BACKUP_DIR/data"

backup_memory_file() {
  local kid_id="$1"
  local kid_upper
  kid_upper="$(printf '%s' "$kid_id" | tr '[:lower:]' '[:upper:]')"
  local env_key="KID_CHAT_WORKSPACE_${kid_upper}"
  local workspace_dir="${!env_key:-$HOME/.openclaw/workspace-$kid_id}"
  local memory_path="$workspace_dir/MEMORY.md"
  local target="$BACKUP_DIR/openclaw-memory/${kid_id}-MEMORY.md"

  if [ -f "$memory_path" ]; then
    cp "$memory_path" "$target"
    echo "[backup] copied: $memory_path"
  else
    echo "[backup] missing, skipped: $memory_path"
  fi
}

backup_memory_file grace
backup_memory_file george

case "$ARCHIVE_MODE" in
  none)
    echo "[backup] archive disabled"
    ;;
  tar.gz)
    tar -czf "$BACKUP_ROOT/kid-chat-mvp-$STAMP.tar.gz" -C "$BACKUP_ROOT" "kid-chat-mvp-$STAMP"
    echo "[backup] archive created: $BACKUP_ROOT/kid-chat-mvp-$STAMP.tar.gz"
    ;;
  *)
    echo "[backup] unknown ARCHIVE_MODE: $ARCHIVE_MODE"
    exit 1
    ;;
esac

prune_backups() {
  local find_type="$1"
  local pattern="$2"
  local keep="$3"
  local count=0

  find "$BACKUP_ROOT" -maxdepth 1 -type "$find_type" -name "$pattern" -print | sort -r | while IFS= read -r item; do
    count=$((count + 1))
    if [ "$count" -le "$keep" ]; then
      continue
    fi

    rm -rf "$item"
    echo "[backup] pruned: $item"
  done
}

case "$RETAIN_COUNT" in
  ''|*[!0-9]*)
    echo "[backup] invalid RETAIN_COUNT: $RETAIN_COUNT"
    exit 1
    ;;
  *)
    if [ "$RETAIN_COUNT" -gt 0 ]; then
      prune_backups f 'kid-chat-mvp-*.tar.gz' "$RETAIN_COUNT"
      prune_backups d 'kid-chat-mvp-20*' "$RETAIN_COUNT"
    else
      echo "[backup] retention disabled"
    fi
    ;;
esac

echo "[backup] done"
