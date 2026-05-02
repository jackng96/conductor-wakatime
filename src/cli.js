const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const pkg = require("../package.json");

const VERSION = pkg.version;
const PLUGIN = `conductor/1.0.0 conductor-wakatime/${VERSION}`;
const ROOT_DIR = path.dirname(__dirname);
const LAUNCH_AGENT_LABEL = "com.conductor-wakatime.agent";
const DEFAULT_POLL_SECONDS = 30;
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);
const FILE_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "Grep", "Glob"]);
const LANGUAGE_BY_EXTENSION = new Map([
  [".c", "C"],
  [".cc", "C++"],
  [".cpp", "C++"],
  [".cs", "C#"],
  [".css", "CSS"],
  [".go", "Go"],
  [".html", "HTML"],
  [".java", "Java"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".json", "JSON"],
  [".md", "Markdown"],
  [".php", "PHP"],
  [".py", "Python"],
  [".rb", "Ruby"],
  [".rs", "Rust"],
  [".sh", "Bash"],
  [".sql", "SQL"],
  [".swift", "Swift"],
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".vue", "Vue"],
  [".yaml", "YAML"],
  [".yml", "YAML"],
]);

function resolvePaths(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const appSupport = options.appSupport || path.join(homeDir, "Library", "Application Support");
  const conductorHome = options.conductorHome || path.join(appSupport, "com.conductor.app");

  return {
    version: VERSION,
    conductorHome,
    conductorDb: options.conductorDb || path.join(conductorHome, "conductor.db"),
    wakatimeCli: options.wakatimeCli || path.join(homeDir, ".wakatime", "wakatime-cli"),
    wakatimeConfig: options.wakatimeConfig || path.join(homeDir, ".wakatime.cfg"),
    wakatimeLog: options.wakatimeLog || path.join(homeDir, ".wakatime", "wakatime.log"),
    stateFile: options.stateFile || path.join(homeDir, ".wakatime", "conductor-wakatime.json"),
    launchAgent: options.launchAgent || path.join(homeDir, "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`),
  };
}

function getChecks(paths) {
  return {
    conductorDbExists: fs.existsSync(paths.conductorDb),
    wakatimeCliExists: fs.existsSync(paths.wakatimeCli),
    wakatimeConfigExists: fs.existsSync(paths.wakatimeConfig),
  };
}

function validate(paths) {
  const checks = getChecks(paths);
  const failures = [];

  if (!checks.conductorDbExists) failures.push(`missing Conductor database: ${paths.conductorDb}`);
  if (!checks.wakatimeCliExists) failures.push(`missing WakaTime CLI: ${paths.wakatimeCli}`);
  if (!checks.wakatimeConfigExists) failures.push(`missing WakaTime config: ${paths.wakatimeConfig}`);

  if (failures.length > 0) {
    throw new Error(`Setup check failed:\n- ${failures.join("\n- ")}`);
  }

  return checks;
}

function toUnixTime(value) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return timestamp / 1000;
}

function detectLanguage(filePath) {
  if (!filePath) {
    return null;
  }

  return LANGUAGE_BY_EXTENSION.get(path.extname(filePath).toLowerCase()) || null;
}

function deriveWorkspaceFolder(row) {
  if (row.file_path) {
    const marker = `${path.sep}conductor${path.sep}workspaces${path.sep}`;
    const index = row.file_path.indexOf(marker);

    if (index !== -1) {
      const afterMarker = row.file_path.slice(index + marker.length).split(path.sep);

      if (afterMarker.length >= 2) {
        return row.file_path.slice(0, index + marker.length + afterMarker[0].length + 1 + afterMarker[1].length);
      }
    }
  }

  if (row.root_path && row.repo_name && row.directory_name) {
    return path.join(path.dirname(path.dirname(row.root_path)), "conductor", "workspaces", row.repo_name, row.directory_name);
  }

  return row.root_path || undefined;
}

