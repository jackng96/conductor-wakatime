const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pkg = require("../package.json");

test("package metadata supports safe global npm installs", () => {
  assert.equal(pkg.scripts.install, undefined);
  assert.equal(pkg.bin["conductor-wakatime"], "./bin/conductor-wakatime.js");
  assert.deepEqual(pkg.files, [
    "bin/",
    "src/",
    "README.md",
    "LICENSE",
  ]);
  assert.equal(pkg.repository.url, "git+https://github.com/jackng96/conductor-wakatime.git");
});

test("package and README keep doctor internal", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");

  assert.equal(pkg.scripts.doctor, undefined);
  assert.equal(readme.includes("doctor"), false);
});
