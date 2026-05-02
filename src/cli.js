const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const VERSION = "0.1.0";

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
    stateFile: options.stateFile || path.join(homeDir, ".wakatime", "conductor-wakatime.json"),
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

function status(options = {}) {
  const paths = resolvePaths(options);

  console.log(JSON.stringify({
    ...paths,
    checks: getChecks(paths),
  }, null, 2));
}

function doctor(options = {}) {
  const paths = resolvePaths(options);
  const checks = validate(paths);

  console.log(JSON.stringify({
    ...paths,
    checks,
  }, null, 2));
  console.log("Setup checks passed.");
}

async function run(argv) {
  const [command] = argv;

  switch (command) {
    case "status":
      status();
      return;
    case "doctor":
      doctor();
      return;
    default:
      console.log("Usage: conductor-wakatime <status|doctor>");
  }
}

module.exports = {
  run,
  resolvePaths,
  getChecks,
  validate,
};
