const fs = require("fs");
const path = require("path");
const electron = require("electron");

function isPackagedApp() {
  return Boolean(electron.app && electron.app.isPackaged);
}

function getBundleRoot() {
  if (isPackagedApp()) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, "..", "..");
}

function getRuntimeRoot() {
  if (isPackagedApp()) {
    return path.dirname(process.execPath);
  }
  return path.resolve(__dirname, "..", "..");
}

function bundlePath(...parts) {
  return path.join(getBundleRoot(), ...parts);
}

function dataPath(...parts) {
  return path.join(getRuntimeRoot(), ...parts);
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyIfMissing(source, destination) {
  if (!fs.existsSync(source) || fs.existsSync(destination)) {
    return;
  }

  ensureDirectory(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function syncFromBundle(source, destination) {
  if (!fs.existsSync(source)) {
    return;
  }

  ensureDirectory(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function ensureRuntimeFiles() {
  ensureDirectory(dataPath("config"));
  ensureDirectory(dataPath("upload_import"));
  ensureDirectory(dataPath("logs"));
  ensureDirectory(dataPath("docs"));
  ensureDirectory(dataPath("assets"));
  ensureDirectory(dataPath("assets", "icons"));

  copyIfMissing(bundlePath("config", "mappings.json"), dataPath("config", "mappings.json"));
  copyIfMissing(bundlePath("config", "rules.json"), dataPath("config", "rules.json"));
  syncFromBundle(bundlePath("config", "app_version.json"), dataPath("config", "app_version.json"));
  copyIfMissing(bundlePath("config", "upload_profiles.json"), dataPath("config", "upload_profiles.json"));
  copyIfMissing(bundlePath("config", "upload_credentials.json"), dataPath("config", "upload_credentials.json"));
  copyIfMissing(bundlePath("upload_import", "README.txt"), dataPath("upload_import", "README.txt"));
  copyIfMissing(bundlePath("upload_import", "decrypt-winscp.ps1"), dataPath("upload_import", "decrypt-winscp.ps1"));
  syncFromBundle(bundlePath("docs", "USER_GUIDE.md"), dataPath("docs", "USER_GUIDE.md"));
  copyIfMissing(bundlePath("assets", "icons", "ccrs_app_icon.ico"), dataPath("assets", "icons", "ccrs_app_icon.ico"));
  copyIfMissing(bundlePath("assets", "icons", "ccrs_app_icon.png"), dataPath("assets", "icons", "ccrs_app_icon.png"));
}

module.exports = {
  bundlePath,
  dataPath,
  ensureRuntimeFiles,
  getRuntimeRoot,
};
