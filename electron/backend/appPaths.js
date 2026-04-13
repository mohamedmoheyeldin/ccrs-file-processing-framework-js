const fs = require("fs");
const os = require("os");
const path = require("path");
let electron = null;
try {
  electron = require("electron");
} catch (_error) {
  electron = null;
}

const USER_CONFIG_DIRECTORY_NAME = "CCRS File Processing Framework";

function isPackagedApp() {
  return Boolean(electron && electron.app && electron.app.isPackaged);
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

function getDefaultUserConfigRoot() {
  const baseDirectory = process.env.APPDATA || path.join(os.homedir(), ".config");
  return path.join(baseDirectory, USER_CONFIG_DIRECTORY_NAME);
}

function getPortableExecutableRoot() {
  return String(process.env.PORTABLE_EXECUTABLE_DIR || "").trim();
}

function getPackagedDataRoot() {
  const overridePath = String(process.env.CCRS_USER_DATA_ROOT || "").trim();
  if (overridePath) {
    return overridePath;
  }

  const portableRoot = getPortableExecutableRoot();
  if (portableRoot) {
    return portableRoot;
  }

  return getDefaultUserConfigRoot();
}

function bundlePath(...parts) {
  return path.join(getBundleRoot(), ...parts);
}

function dataPath(...parts) {
  if (isPackagedApp()) {
    return path.join(getPackagedDataRoot(), ...parts);
  }
  return path.join(getRuntimeRoot(), ...parts);
}

function getUserConfigRoot() {
  const overridePath = String(process.env.CCRS_USER_DATA_ROOT || "").trim();
  if (overridePath) {
    return overridePath;
  }

  if (isPackagedApp()) {
    return getPackagedDataRoot();
  }

  return getDefaultUserConfigRoot();
}

function userDataPath(...parts) {
  return path.join(getUserConfigRoot(), ...parts);
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
  ensureDirectory(userDataPath("config"));
  ensureDirectory(userDataPath("upload_import"));
  ensureDirectory(userDataPath("logs"));

  copyIfMissing(dataPath("config", "ui_settings.json"), userDataPath("config", "ui_settings.json"));
  copyIfMissing(dataPath("upload_import", "WinSCP.ini"), userDataPath("upload_import", "WinSCP.ini"));

  copyIfMissing(bundlePath("config", "mappings.json"), dataPath("config", "mappings.json"));
  copyIfMissing(bundlePath("config", "rules.json"), dataPath("config", "rules.json"));
  copyIfMissing(bundlePath("config", "station_options.json"), dataPath("config", "station_options.json"));
  syncFromBundle(bundlePath("config", "app_version.json"), dataPath("config", "app_version.json"));
  copyIfMissing(bundlePath("config", "ui_settings.json"), userDataPath("config", "ui_settings.json"));
  copyIfMissing(bundlePath("upload_import", "README.txt"), userDataPath("upload_import", "README.txt"));
  copyIfMissing(bundlePath("upload_import", "decrypt-winscp.ps1"), userDataPath("upload_import", "decrypt-winscp.ps1"));
  syncFromBundle(bundlePath("docs", "USER_GUIDE.md"), dataPath("docs", "USER_GUIDE.md"));
  syncFromBundle(bundlePath("docs", "USER_GUIDE.pdf"), dataPath("docs", "USER_GUIDE.pdf"));
  syncFromBundle(
    bundlePath("docs", "LEIE_UPLOAD_VALIDATION_GUIDE.md"),
    dataPath("docs", "LEIE_UPLOAD_VALIDATION_GUIDE.md")
  );
  syncFromBundle(
    bundlePath("docs", "LEIE_Data_Upload_Validation_Guide.md"),
    dataPath("docs", "LEIE_Data_Upload_Validation_Guide.md")
  );
  copyIfMissing(bundlePath("assets", "icons", "ccrs_app_icon.ico"), dataPath("assets", "icons", "ccrs_app_icon.ico"));
  copyIfMissing(bundlePath("assets", "icons", "ccrs_app_icon.png"), dataPath("assets", "icons", "ccrs_app_icon.png"));
}

module.exports = {
  bundlePath,
  dataPath,
  ensureRuntimeFiles,
  getRuntimeRoot,
  getUserConfigRoot,
  userDataPath,
};
