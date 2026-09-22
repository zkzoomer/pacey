#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace="$repo_dir/workspace"
profile_args=()
state_dir="$HOME/.openclaw"
development=false

if [[ "${1:-}" == "--dev" ]]; then
  profile_args=(--dev)
  state_dir="$HOME/.openclaw-dev"
  development=true
  shift
fi

if [[ "$#" -ne 0 ]]; then
  echo "Usage: $0 [--dev]" >&2
  exit 1
fi

if [[ "$EUID" -eq 0 ]]; then
  echo "Run this script as the deployment user, not with sudo." >&2
  exit 1
fi

if [[ ! -f "$state_dir/openclaw.json" || ! -x "$repo_dir/node_modules/.bin/openclaw" ]]; then
  echo "Pacey is not deployed for this profile. Run:" >&2
  echo "  ./scripts/deploy.sh${profile_args[*]:+ ${profile_args[*]}}" >&2
  exit 1
fi

for workspace_file in AGENTS.md SOUL.md IDENTITY.md; do
  if [[ ! -f "$workspace/$workspace_file" ]]; then
    echo "Repository workspace file not found: $workspace/$workspace_file" >&2
    exit 1
  fi
done

cd "$repo_dir"

configured_workspace="$(
  yarn -s openclaw "${profile_args[@]}" \
    config get agents.entries.main.workspace
)"

if [[ "$configured_workspace" != "$workspace" ]]; then
  echo "This profile is not configured to use the repository workspace." >&2
  echo "Run:" >&2
  echo "  ./scripts/deploy.sh${profile_args[*]:+ ${profile_args[*]}}" >&2
  exit 1
fi

if [[ "$development" == true ]]; then
  echo "Starting the development Gateway. Press Ctrl-C to stop it."
  exec yarn -s openclaw --dev --log-level debug gateway run \
    --force \
    --verbose \
    --ws-log compact
fi

echo "Installing/updating and starting the production Gateway service..."
yarn -s openclaw gateway install --force
yarn -s openclaw gateway status
