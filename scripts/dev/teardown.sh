#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
state_dir="$HOME/.openclaw-dev"
confirmed=false

if [[ "${1:-}" == "--yes" ]]; then
  confirmed=true
  shift
fi

if [[ "$#" -ne 0 ]]; then
  echo "Usage: $0 [--yes]" >&2
  exit 1
fi

if [[ "$EUID" -eq 0 ]]; then
  echo "Run this script as your normal development user, not with sudo." >&2
  exit 1
fi

if command -v lsof >/dev/null && lsof -nP -iTCP:19001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Stop the development Gateway with Ctrl-C, then run this again." >&2
  exit 1
fi

echo "This will permanently delete the development OpenClaw profile:"
echo "  $state_dir"

if [[ "$confirmed" == false ]]; then
  read -r -p "Continue? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || exit 0
fi

cd "$repo_dir"
yarn -s openclaw --dev uninstall \
  --service \
  --state \
  --non-interactive \
  --yes

echo "Development profile removed; it cannot be recovered by this script."
