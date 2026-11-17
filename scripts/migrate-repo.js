// Points this checkout at a new GitHub repository (for example a VA GitHub
// organization or GitHub Enterprise host) and rewrites every hardcoded
// reference to the old one.
//
//   pnpm run migrate:repo -- <new-repo-url> [--dry-run] [--no-remote] [--keep-remote-as <name>]
//
// It never pushes, creates tags, or publishes. See docs/REPOSITORY_MIGRATION.md.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SKIPPED_FILES = new Set(["pnpm-lock.yaml", "scripts/migrate-repo-test.js"]);
const NAME = "[A-Za-z0-9][A-Za-z0-9._-]*";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRepoUrl(input) {
  const value = String(input || "").trim();
  const patterns = [
    new RegExp(`^https?://(?:[^@/]+@)?([^/:]+)(?::\\d+)?/(${NAME})/(${NAME}?)(?:\\.git)?/?$`),
    new RegExp(`^ssh://(?:[^@/]+@)?([^/:]+)(?::\\d+)?/(${NAME})/(${NAME}?)(?:\\.git)?/?$`),
    new RegExp(`^(?:[^@/]+@)?([^/:]+):(${NAME})/(${NAME}?)(?:\\.git)?$`)
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      const [, host, owner, rawRepo] = match;
      const repo = rawRepo.replace(/\.git$/, "");
      return { host: host.toLowerCase(), owner, repo, slug: `${owner}/${repo}`, webUrl: `https://${host.toLowerCase()}/${owner}/${repo}` };
    }
  }
  throw new Error(`Not a repository URL: "${value}". Expected https://<host>/<owner>/<repo> or git@<host>:<owner>/<repo>.git`);
}

function sameRepo(a, b) {
  return a.host === b.host && a.slug.toLowerCase() === b.slug.toLowerCase();
}

function detectCurrentRepo(readmeText) {
  const match = readmeText.match(new RegExp(`https://([^/\\s)]+)/(${NAME})/(${NAME})/actions/workflows/`));
  if (!match) return null;
  return parseRepoUrl(`https://${match[1]}/${match[2]}/${match[3]}`);
}

// Returns the text with every reference to `from` replaced by `to`.
function rewriteText(text, from, to) {
  const end = "(?![A-Za-z0-9_-])";
  let result = text;
  if (to.host !== "github.com") {
    // shields.io cannot read releases from a GitHub Enterprise host; fall back to a plain link.
    const releaseBadge = new RegExp(
      `\\[!\\[Release\\]\\(https://img\\.shields\\.io/github/v/release/${escapeRegExp(from.slug)}[^)]*\\)\\]\\(([^)]*)\\)`,
      "g"
    );
    result = result.replace(releaseBadge, "[Releases]($1)");
  }
  result = result.replace(new RegExp(`https?://${escapeRegExp(from.host)}/${escapeRegExp(from.slug)}${end}`, "g"), to.webUrl);
  result = result.replace(new RegExp(`git@${escapeRegExp(from.host)}:${escapeRegExp(from.slug)}${end}`, "g"), `git@${to.host}:${to.slug}`);
  result = result.replace(new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRegExp(from.slug)}${end}`, "gm"), `$1${to.slug}`);
  return result;
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: result.status === 0, stdout: (result.stdout || "").trim(), stderr: (result.stderr || "").trim() };
}

function listTrackedTextFiles(root) {
  const listed = git(root, ["ls-files", "-z"]);
  if (!listed.ok) throw new Error(`git ls-files failed: ${listed.stderr}`);
  return listed.stdout.split("\0").filter((file) => file && !SKIPPED_FILES.has(file));
}

function rewriteFiles(root, from, to, { dryRun = false } = {}) {
  const changed = [];
  for (const file of listTrackedTextFiles(root)) {
    const filePath = path.join(root, file);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const buffer = fs.readFileSync(filePath);
    if (buffer.includes(0)) continue; // binary
    const text = buffer.toString("utf8");
    const rewritten = rewriteText(text, from, to);
    if (rewritten !== text) {
      changed.push(file);
      if (!dryRun) fs.writeFileSync(filePath, rewritten);
    }
  }
  return changed;
}

function findRemainingReferences(root, from) {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRegExp(from.slug)}(?![A-Za-z0-9_-])`, "m");
  return listTrackedTextFiles(root).filter((file) => {
    const filePath = path.join(root, file);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    const buffer = fs.readFileSync(filePath);
    return !buffer.includes(0) && pattern.test(buffer.toString("utf8"));
  });
}

