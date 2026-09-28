#!/usr/bin/env bash

set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
state_dir="$HOME/.openclaw-dev"
env_file="$state_dir/.env"
openclaw_state_database="$state_dir/state/openclaw.sqlite"
confirmed=false
delete_keys=false
preserved_state_dir=""

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --yes)
      confirmed=true
      ;;
    --delete-keys)
      delete_keys=true
      ;;
    *)
      echo "Usage: $0 [--yes] [--delete-keys]" >&2
      exit 1
      ;;
  esac
  shift
done

restore_preserved_state() {
  if [[ -z "$preserved_state_dir" ]]; then
    return
  fi

  if [[ -f "$preserved_state_dir/.env" ]]; then
    mkdir -p -- "$state_dir"
    chmod 700 "$state_dir"
    cp -- "$preserved_state_dir/.env" "$env_file"
    chmod 600 "$env_file"
    rm -f -- "$preserved_state_dir/.env"
  fi

  for suffix in "" "-wal"; do
    if [[ -f "$preserved_state_dir/openclaw.sqlite$suffix" ]]; then
      mkdir -p -- "$state_dir/state"
      chmod 700 "$state_dir" "$state_dir/state"
      cp -- "$preserved_state_dir/openclaw.sqlite$suffix" "$openclaw_state_database$suffix"
      chmod 600 "$openclaw_state_database$suffix"
      rm -f -- "$preserved_state_dir/openclaw.sqlite$suffix"
    fi
  done

  rmdir -- "$preserved_state_dir"
}

trap restore_preserved_state EXIT

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
if [[ "$delete_keys" == true ]]; then
  echo "The Telegram and OpenAI keys in $env_file will also be deleted."
else
  echo "The credentials in $env_file will be preserved."
fi
echo "OpenClaw shared state, including Telegram pairing approvals, will be preserved."

if [[ "$confirmed" == false ]]; then
  read -r -p "Continue? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || exit 0
fi

umask 077
if [[ ( "$delete_keys" == false && -f "$env_file" ) || -f "$openclaw_state_database" || -f "$openclaw_state_database-wal" ]]; then
  preserved_state_dir="$(mktemp -d)"
fi

if [[ "$delete_keys" == false && -f "$env_file" ]]; then
  cp -- "$env_file" "$preserved_state_dir/.env"
fi

for suffix in "" "-wal"; do
  [[ ! -f "$openclaw_state_database$suffix" ]] || cp -- "$openclaw_state_database$suffix" "$preserved_state_dir/openclaw.sqlite$suffix"
done

cd "$repo_dir"
yarn -s openclaw --dev uninstall \
  --service \
  --state \
  --non-interactive \
  --yes

restore_preserved_state
trap - EXIT

if [[ "$delete_keys" == true ]]; then
  rm -f -- "$env_file"
  echo "Development profile and credentials removed; they cannot be recovered by this script."
elif [[ -f "$env_file" ]]; then
  echo "Development profile removed; credentials preserved in $env_file."
else
  echo "Development profile removed; no credential file existed to preserve."
fi

if [[ -f "$openclaw_state_database" ]]; then
  echo "OpenClaw shared state preserved in $openclaw_state_database."
else
  echo "No OpenClaw shared-state database existed to preserve."
fi
