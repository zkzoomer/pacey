#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" != "" && "${1:-}" != "--dev" ]]; then
  echo "Usage: $0 [--dev]" >&2
  exit 1
fi

if [[ "$#" -gt 1 ]]; then
  echo "Usage: $0 [--dev]" >&2
  exit 1
fi

# Deployment is idempotent: it keeps state and applies the checked-out code.
exec "$repo_dir/scripts/deploy.sh" "$@"
