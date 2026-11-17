// Bundles the React renderer (Untitled UI React + Tailwind CSS) into electron/renderer/dist.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");

const projectRoot = path.resolve(__dirname, "..");
const rendererRoot = path.join(projectRoot, "electron", "renderer");
const sourceRoot = path.join(rendererRoot, "src");
const outputRoot = path.join(rendererRoot, "dist");
const watch = process.argv.includes("--dev");

function buildStyles() {
  const cliEntry = path.join(path.dirname(require.resolve("@tailwindcss/cli/package.json")), "dist", "index.mjs");
  const result = spawnSync(
    process.execPath,
    [cliEntry, "-i", path.join(sourceRoot, "app.css"), "-o", path.join(outputRoot, "renderer.css"), ...(watch ? [] : ["--minify"])],
    { cwd: projectRoot, encoding: "utf8" }
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "Tailwind CSS build failed.\n");
    process.exit(result.status || 1);
  }
}

function copyFonts() {
  const fontSource = path.join(
    projectRoot,
    "node_modules",
    "@fontsource-variable",
    "inter",
    "files",
    "inter-latin-wght-normal.woff2"
  );
  fs.mkdirSync(path.join(outputRoot, "fonts"), { recursive: true });
  fs.copyFileSync(fontSource, path.join(outputRoot, "fonts", "inter-latin-wght-normal.woff2"));
}

async function buildScripts() {
  await esbuild.build({
    entryPoints: [path.join(sourceRoot, "main.jsx")],
    outfile: path.join(outputRoot, "renderer.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome130",
    jsx: "automatic",
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    legalComments: "none",
    alias: { "@": path.join(sourceRoot, "ui") },
    define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
    logLevel: "warning",
  });
}

async function run() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  await buildScripts();
  buildStyles();
  copyFonts();
  console.log("Renderer bundle written to electron/renderer/dist.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