function buildHeartbeatFromRow(row) {
  const hasTrackableFile = row.file_path && FILE_TOOLS.has(row.tool_name);
  const project = row.repo_name || row.directory_name || "Conductor";

  return {
    messageId: row.id,
    entity: hasTrackableFile ? row.file_path : "Conductor",
    entityType: hasTrackableFile ? "file" : "app",
    language: hasTrackableFile ? detectLanguage(row.file_path) : null,
    isWrite: hasTrackableFile ? WRITE_TOOLS.has(row.tool_name) : false,
    project,
    projectFolder: deriveWorkspaceFolder(row),
    time: toUnixTime(row.created_at),
    agentType: row.agent_type || null,
    branch: row.branch || null,
  };
}

function getToolFilePath(toolUse) {
  const input = toolUse && toolUse.input;

  if (!input || typeof input !== "object") {
    return undefined;
  }

  return input.file_path || input.path || input.filePath || input.target_file;
}

function parseContent(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildHeartbeatsFromRow(row) {
  const content = parseContent(row.content);
  const messageContent = content && content.message && Array.isArray(content.message.content)
    ? content.message.content
    : [];
  const heartbeats = [];

  for (const [index, item] of messageContent.entries()) {
    if (!item || item.type !== "tool_use" || !FILE_TOOLS.has(item.name)) {
      continue;
    }

    const filePath = getToolFilePath(item);

    if (!filePath) {
      continue;
    }

    heartbeats.push(buildHeartbeatFromRow({
      ...row,
      id: `${row.id}:${index}`,
      tool_name: item.name,
      file_path: filePath,
    }));
  }

  return heartbeats.length > 0 ? heartbeats : [buildHeartbeatFromRow(row)];
}

function buildWakatimeArgs(heartbeat, paths) {
  const args = [
    "--entity",
    heartbeat.entity,
    "--entity-type",
    heartbeat.entityType,
    "--category",
    "ai coding",
    "--plugin",
    PLUGIN,
    "--config",
    paths.wakatimeConfig,
    "--log-file",
    paths.wakatimeLog,
    "--heartbeat-rate-limit-seconds",
    "60",
    "--timeout",
    "30",
  ];

  if (heartbeat.projectFolder) {
    args.push("--project-folder", heartbeat.projectFolder);
  }

  if (heartbeat.project) {
    args.push("--project", heartbeat.project);
  }

  if (heartbeat.language) {
    args.push("--language", heartbeat.language);
  }

  if (heartbeat.time) {
    args.push("--time", String(heartbeat.time));
  }

  if (heartbeat.isWrite) {
    args.push("--write");
  }

  return args;
}

function sqlStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildRowsSql({ where = "", order = "desc", limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  const safeOrder = order === "asc" ? "asc" : "desc";

  return `
select
  sm.id,
  sm.created_at,
  sm.content,
  s.agent_type,
  s.model,
  w.directory_name,
  w.branch,
  r.name as repo_name,
  r.root_path,
  json_extract(sm.content,'$.type') as event_type,
  json_extract(sm.content,'$.message.content[0].type') as content_type,
  json_extract(sm.content,'$.message.content[0].name') as tool_name,
  coalesce(
    json_extract(sm.content,'$.message.content[0].input.file_path'),
    json_extract(sm.content,'$.message.content[0].input.path'),
    json_extract(sm.content,'$.message.content[0].input.filePath'),
    json_extract(sm.content,'$.message.content[0].input.target_file')
  ) as file_path
from session_messages sm
join sessions s on s.id = sm.session_id
left join workspaces w on w.id = s.workspace_id
left join repos r on r.id = w.repository_id
where json_valid(sm.content)
  and (
    json_extract(sm.content,'$.type') = 'result'
    or json_extract(sm.content,'$.message.content[0].type') = 'tool_use'
    or exists (
      select 1
      from json_each(sm.content, '$.message.content') as item
      where json_extract(item.value, '$.type') = 'tool_use'
    )
  )
  ${where}
order by sm.created_at ${safeOrder}, sm.id ${safeOrder}
limit ${safeLimit};
`;
}

function runRowsSql(paths, sql) {
  const result = spawnSync("sqlite3", ["-json", paths.conductorDb, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`sqlite3 failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`sqlite3 failed: ${(result.stderr || "").trim()}`);
  }

  return JSON.parse(result.stdout || "[]");
}

function queryRecentRows(paths, limit = 200) {
  return runRowsSql(paths, buildRowsSql({ limit }));
}

function queryRowsAfterState(paths, state, limit = 200) {
  if (!state.lastCreatedAt) {
    return runRowsSql(paths, buildRowsSql({ order: "asc", limit }));
  }

  const createdAt = sqlStringLiteral(state.lastCreatedAt);
  const messageId = sqlStringLiteral(state.lastMessageId || "");
  const where = `
  and (
    sm.created_at > ${createdAt}
    or (sm.created_at = ${createdAt} and sm.id > ${messageId})
  )`;

  return runRowsSql(paths, buildRowsSql({ where, order: "asc", limit }));
}

function selectHeartbeat(rows) {
  const heartbeats = rows.flatMap(buildHeartbeatsFromRow);
  const fileHeartbeat = heartbeats.find((heartbeat) => heartbeat.entityType === "file" && fs.existsSync(heartbeat.entity));

  return fileHeartbeat || heartbeats.find((heartbeat) => heartbeat.entityType === "app") || null;
}

function sendHeartbeat(heartbeat, paths) {
  const result = spawnSync(paths.wakatimeCli, buildWakatimeArgs(heartbeat, paths), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`WakaTime CLI failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`WakaTime CLI failed: ${(result.stderr || result.stdout || "").trim()}`);
  }

  return {
    heartbeat,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function readState(paths) {
  if (!fs.existsSync(paths.stateFile)) {
    return { lastCreatedAt: null, lastMessageId: null };
  }

  return JSON.parse(fs.readFileSync(paths.stateFile, "utf8"));
}

function writeState(paths, state) {
  fs.mkdirSync(path.dirname(paths.stateFile), { recursive: true });
  fs.writeFileSync(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function isNewerThanState(row, state) {
  if (!state.lastCreatedAt) {
    return true;
  }

  const rowTime = Date.parse(row.created_at);
  const stateTime = Date.parse(state.lastCreatedAt);

  if (rowTime !== stateTime) {
    return rowTime > stateTime;
  }

  return String(row.id) > String(state.lastMessageId || "");
}

function initializeState(paths) {
  const [latest] = queryRecentRows(paths, 1);
  const state = {
    lastCreatedAt: latest ? latest.created_at : null,
    lastMessageId: latest ? latest.id : null,
  };

  writeState(paths, state);
  return state;
}

function trackOnce(options = {}) {
  const paths = resolvePaths(options);
  validate(paths);

  let state = readState(paths);
  const batchLimit = options.limit || 200;
  const sent = [];
  const skipped = [];

  while (true) {
    const rows = queryRowsAfterState(paths, state, batchLimit);

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const heartbeats = buildHeartbeatsFromRow(row);

      for (const heartbeat of heartbeats) {
        if (heartbeat.entityType === "file" && !fs.existsSync(heartbeat.entity)) {
          skipped.push({ id: heartbeat.messageId, reason: "file no longer exists", entity: heartbeat.entity });
        } else {
          sendHeartbeat(heartbeat, paths);
          sent.push(heartbeat);
        }
      }

      state = {
        lastCreatedAt: row.created_at,
        lastMessageId: row.id,
      };
      writeState(paths, state);
    }
  }

  return { sent, skipped, state: readState(paths) };
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildLaunchAgentPlist(paths) {
  const stdout = path.join(path.dirname(paths.stateFile), "conductor-wakatime-launchd.out.log");
  const stderr = path.join(path.dirname(paths.stateFile), "conductor-wakatime-launchd.err.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(process.execPath)}</string>
    <string>${xmlEscape(path.join(ROOT_DIR, "bin", "conductor-wakatime.js"))}</string>
    <string>watch</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(ROOT_DIR)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(stdout)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(stderr)}</string>
</dict>
</plist>
`;
}

function launchctl(args, options = {}) {
  const result = spawnSync("launchctl", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`launchctl failed: ${result.error.message}`);
  }

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`launchctl failed: ${(result.stderr || result.stdout || "").trim()}`);
  }

  return result;
}

function setup(options = {}) {
  const paths = resolvePaths(options);
  const checks = validate(paths);
  fs.mkdirSync(path.dirname(paths.stateFile), { recursive: true });

  if (!fs.existsSync(paths.stateFile) || !readState(paths).lastCreatedAt) {
    initializeState(paths);
  }

  console.log(JSON.stringify({
    ...paths,
    checks,
    state: readState(paths),
    ready: true,
  }, null, 2));
}

function install(options = {}) {
  const paths = resolvePaths(options);
  const checks = validate(paths);
  fs.mkdirSync(path.dirname(paths.launchAgent), { recursive: true });
  initializeState(paths);
  fs.writeFileSync(paths.launchAgent, buildLaunchAgentPlist(paths));

  const target = `gui/${process.getuid()}`;
  launchctl(["bootout", target, paths.launchAgent], { allowFailure: true });
  launchctl(["bootstrap", target, paths.launchAgent]);
  launchctl(["enable", `${target}/${LAUNCH_AGENT_LABEL}`]);
  launchctl(["kickstart", "-k", `${target}/${LAUNCH_AGENT_LABEL}`]);

  console.log(JSON.stringify({
    ...paths,
    checks,
    state: readState(paths),
    launchAgentLoaded: true,
  }, null, 2));
}

function uninstall(options = {}) {
  const paths = resolvePaths(options);
  const target = `gui/${process.getuid()}`;
  launchctl(["bootout", target, paths.launchAgent], { allowFailure: true });

  if (fs.existsSync(paths.launchAgent)) {
    fs.unlinkSync(paths.launchAgent);
  }

  console.log(JSON.stringify({
    launchAgent: paths.launchAgent,
    launchAgentLoaded: false,
  }, null, 2));
}

function testHeartbeat(options = {}) {
  const paths = resolvePaths(options);
  validate(paths);

  const rows = queryRecentRows(paths, options.limit || 200);
  const heartbeat = selectHeartbeat(rows);

  if (!heartbeat) {
    throw new Error("No Conductor events found to send to WakaTime.");
  }

  const sent = sendHeartbeat(heartbeat, paths);

  console.log(JSON.stringify({
    ok: true,
    sent: sent.heartbeat,
    wakatimeOutput: sent.stdout || sent.stderr || null,
  }, null, 2));
}

function trackOnceCommand() {
  const result = trackOnce();

  console.log(JSON.stringify({
    ok: true,
    ...result,
  }, null, 2));
}

function watch() {
  setup();
  console.log(`Watching Conductor for WakaTime events every ${DEFAULT_POLL_SECONDS}s.`);

  setInterval(() => {
    try {
      const result = trackOnce();

      if (result.sent.length > 0 || result.skipped.length > 0) {
        console.log(JSON.stringify({
          at: new Date().toISOString(),
          sent: result.sent.length,
          skipped: result.skipped.length,
        }));
      }
    } catch (error) {
      console.error(error.stack || error.message);
      process.exit(1);
    }
  }, DEFAULT_POLL_SECONDS * 1000);
}

function status(options = {}) {
  const paths = resolvePaths(options);

  console.log(JSON.stringify({
    ...paths,
    checks: getChecks(paths),
  }, null, 2));
}

async function run(argv) {
  const [command] = argv;

  switch (command) {
    case "setup":
      setup();
      return;
    case "install":
      install();
      return;
    case "uninstall":
      uninstall();
      return;
    case "status":
      status();
      return;
    case "track-once":
      trackOnceCommand();
      return;
    case "watch":
      watch();
      return;
    case "test-heartbeat":
      testHeartbeat();
      return;
    default:
      console.log("Usage: conductor-wakatime <install|uninstall|status>");
  }
}

module.exports = {
  run,
  resolvePaths,
  getChecks,
  validate,
  detectLanguage,
  buildHeartbeatFromRow,
  buildHeartbeatsFromRow,
  buildWakatimeArgs,
  queryRecentRows,
  queryRowsAfterState,
  selectHeartbeat,
  sendHeartbeat,
  readState,
  writeState,
  isNewerThanState,
  trackOnce,
  buildLaunchAgentPlist,
};