// Makes `origin` the new repository and keeps the previous origin under another name.
function updateRemotes(root, targetUrl, to, { dryRun = false, keepAs = "personal" } = {}) {
  const actions = [];
  const run = (args) => {
    actions.push(`git ${args.join(" ")}`);
    if (dryRun) return;
    const result = git(root, args);
    if (!result.ok) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  };
  const origin = git(root, ["remote", "get-url", "origin"]);
  if (origin.ok) {
    let originRepo = null;
    try { originRepo = parseRepoUrl(origin.stdout); } catch { /* unusual URL: treat as different */ }
    if (originRepo && sameRepo(originRepo, to)) return actions;
    if (git(root, ["remote", "get-url", keepAs]).ok) run(["remote", "set-url", "origin", targetUrl]);
    else {
      run(["remote", "rename", "origin", keepAs]);
      run(["remote", "add", "origin", targetUrl]);
    }
  } else {
    run(["remote", "add", "origin", targetUrl]);
  }
  return actions;
}

function migrate({ root, targetUrl, fromUrl, dryRun = false, updateRemote = true, keepAs = "personal", log = console.log }) {
  const to = parseRepoUrl(targetUrl);
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const from = fromUrl ? parseRepoUrl(fromUrl) : detectCurrentRepo(readme);
  if (!from) throw new Error("Could not detect the current repository from README.md. Pass --from <old-repo-url>.");

  const prefix = dryRun ? "[dry run] " : "";
  let changed = [];
  if (sameRepo(from, to)) log(`Files already reference ${to.webUrl}.`);
  else {
    changed = rewriteFiles(root, from, to, { dryRun });
    log(`${prefix}Rewrote ${from.webUrl} -> ${to.webUrl} in ${changed.length} file(s).`);
    changed.forEach((file) => log(`  ${file}`));
  }

  const remoteActions = updateRemote ? updateRemotes(root, targetUrl, to, { dryRun, keepAs }) : [];
  remoteActions.forEach((action) => log(`${prefix}${action}`));
  if (updateRemote && remoteActions.length === 0) log("Remote origin already points at the target.");

  const remaining = dryRun || sameRepo(from, to) ? [] : findRemainingReferences(root, from);
  if (remaining.length > 0) {
    log(`Review these files, which still mention ${from.slug}:`);
    remaining.forEach((file) => log(`  ${file}`));
  }
  if (to.host !== "github.com") {
    log(`Note: ${to.host} is not github.com. Check the GitHub Enterprise items in docs/REPOSITORY_MIGRATION.md.`);
  }
  log("Next: pnpm verify, commit, then push branches only (no tags). See docs/REPOSITORY_MIGRATION.md.");
  return { from, to, changed, remoteActions, remaining };
}

function main(argv) {
  const args = argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    const value = args[index + 1];
    args.splice(index, 2);
    return value;
  };
  const flag = (name) => {
    const index = args.indexOf(name);
    if (index === -1) return false;
    args.splice(index, 1);
    return true;
  };
  const fromUrl = option("--from");
  const keepAs = option("--keep-remote-as") || "personal";
  const dryRun = flag("--dry-run");
  const updateRemote = !flag("--no-remote");
  const [targetUrl] = args.filter((arg) => arg !== "--");
  if (!targetUrl) {
    console.error("Usage: pnpm run migrate:repo -- <new-repo-url> [--dry-run] [--no-remote] [--keep-remote-as <name>] [--from <old-repo-url>]");
    process.exit(2);
  }
  try {
    migrate({ root: path.resolve(__dirname, ".."), targetUrl, fromUrl, dryRun, updateRemote, keepAs });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) main(process.argv);

module.exports = { parseRepoUrl, detectCurrentRepo, rewriteText, migrate };
