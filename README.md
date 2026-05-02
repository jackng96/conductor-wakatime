# conductor-wakatime

WakaTime tracking for Conductor agent sessions on macOS.

## Download

```bash
npm install -g git+https://github.com/jackng96/conductor-wakatime.git
```

When the package is published to npm, this becomes:

```bash
npm install -g conductor-wakatime
```

## Start Tracking

```bash
conductor-wakatime install
```

The install command checks for Conductor's database, WakaTime CLI, and WakaTime config before it creates and starts the macOS LaunchAgent.

## Manage

```bash
conductor-wakatime status
conductor-wakatime uninstall
```

This reads Conductor events from `~/Library/Application Support/com.conductor.app/conductor.db` and sends WakaTime heartbeats with the plugin name `conductor-wakatime`.
