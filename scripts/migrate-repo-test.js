// Verifies scripts/migrate-repo.js against a temporary Git repository.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseRepoUrl, detectCurrentRepo, rewriteText, migrate } = require("./migrate-repo");

const OLD = "https://github.com/example-owner/example-app";
const README = [
  "# App",
  `[![Release](https://img.shields.io/github/v/release/example-owner/example-app?label=release)](${OLD}/releases)`,
  `[![Smoke tests](${OLD}/actions/workflows/smoke-tests.yml/badge.svg)](${OLD}/actions/workflows/smoke-tests.yml)`,
  "Clone with git@github.com:example-owner/example-app.git or see example-owner/example-app.",
  "Unrelated: example-owner/example-app-other stays.",
  ""
].join("\n");

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-migrate-"));
  git(root, "init", "-q");
  fs.writeFileSync(path.join(root, "README.md"), README);
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), `resolved: ${OLD}\n`);
  fs.writeFileSync(path.join(root, "icon.bin"), Buffer.from([0, 1, 2]));
  git(root, "add", "-A");
  git(root, "remote", "add", "origin", `${OLD}.git`);
  return root;
}

const tests = [];
const test = (name, callback) => tests.push({ name, callback });

test("parses HTTPS, SSH, and scp-style repository URLs", () => {
  for (const url of [
    "https://github.example.gov/va-org/ccrs-app",
    "https://github.example.gov/va-org/ccrs-app.git",
    "git@github.example.gov:va-org/ccrs-app.git",
    "ssh://git@github.example.gov/va-org/ccrs-app.git"
  ]) {
    const parsed = parseRepoUrl(url);
    assert.equal(parsed.host, "github.example.gov");
    assert.equal(parsed.slug, "va-org/ccrs-app");
    assert.equal(parsed.webUrl, "https://github.example.gov/va-org/ccrs-app");
  }
  assert.throws(() => parseRepoUrl("https://github.com/only-owner"), /Not a repository URL/);
});

test("detects the current repository from the README workflow badge", () => {
  assert.equal(detectCurrentRepo(README).webUrl, OLD);
  assert.equal(detectCurrentRepo("# nothing"), null);
});

test("rewrites to another github.com repository and keeps the release badge", () => {
  const out = rewriteText(README, parseRepoUrl(OLD), parseRepoUrl("https://github.com/va-org/ccrs-app"));
  assert.match(out, /img\.shields\.io\/github\/v\/release\/va-org\/ccrs-app\?label=release/);
  assert.match(out, /https:\/\/github\.com\/va-org\/ccrs-app\/actions\/workflows\/smoke-tests\.yml\/badge\.svg/);
  assert.match(out, /git@github\.com:va-org\/ccrs-app\.git or see va-org\/ccrs-app\./);
  assert.match(out, /example-owner\/example-app-other stays/);
  assert.equal(out.split("example-owner/example-app").length - 1, 1);
});

test("replaces the shields release badge with a link on a GitHub Enterprise host", () => {
  const out = rewriteText(README, parseRepoUrl(OLD), parseRepoUrl("https://github.example.gov/va-org/ccrs-app"));
  assert.doesNotMatch(out, /img\.shields\.io\/github/);
  assert.match(out, /\[Releases\]\(https:\/\/github\.example\.gov\/va-org\/ccrs-app\/releases\)/);
  assert.match(out, /git@github\.example\.gov:va-org\/ccrs-app\.git/);
});

test("dry run changes nothing", () => {
  const root = makeRepo();
  try {
    const result = migrate({ root, targetUrl: "https://github.com/va-org/ccrs-app", dryRun: true, log: () => {} });
    assert.deepEqual(result.changed, ["README.md"]);
    assert.equal(fs.readFileSync(path.join(root, "README.md"), "utf8"), README);
    assert.equal(git(root, "remote", "get-url", "origin"), `${OLD}.git`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrates files and remotes, skips lockfile and binaries, and is repeatable", () => {
  const root = makeRepo();
  try {
    const target = "https://github.example.gov/va-org/ccrs-app.git";
    const first = migrate({ root, targetUrl: target, log: () => {} });
    assert.deepEqual(first.changed, ["README.md"]);
    assert.deepEqual(first.remaining, []);
    assert.equal(git(root, "remote", "get-url", "origin"), target);
    assert.equal(git(root, "remote", "get-url", "personal"), `${OLD}.git`);
    assert.equal(fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8"), `resolved: ${OLD}\n`);
    assert.deepEqual([...fs.readFileSync(path.join(root, "icon.bin"))], [0, 1, 2]);

    const second = migrate({ root, targetUrl: target, log: () => {} });
    assert.deepEqual(second.changed, []);
    assert.deepEqual(second.remoteActions, []);
    assert.equal(git(root, "remote").split("\n").sort().join(","), "origin,personal");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

let failed = 0;
for (const { name, callback } of tests) {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}\n${error.stack}`);
  }
}
if (failed > 0) process.exit(1);
console.log(`Repository migration: ${tests.length} tests passed.`);
