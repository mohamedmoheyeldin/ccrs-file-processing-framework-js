const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { uploadFile, loadUploadProfiles, resolveUploadTargets } = require("./uploader");

const DUPLICATE_KEY_MODES = {
  ssn: {
    label: "SSN",
    aliases: [
      "ssn",
      "socialsecuritynumber",
      "socialsecurity",
      "social_security_number",
      "social_security",
    ],
  },
  npi: {
    label: "NPI",
    aliases: ["npi", "npinumber", "npi_number"],
  },
  "full-row": {
    label: "Full Row",
    aliases: [],
  },
};
const ACCEPTED_EXCEL_EXTENSIONS = new Set([".xlsx", ".xls", ".xlsm", ".xlsb"]);

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getDuplicateMode(rawValue = "") {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (DUPLICATE_KEY_MODES[normalized]) {
    return normalized;
  }
  return "full-row";
}

function getExcelFiles(inputDir) {
  const rawInputPath = String(inputDir || "").trim();
  if (!rawInputPath) {
    throw new Error("Please select a source Excel file or folder.");
  }
  const normalizedInputPath = path.normalize(rawInputPath);

  if (!fs.existsSync(normalizedInputPath)) {
    throw new Error("The selected source path was not found.");
  }

  const sourceStats = fs.statSync(normalizedInputPath);
  if (sourceStats.isFile()) {
    const extension = path.extname(normalizedInputPath).toLowerCase();
    if (!ACCEPTED_EXCEL_EXTENSIONS.has(extension)) {
      throw new Error("Please choose an Excel file (.xlsx, .xls, .xlsm, or .xlsb).");
    }
    return [normalizedInputPath];
  }

  const discoveredFiles = [];
  const stack = [normalizedInputPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (entry.name.startsWith("~$") || !ACCEPTED_EXCEL_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      discoveredFiles.push(fullPath);
    }
  }

  return discoveredFiles.sort((left, right) => left.localeCompare(right));
}

function readWorkbookRows(filePath) {
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    raw: false,
  });

  const firstSheetName = (workbook.SheetNames || [])[0];
  if (!firstSheetName) {
    throw new Error("The workbook does not contain any worksheets.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = readSheetMatrix(sheet);

  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error("The worksheet does not contain a header row.");
  }

  const headerRow = matrix[0].map((headerCell) => String(headerCell || "").trim());
  const headers = headerRow.filter(Boolean);
  if (headers.length === 0) {
    throw new Error("The worksheet header row is empty.");
  }

  const rows = [];
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const rowCells = matrix[rowIndex];
    const rowData = {};
    for (let columnIndex = 0; columnIndex < headerRow.length; columnIndex += 1) {
      const header = headerRow[columnIndex] || `Column_${columnIndex + 1}`;
      rowData[header] = rowCells[columnIndex] === undefined ? "" : String(rowCells[columnIndex]);
    }

    rows.push({
      rowNumber: rowIndex + 1,
      values: rowData,
    });
  }

  return {
    sheetName: firstSheetName,
    headers: headerRow,
    rows,
  };
}

function readSheetMatrix(sheet) {
  const ref = String(sheet?.["!ref"] || "").trim();
  if (!ref) {
    return [];
  }

  const range = XLSX.utils.decode_range(ref);
  const matrix = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row = [];
    let hasValues = false;

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address];
      let value = "";

      if (cell && cell.v !== undefined && cell.v !== null) {
        value = cell.w !== undefined && cell.w !== null ? String(cell.w) : String(cell.v);
        if (value.trim()) {
          hasValues = true;
        }
      }

      row.push(value);
    }

    if (hasValues) {
      matrix.push(row);
    }
  }

  return matrix;
}

function resolveDuplicateColumn(headers, duplicateMode) {
  if (duplicateMode === "full-row") {
    return {
      columnName: "Full Row",
      resolver: (rowValues) => {
        return headers
          .map((header) => `${normalizeHeader(header)}=${String(rowValues[header] || "").trim()}`)
          .join("|")
          .toLowerCase();
      },
    };
  }

  const mode = DUPLICATE_KEY_MODES[duplicateMode];
  const candidate = headers.find((header) => mode.aliases.includes(normalizeHeader(header)));

  if (!candidate) {
    throw new Error(`${mode.label} column was not found in the worksheet header.`);
  }

  return {
    columnName: candidate,
    resolver: (rowValues) => String(rowValues[candidate] || "").trim().toLowerCase(),
  };
}

