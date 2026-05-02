# conductor-wakatime

WakaTime tracking for Conductor agent sessions.

## Goal

Track Conductor's local Codex and Claude activity from:

```text
~/Library/Application Support/com.conductor.app/conductor.db
```

First version will use a lightweight database tailer. Later versions can add a Codex stdio proxy for more precise real-time events.

## Commands

```bash
npm run status
npm run doctor
```

