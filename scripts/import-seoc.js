const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const situationalSeocOptions = require("../config/situational_seoc_options.json");

const SEOC_NUMBER_COLUMN = "seoc_source_key/Number";
const SEOC_ID_COLUMN = "seoc_id";
const VERSION_SUFFIX_PATTERN = /_(\d+(?:\.\d+){1,3})(?:_([A-Za-z0-9_]+))?$/;
const SITUATIONAL_LOGICAL_KEYS = new Set(
  situationalSeocOptions.map((option) => `${String(option.seocNumber)}\u0000${String(option.name)}`)
);

function normalizeCell(value) {
  return String(value ?? "").trim();
}

function splitVersionedSeocId(value) {
  const seocId = normalizeCell(value);
  const match = seocId.match(VERSION_SUFFIX_PATTERN);
  if (!match) {
    return { name: seocId, version: [], qualifiers: "" };
  }
  return {
    name: seocId.slice(0, match.index).trim(),
    version: match[1].split(".").map(Number),
    qualifiers: String(match[2] || "").trim(),
  };
}

function compareVersions(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function shouldReplaceCurrent(current, candidate) {
  const versionDifference = compareVersions(candidate.version, current.version);
  if (versionDifference !== 0) return versionDifference > 0;
  return candidate.seocId.localeCompare(current.seocId, "en", { numeric: true }) > 0;
}

function convertWorksheet(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });
  const headers = Object.keys(rows[0] || {});
  const missingColumns = [SEOC_NUMBER_COLUMN, SEOC_ID_COLUMN].filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Missing required SEOC column(s): ${missingColumns.join(", ")}`);
  }

  const logicalRecords = new Map();
  for (const row of rows) {
    const seocNumber = normalizeCell(row[SEOC_NUMBER_COLUMN]);
    const seocId = normalizeCell(row[SEOC_ID_COLUMN]);
    if (!seocNumber || !seocId) continue;
    const parsed = splitVersionedSeocId(seocId);
    if (!parsed.name) continue;
    const identity = `${seocNumber}\u0000${parsed.name}`;
    if (SITUATIONAL_LOGICAL_KEYS.has(identity)) continue;
    const candidate = {
      seocNumber,
      seocId,
      name: parsed.name,
      displayName: `${parsed.name} - ${seocNumber}`,
      version: parsed.version,
    };
    const current = logicalRecords.get(identity);
    if (!current || shouldReplaceCurrent(current, candidate)) logicalRecords.set(identity, candidate);
  }

  return [...logicalRecords.values()]
    .sort((left, right) =>
      left.name.localeCompare(right.name, "en", { numeric: true, sensitivity: "base" }) ||
      left.seocNumber.localeCompare(right.seocNumber, "en", { numeric: true })
    )
    .map(({ version: _version, ...record }) => record);
}

function importSeoc(inputPath, outputPath) {
  const workbook = XLSX.readFile(inputPath, { cellDates: false });
  const [sheetName] = workbook.SheetNames;
  if (!sheetName) throw new Error("The SEOC workbook does not contain a worksheet.");
  const records = convertWorksheet(workbook.Sheets[sheetName]);
  if (records.length === 0) throw new Error("The SEOC workbook did not contain any usable records.");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return { count: records.length, sheetName };
}

if (require.main === module) {
  const cliArguments = process.argv.slice(2).filter((argument) => argument !== "--");
  const inputPath = path.resolve(cliArguments[0] || "");
  const outputPath = path.resolve(cliArguments[1] || path.join(__dirname, "..", "config", "seoc_options.json"));
  if (!cliArguments[0] || !fs.existsSync(inputPath)) {
    throw new Error("Usage: pnpm data:seoc -- <SEOC.xlsx> [output.json]");
  }
  const result = importSeoc(inputPath, outputPath);
  console.log(`Imported ${result.count} logical SEOC records from ${result.sheetName} into ${outputPath}.`);
}

module.exports = {
  SEOC_ID_COLUMN,
  SEOC_NUMBER_COLUMN,
  convertWorksheet,
  importSeoc,
  splitVersionedSeocId,
};
