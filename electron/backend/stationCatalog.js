const fs = require("fs");
const { bundlePath, dataPath } = require("./appPaths");

const STATIONS_FILE = "stations.json";
const DISPLAY_FIELDS = [
  "station_key",
  "station_id",
  "visn_id",
  "station_name",
  "parent_station_id",
];

let cachedStations = null;

function normalizeStation(station) {
  if (!station || typeof station !== "object") {
    return null;
  }

  const normalized = Object.fromEntries(Object.entries(station).map(([key, value]) => {
    if (value === undefined || value === null || String(value).trim().toUpperCase() === "NULL") {
      return [key, null];
    }
    return [key, String(value).trim().replace(/\s+/g, " ")];
  }));
  normalized.station_key = normalized.station_key || normalized.stationKey || null;
  normalized.station_id = normalized.station_id || normalized.stationId || null;
  normalized.station_name = normalized.station_name || normalized.stationName || null;

  if (!normalized.station_key) {
    return null;
  }

  return normalized;
}

function normalizeStations(rawStations) {
  const stations = [];
  const seenKeys = new Set();

  for (const rawStation of Array.isArray(rawStations) ? rawStations : []) {
    const station = normalizeStation(rawStation);
    if (!station || seenKeys.has(station.station_key)) {
      continue;
    }

    seenKeys.add(station.station_key);
    stations.push(station);
  }

  return stations;
}

function tryLoadStations(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return normalizeStations(raw);
}

function loadStations() {
  if (cachedStations) {
    return cachedStations;
  }

  for (const filePath of [
    dataPath("config", STATIONS_FILE),
    bundlePath("config", STATIONS_FILE),
  ]) {
    try {
      const stations = tryLoadStations(filePath);
      if (stations) {
        cachedStations = stations;
        return cachedStations;
      }
    } catch (_error) {
      // Ignore invalid catalog files and fall back to the next location.
    }
  }

  cachedStations = [];
  return cachedStations;
}

function loadStationOptions() {
  return loadStations()
    .filter((station) => station.station_id)
    .map((station) => ({
      stationKey: station.station_id,
      stationName: station.station_name || `Station key ${station.station_key}`,
    }));
}

module.exports = {
  DISPLAY_FIELDS,
  loadStations,
  loadStationOptions,
  normalizeStations,
};
