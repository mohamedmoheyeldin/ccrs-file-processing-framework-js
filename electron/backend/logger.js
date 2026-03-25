const fs = require("fs");
const path = require("path");
const { dataPath } = require("./appPaths");

let logFilePath = "";

function setupLogger() {
  const logsDir = dataPath("logs");
  fs.mkdirSync(logsDir, { recursive: true });
  logFilePath = path.join(logsDir, "process.log");
}

function log(level, message) {
  if (!logFilePath) {
    setupLogger();
  }

  const line = `${new Date().toISOString()} - ${level.toUpperCase()} - ${message}\n`;
  fs.appendFileSync(logFilePath, line, "utf8");
}

module.exports = {
  setupLogger,
  log,
};
