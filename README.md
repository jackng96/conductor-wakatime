# conductor-wakatime

WakaTime tracking for Conductor agent sessions.

## Install

```bash
npm install -g conductor-wakatime
conductor-wakatime doctor
conductor-wakatime setup
conductor-wakatime install
```

The `install` command creates and starts the macOS LaunchAgent. It does not run automatically during `npm install`.

To install directly from GitHub before the package is published to npm:

```bash
npm install -g git+https://github.com/jackng96/conductor-wakatime.git
```

## Commands

```bash
npm run setup
npm run install:agent
npm run status
npm run doctor
npm run track:once
npm run test:heartbeat
```

After a global install, use the CLI directly:

```bash
conductor-wakatime status
conductor-wakatime doctor
conductor-wakatime test-heartbeat
conductor-wakatime uninstall
```

This reads Conductor events from `~/Library/Application Support/com.conductor.app/conductor.db` and sends WakaTime heartbeats with the plugin name `conductor-wakatime`.
