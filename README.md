# conductor-wakatime

WakaTime tracking for Conductor agent sessions on macOS.

## Features

- Tracks Conductor agent sessions in WakaTime
- Sends file-level heartbeats for read/write tool activity
- Sends app-level heartbeats when Conductor records activity without a file path
- Adds explicit language metadata for known file extensions
- Runs in the background with a macOS LaunchAgent

## Download

```bash
npm install -g conductor-wakatime
```

To install directly from GitHub:

```bash
npm install -g git+https://github.com/jackng96/conductor-wakatime.git
```

## WakaTime Setup

You need a WakaTime account, API key, config file, and CLI before starting the tracker.

Create `~/.wakatime.cfg`:

```ini
[settings]
api_key = your-api-key-here
```

Install WakaTime CLI at `~/.wakatime/wakatime-cli`. If you already use a WakaTime editor plugin, this may already exist.

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

If you upgrade Node or reinstall this package, rerun `conductor-wakatime install` so the LaunchAgent points at the current executable.

## How It Works

```text
Conductor database
  -> conductor-wakatime LaunchAgent
  -> WakaTime CLI heartbeat
  -> WakaTime dashboard
```

This reads Conductor events from `~/Library/Application Support/com.conductor.app/conductor.db` and sends WakaTime heartbeats with the plugin name `conductor-wakatime`.

## Files

```text
~/.wakatime/conductor-wakatime.json            tracker state
~/.wakatime/conductor-wakatime-launchd.out.log background logs
~/.wakatime/conductor-wakatime-launchd.err.log background errors
~/Library/LaunchAgents/com.conductor-wakatime.agent.plist
```

## Troubleshooting

If `conductor-wakatime install` fails, the error will name the missing dependency: Conductor database, WakaTime CLI, or WakaTime config.
