# Pacey

A stateful AI coach for training, recovery and nutrition.

## Deploy

This repository pins Node, Yarn, OpenClaw and TypeScript. On a development
machine with NVM and Yarn installed:

```bash
git clone <repository-url> pacey
cd pacey
nvm install
nvm use
./scripts/deploy.sh --dev
./scripts/start.sh --dev
```

The deploy script installs the locked dependencies, configures an isolated
OpenClaw profile under `~/.openclaw-dev`, links this checkout as the Pacey
plugin, applies the committed `config/openclaw.patch.json5`, and then exits. The
start script runs the Gateway in the foreground with debug logging; stop it
with Ctrl-C. Deployment prompts once for the development Telegram bot token and
OpenAI API key, storing them in
`~/.openclaw-dev/.env` with user-only permissions. Later deploys and upgrades
reuse them.

Deploy the same checkout on a VPS without `--dev`:

```bash
git clone <repository-url> pacey
cd pacey
nvm install
nvm use
./scripts/deploy.sh
./scripts/start.sh
```

Production uses `~/.openclaw`. Its start script installs/updates and starts
OpenClaw's user service, so it continues running after the terminal closes. Run
it as the dedicated deployment user, not with `sudo`. Development and
production have separate state, credentials, Telegram bots and databases.

`yarn install` provides the project-local OpenClaw CLI and Plugin SDK, so editors
can resolve imports such as `openclaw/plugin-sdk/plugin-entry`. The scripts use
that pinned CLI rather than a global OpenClaw installation.

## Upgrade

Check out the version you want to run, then apply it:

```bash
git pull --ff-only
./scripts/upgrade.sh          # VPS/production
./scripts/start.sh
./scripts/upgrade.sh --dev    # local development
./scripts/start.sh --dev
```

The upgrade script deliberately does not run `git pull`: selecting a commit and
applying it are separate operations. It preserves the profile, credentials,
sessions and Pacey database. Start the Gateway afterward; database migrations
run when it loads the plugin.
