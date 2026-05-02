# conductor-wakatime

WakaTime tracking for Conductor agent sessions.

## Commands

```bash
npm run setup
npm run install
npm run status
npm run doctor
npm run track:once
npm run test:heartbeat
```

This reads Conductor events from `~/Library/Application Support/com.conductor.app/conductor.db` and sends WakaTime heartbeats with the plugin name `conductor-wakatime`.