function collectSourceData(inputDir, duplicateKey = "full-row") {
  const duplicateMode = getDuplicateMode(duplicateKey);
  const excelFiles = getExcelFiles(inputDir);

  const files = [];
  const validationErrors = [];

  for (const filePath of excelFiles) {
    try {
      const workbookData = readWorkbookRows(filePath);
      files.push({
        filePath,
        fileName: path.basename(filePath),
        ...workbookData,
      });
    } catch (error) {
      validationErrors.push({
        fileName: path.basename(filePath),
        message: error.message,
      });
    }
  }

  const duplicates = [];
  const seenValues = new Map();
  const duplicateKeyResolvers = new Map();

  for (const file of files) {
    let duplicateColumn;
    try {
      duplicateColumn = resolveDuplicateColumn(file.headers, duplicateMode);
    } catch (error) {
      validationErrors.push({
        fileName: file.fileName,
        message: error.message,
      });
      continue;
    }

    duplicateKeyResolvers.set(file.fileName, duplicateColumn);

    for (const row of file.rows) {
      const duplicateValue = duplicateColumn.resolver(row.values);
      if (!duplicateValue) {
        continue;
      }

      const firstSeen = seenValues.get(duplicateValue);
      if (!firstSeen) {
        seenValues.set(duplicateValue, {
          fileName: file.fileName,
          rowNumber: row.rowNumber,
          duplicateValue,
        });
        continue;
      }

      duplicates.push({
        fileName: file.fileName,
        rowNumber: row.rowNumber,
        duplicateValue:
          duplicateMode === "full-row"
            ? "Matching full-row values"
            : String(row.values[duplicateColumn.columnName] || "").trim(),
        columnName: duplicateColumn.columnName,
      });
    }
  }

  return {
    duplicateMode,
    excelFiles,
    files,
    duplicateKeyResolvers,
    duplicates,
    validationErrors,
  };
}

function inspectLeieSource(payload = {}) {
  const inputDir = String(payload.inputDir || "").trim();
  if (!inputDir) {
    return {
      inputDir: "",
      duplicateKey: getDuplicateMode(payload.duplicateKey),
      fileCount: 0,
      totalRowCount: 0,
      excelFiles: [],
      duplicates: [],
      validationErrors: [],
      hasDuplicates: false,
      outputNameSuggestion: "",
    };
  }

  const sourceData = collectSourceData(inputDir, payload.duplicateKey);
  const firstFileName = sourceData.excelFiles[0] ? path.parse(path.basename(sourceData.excelFiles[0])).name : "";

  return {
    inputDir,
    duplicateKey: sourceData.duplicateMode,
    fileCount: sourceData.excelFiles.length,
    totalRowCount: sourceData.files.reduce((sum, file) => sum + file.rows.length, 0),
    excelFiles: sourceData.files.map((file) => ({
      name: file.fileName,
      path: file.filePath,
      rowCount: file.rows.length,
    })),
    duplicates: sourceData.duplicates,
    validationErrors: sourceData.validationErrors,
    hasDuplicates: sourceData.duplicates.length > 0,
    outputNameSuggestion: firstFileName ? `Processed_${firstFileName}` : "",
  };
}

function sanitizeLeieOutputName(fileName = "") {
  const sanitized = String(fileName || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\.\s]+$/g, "");

  return sanitized;
}

function buildOutputHeaders(files) {
  const orderedHeaders = [];
  const seenHeaders = new Set();

  for (const file of files) {
    for (const header of file.headers) {
      const normalizedHeader = String(header || "").trim();
      if (!normalizedHeader || seenHeaders.has(normalizedHeader)) {
        continue;
      }
      seenHeaders.add(normalizedHeader);
      orderedHeaders.push(normalizedHeader);
    }
  }

  return orderedHeaders;
}

function buildRowFingerprint(rowValues, headers) {
  return headers
    .map((header) => `${normalizeHeader(header)}=${String(rowValues[header] || "").trim().toLowerCase()}`)
    .join("|");
}

function buildDedupedRows(sourceData, duplicateMode, duplicateHandling) {
  const headers = buildOutputHeaders(sourceData.files);
  const rows = [];
  const seenValues = new Set();

  for (const file of sourceData.files) {
    const duplicateColumn = sourceData.duplicateKeyResolvers.get(file.fileName);
    if (!duplicateColumn) {
      continue;
    }

    for (const row of file.rows) {
      let rowKey = "";
      if (duplicateMode === "full-row") {
        rowKey = buildRowFingerprint(row.values, headers);
      } else {
        rowKey = duplicateColumn.resolver(row.values);
      }

      if (duplicateHandling === "auto-remove") {
        if (rowKey && seenValues.has(rowKey)) {
          continue;
        }
        if (rowKey) {
          seenValues.add(rowKey);
        }
      }

      rows.push(row.values);
    }
  }

  return { headers, rows };
}

