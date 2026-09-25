#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
database="$HOME/.openclaw-dev/plugins/pacey/pacey.sqlite"
conversation_database="$HOME/.openclaw-dev/agents/main/agent/openclaw-agent.sqlite"
confirmed=false

if [[ "${1:-}" == "--yes" ]]; then
  confirmed=true
  shift
fi

if [[ "$#" -ne 0 ]]; then
  echo "Usage: $0 [--yes]" >&2
  exit 1
fi

if command -v lsof >/dev/null && lsof -nP -iTCP:19001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Stop the development Gateway with Ctrl-C, then run this again." >&2
  exit 1
fi

echo "This will permanently delete the development databases:"
echo "  $database"
echo "  $conversation_database"

if [[ "$confirmed" == false ]]; then
  read -r -p "Continue? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || exit 0
fi

rm -f -- \
  "$database" \
  "$database-shm" \
  "$database-wal" \
  "$conversation_database" \
  "$conversation_database-shm" \
  "$conversation_database-wal"
echo "Development data and conversation history removed; they cannot be recovered by this script."

"$repo_dir/scripts/deploy.sh" --dev
exec "$repo_dir/scripts/start.sh" --dev
