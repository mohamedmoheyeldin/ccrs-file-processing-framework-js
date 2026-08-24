const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const REQUIRED_COLUMNS = [
  "station_key",
  "station_id",
  "visn_id",
  "station_name",
  "parent_station_id",
];

function normalizeCell(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return !normalized || normalized.toUpperCase() === "NULL" ? null : normalized;
}

function convertWorksheet(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    raw: false,
  });
  const headers = Object.keys(rows[0] || {});
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Missing required station column(s): ${missingColumns.join(", ")}`);
  }

  const stations = rows.map((row) => Object.fromEntries(
    headers.map((header) => [header, normalizeCell(row[header])])
  ));
  const stationKeys = stations.map((station) => station.station_key).filter(Boolean);
  if (new Set(stationKeys).size !== stationKeys.length) {
    throw new Error("The station_key column must contain unique non-empty values.");
  }
  if (stationKeys.length !== stations.length) {
    throw new Error("Every station row must have a station_key.");
  }

  return stations;
}

function importStations(inputPath, outputPath) {
  const workbook = XLSX.readFile(inputPath, { cellDates: false });
  const [sheetName] = workbook.SheetNames;
  if (!sheetName) {
    throw new Error("The station workbook does not contain a worksheet.");
  }

  const stations = convertWorksheet(workbook.Sheets[sheetName]);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(stations, null, 2)}\n`, "utf8");
  return { count: stations.length, sheetName };
}

if (require.main === module) {
  const cliArguments = process.argv.slice(2).filter((argument) => argument !== "--");
  const inputPath = path.resolve(cliArguments[0] || "");
  const outputPath = path.resolve(
    cliArguments[1] || path.join(__dirname, "..", "config", "stations.json")
  );
  if (!cliArguments[0] || !fs.existsSync(inputPath)) {
    throw new Error("Usage: pnpm data:stations -- <stations.xlsx> [output.json]");
  }

  const result = importStations(inputPath, outputPath);
  console.log(`Imported ${result.count} stations from ${result.sheetName} into ${outputPath}.`);
}

module.exports = {
  REQUIRED_COLUMNS,
  convertWorksheet,
  importStations,
  normalizeCell,
};
