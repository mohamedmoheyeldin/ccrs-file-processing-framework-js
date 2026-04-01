const fs = require("fs");
const { bundlePath, dataPath } = require("./appPaths");

const STATION_OPTIONS_FILE = "station_options.json";

let cachedStationOptions = null;

function normalizeStationOption(option) {
  if (!option || typeof option !== "object") {
    return null;
  }

  const stationKey = String(option.stationKey || option.station_key || "").trim();
  const stationName = String(option.stationName || option.station_name || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!stationKey || !stationName) {
    return null;
  }

  return { stationKey, stationName };
}

function normalizeStationOptions(rawOptions) {
  const options = [];
  const seenKeys = new Set();

  for (const rawOption of Array.isArray(rawOptions) ? rawOptions : []) {
    const option = normalizeStationOption(rawOption);
    if (!option || seenKeys.has(option.stationKey)) {
      continue;
    }

    seenKeys.add(option.stationKey);
    options.push(option);
  }

  return options;
}

function tryLoadStationOptions(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return normalizeStationOptions(raw);
}

function loadStationOptions() {
  if (cachedStationOptions) {
    return cachedStationOptions;
  }

  for (const filePath of [
    dataPath("config", STATION_OPTIONS_FILE),
    bundlePath("config", STATION_OPTIONS_FILE),
  ]) {
    try {
      const options = tryLoadStationOptions(filePath);
      if (options) {
        cachedStationOptions = options;
        return cachedStationOptions;
      }
    } catch (_error) {
      // Ignore invalid catalog files and fall back to the next location.
    }
  }

  cachedStationOptions = [];
  return cachedStationOptions;
}

module.exports = {
  loadStationOptions,
};
