const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const cli = require("../src/cli");

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
