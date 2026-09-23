#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace="$repo_dir/workspace"
config_patch="$repo_dir/config/openclaw.patch.json5"
profile_args=()
state_dir="$HOME/.openclaw"

if [[ "${1:-}" == "--dev" ]]; then
  profile_args=(--dev)
  state_dir="$HOME/.openclaw-dev"
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

cd "$repo_dir"

command -v node >/dev/null || { echo "Node.js is required." >&2; exit 1; }
command -v yarn >/dev/null || { echo "Yarn is required." >&2; exit 1; }

if [[ ! -f "$config_patch" ]]; then
  echo "Repository config patch not found: $config_patch" >&2
  exit 1
fi

for workspace_file in AGENTS.md SOUL.md IDENTITY.md; do
  if [[ ! -f "$workspace/$workspace_file" ]]; then
    echo "Repository workspace file not found: $workspace/$workspace_file" >&2
    echo "Add the Pacey workspace files before deploying." >&2
    exit 1
  fi
done

umask 077
mkdir -p "$state_dir"
env_file="$state_dir/.env"
touch "$env_file"
chmod 600 "$env_file"

ensure_secret() {
  local name="$1"
  local prompt="$2"
  local value=""

  if grep -q "^${name}=." "$env_file"; then
    return
  fi

  if [[ -n "${!name:-}" ]]; then
    value="${!name}"
  else
    read -r -s -p "$prompt: " value
    echo
  fi

  if [[ -z "$value" ]]; then
    echo "$name cannot be empty." >&2
    exit 1
  fi

  printf '%s=%s\n' "$name" "$value" >> "$env_file"
}

ensure_secret TELEGRAM_BOT_TOKEN "Telegram bot token"
ensure_secret OPENAI_API_KEY "OpenAI API key"

echo "Installing dependencies..."
yarn install --frozen-lockfile

openclaw() {
  yarn -s openclaw "${profile_args[@]}" "$@"
}

if [[ ! -f "$state_dir/openclaw.json" ]]; then
  echo "Creating the OpenClaw profile in $state_dir..."
  openclaw onboard \
    --non-interactive \
    --accept-risk \
    --mode local \
    --auth-choice skip \
    --skip-channels \
    --skip-bootstrap \
    --no-install-daemon \
    --skip-ui \
    --skip-health \
    --workspace "$workspace"
fi

openclaw config set agents.entries.main.workspace "$workspace"

if openclaw config get agents.defaults.workspace >/dev/null 2>&1; then
  openclaw config unset agents.defaults.workspace
fi

echo "Applying repository configuration..."
openclaw config patch --file "$config_patch"

echo "Linking the Pacey plugin..."
openclaw plugins install --link "$repo_dir" --force
openclaw plugins enable pacey

echo "Deployment complete. Start Pacey with:"
echo "  ./scripts/start.sh${profile_args[*]:+ ${profile_args[*]}}"
