const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const cli = require("../src/cli");
const pkg = require("../package.json");

test("resolvePaths uses macOS Conductor defaults", () => {
  const home = "/Users/example";
  const paths = cli.resolvePaths({ homeDir: home });

  assert.equal(paths.conductorDb, path.join(home, "Library", "Application Support", "com.conductor.app", "conductor.db"));
  assert.equal(paths.wakatimeCli, path.join(home, ".wakatime", "wakatime-cli"));
  assert.equal(paths.wakatimeConfig, path.join(home, ".wakatime.cfg"));
  assert.equal(paths.stateFile, path.join(home, ".wakatime", "conductor-wakatime.json"));
});

test("validate reports missing setup paths", () => {
  const paths = cli.resolvePaths({ homeDir: "/tmp/conductor-wakatime-missing-home" });

  assert.throws(
    () => cli.validate(paths),
    /missing Conductor database/
  );
});

test("buildHeartbeatFromRow creates file heartbeat from tool input", () => {
  const row = {
    id: "msg-1",
    created_at: "2026-05-01T14:55:49.526Z",
    agent_type: "codex",
    tool_name: "Edit",
    file_path: "/Users/example/conductor/workspaces/app/seattle/src/index.ts",
    repo_name: "app",
    root_path: "/Users/example/Dev/app",
    directory_name: "seattle",
    branch: "feature/test",
  };

  assert.deepEqual(cli.buildHeartbeatFromRow(row), {
    messageId: "msg-1",
    entity: "/Users/example/conductor/workspaces/app/seattle/src/index.ts",
    entityType: "file",
    language: "TypeScript",
    isWrite: true,
    project: "app",
    projectFolder: "/Users/example/conductor/workspaces/app/seattle",
    time: 1777647349.526,
    agentType: "codex",
    branch: "feature/test",
  });
});

test("detectLanguage maps TOML files explicitly", () => {
  assert.equal(cli.detectLanguage("/tmp/fly.api.toml"), "TOML");
});

test("buildHeartbeatsFromRow skips non-file result events", () => {
  const row = {
    id: "msg-2",
    created_at: "2026-05-01T14:56:20.482Z",
    agent_type: "claude",
    event_type: "result",
    repo_name: "rag-testing",
    root_path: "/Users/example/Dev/rag-testing",
    directory_name: "london",
  };

  assert.deepEqual(cli.buildHeartbeatsFromRow(row), []);
});

test("buildWakatimeArgs includes Conductor plugin and event time", () => {
  const args = cli.buildWakatimeArgs({
    entity: "/tmp/app.js",
    entityType: "file",
    project: "app",
    projectFolder: "/tmp",
    language: "JavaScript",
    isWrite: true,
    time: 1777625749.526,
  }, {
    wakatimeConfig: "/Users/example/.wakatime.cfg",
    wakatimeLog: "/Users/example/.wakatime/wakatime.log",
  });

  assert.ok(args.includes("--write"));
  assert.deepEqual(args.slice(args.indexOf("--plugin"), args.indexOf("--plugin") + 2), [
    "--plugin",
    `conductor/1.0.0 conductor-wakatime/${pkg.version}`,
  ]);
  assert.deepEqual(args.slice(args.indexOf("--time"), args.indexOf("--time") + 2), [
    "--time",
    "1777625749.526",
  ]);
  assert.deepEqual(args.slice(args.indexOf("--language"), args.indexOf("--language") + 2), [
    "--language",
    "JavaScript",
  ]);
});

test("isNewerThanState uses message id to break timestamp ties", () => {
  const state = {
    lastCreatedAt: "2026-05-01T14:55:49.526Z",
    lastMessageId: "msg-2",
  };

  assert.equal(cli.isNewerThanState({
    id: "msg-1",
    created_at: "2026-05-01T14:55:49.526Z",
  }, state), false);
  assert.equal(cli.isNewerThanState({
    id: "msg-3",
    created_at: "2026-05-01T14:55:49.526Z",
  }, state), true);
  assert.equal(cli.isNewerThanState({
    id: "msg-4",
    created_at: "2026-05-01T14:55:50.000Z",
  }, state), true);
});

test("buildHeartbeatsFromRow extracts every file tool use in a message", () => {
  const row = {
    id: "msg-5",
    created_at: "2026-05-01T15:00:00.000Z",
    agent_type: "codex",
    repo_name: "app",
    root_path: "/Users/example/Dev/app",
    directory_name: "seattle",
    branch: "feature/all-tools",
    content: JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Read",
            input: { file_path: "/Users/example/conductor/workspaces/app/seattle/src/index.ts" },
          },
          {
            type: "tool_use",
            name: "Edit",
            input: { path: "/Users/example/conductor/workspaces/app/seattle/scripts/run.py" },
          },
        ],
      },
    }),
  };

  assert.deepEqual(cli.buildHeartbeatsFromRow(row), [
    {
      messageId: "msg-5:0",
      entity: "/Users/example/conductor/workspaces/app/seattle/src/index.ts",
      entityType: "file",
      language: "TypeScript",
      isWrite: false,
      project: "app",
      projectFolder: "/Users/example/conductor/workspaces/app/seattle",
      time: 1777647600,
      agentType: "codex",
      branch: "feature/all-tools",
    },
    {
      messageId: "msg-5:1",
      entity: "/Users/example/conductor/workspaces/app/seattle/scripts/run.py",
      entityType: "file",
      language: "Python",
      isWrite: true,
      project: "app",
      projectFolder: "/Users/example/conductor/workspaces/app/seattle",
      time: 1777647600,
      agentType: "codex",
      branch: "feature/all-tools",
    },
  ]);
});

test("buildHeartbeatsFromRow skips non-file tool uses", () => {
  const row = {
    id: "msg-6",
    created_at: "2026-05-01T15:00:00.000Z",
    agent_type: "codex",
    repo_name: "app",
    root_path: "/Users/example/Dev/app",
    directory_name: "seattle",
    content: JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Bash",
            input: { command: "npm test" },
          },
          {
            type: "tool_use",
            name: "Grep",
            input: { path: "/Users/example/conductor/workspaces/app/seattle" },
          },
        ],
      },
    }),
  };

  assert.deepEqual(cli.buildHeartbeatsFromRow(row), []);
});