function buildLeieUploadOptions(payload = {}) {
  const uploadPayload = payload.upload || {};
  if (!uploadPayload.enabled) {
    return null;
  }

  return {
    enabled: true,
    targets: resolveUploadTargets(loadUploadProfiles(), uploadPayload.targets || []),
  };
}

async function processLeieFiles(payload = {}, progressCallback) {
  const inputDir = String(payload.inputDir || "").trim();
  const outputDir = String(payload.outputDir || "").trim();
  const duplicateMode = getDuplicateMode(payload.duplicateKey);
  const duplicateHandling = String(payload.duplicateHandling || "manual").trim().toLowerCase();

  if (!inputDir) {
    throw new Error("Please select a source Excel file or folder.");
  }
  if (!outputDir) {
    throw new Error("Please select an output folder.");
  }

  const sourceData = collectSourceData(inputDir, duplicateMode);
  if (sourceData.excelFiles.length === 0) {
    throw new Error("No Excel files (.xlsx, .xls, .xlsm, .xlsb) were found in the selected source path.");
  }

  if (sourceData.validationErrors.length > 0) {
    const firstError = sourceData.validationErrors[0];
    throw new Error(`${firstError.fileName}: ${firstError.message}`);
  }

  if (progressCallback) {
    progressCallback(1, 3, path.basename(sourceData.excelFiles[0]), "file-loaded");
  }

  if (sourceData.duplicates.length > 0 && duplicateHandling !== "auto-remove") {
    if (progressCallback) {
      progressCallback(2, 3, "duplicates", "duplicates-found");
    }
    throw new Error("Duplicates were found. Resolve duplicates before saving the processed file.");
  }

  if (progressCallback) {
    progressCallback(2, 3, "processing", "processing");
  }

  const fallbackBaseName = path.parse(path.basename(sourceData.excelFiles[0])).name || "processed_leie";
  const requestedOutputName = sanitizeLeieOutputName(payload.outputFileName || "");
  const outputBaseName = requestedOutputName || fallbackBaseName;
  const outputFileName = `${outputBaseName}.xlsx`;
  const outputPath = path.join(outputDir, outputFileName);

  fs.mkdirSync(outputDir, { recursive: true });

  const processed = buildDedupedRows(sourceData, duplicateMode, duplicateHandling);
  const worksheet = XLSX.utils.json_to_sheet(processed.rows, {
    header: processed.headers,
    skipHeader: false,
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "LEIE_Processed");
  XLSX.writeFile(workbook, outputPath, { bookType: "xlsx" });

  if (progressCallback) {
    progressCallback(3, 3, outputFileName, "ready-to-save");
  }

  const uploadedPaths = [];
  const uploadOptions = buildLeieUploadOptions(payload);
  if (uploadOptions && uploadOptions.enabled) {
    for (let index = 0; index < uploadOptions.targets.length; index += 1) {
      const uploadTarget = uploadOptions.targets[index];
      if (progressCallback) {
        progressCallback(
          index + 1,
          uploadOptions.targets.length,
          outputFileName,
          "uploading",
          uploadTarget.server_name
        );
      }

      const uploadedPath = await uploadFile(
        outputPath,
        uploadTarget.remote_directory,
        uploadTarget.connection_details
      );

      uploadedPaths.push({
        server_name: uploadTarget.server_name,
        remote_path: uploadedPath,
      });
    }

    if (progressCallback) {
      progressCallback(uploadedPaths.length, uploadedPaths.length, outputFileName, "upload-complete");
    }
  }

  const uploadedMessage = uploadedPaths.length
    ? ` Uploaded file to ${uploadedPaths.map((item) => `${item.server_name} (${item.remote_path})`).join(", ")}.`
    : "";

  return {
    message: `LEIE processing complete. Saved ${outputFileName} to ${outputDir}.${uploadedMessage}`,
    outputPath,
    outputFileName,
    duplicatesRemoved: duplicateHandling === "auto-remove" ? sourceData.duplicates.length : 0,
    uploadedPaths,
  };
}

module.exports = {
  inspectLeieSource,
  processLeieFiles,
  sanitizeLeieOutputName,
};
