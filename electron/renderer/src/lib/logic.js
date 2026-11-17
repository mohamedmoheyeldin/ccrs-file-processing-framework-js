// Pure helpers shared by the renderer. Nothing in this file touches the DOM or React state.

export const DATE_PARTS = [
  { key: "year", label: "Year", width: 4, min: 0, max: 9999 },
  { key: "month", label: "Month", width: 2, min: 0, max: 12 },
  { key: "day", label: "Day", width: 2, min: 0, max: 31 },
  { key: "hour", label: "Hour", width: 2, min: 0, max: 23 },
  { key: "minute", label: "Minute", width: 2, min: 0, max: 59 },
  { key: "second", label: "Second", width: 2, min: 0, max: 59 },
];

export const STATION_RESULT_LIMIT = 60;
export const SEOC_RESULT_LIMIT = 60;
export const NETWORK_VALUES = Object.freeze(["CCN1", "CCN2", "CCN3", "CCN4", "CCN5"]);
export const ACTIVE_STATUS_PATTERN =
  /working|processing|generating|uploading|importing|scanning|validating|packaging|archive|cancelling|testing|preparing/i;

export const ARCHIVE_NAMING_MODES = ["referral-number", "network", "referral-date-time", "custom"];
export const ARCHIVE_CUSTOM_VALUES = [
  { value: "referralNumber", id: "archive-custom-value-referral-number", label: "Referral Number" },
  { value: "referralPrefix", id: "archive-custom-value-referral-prefix", label: "Referral Prefix" },
  { value: "networkName", id: "archive-custom-value-network-name", label: "Network Name" },
  { value: "date", id: "archive-custom-value-date", label: "Date" },
  { value: "dateTime", id: "archive-custom-value-date-time", label: "Date and Time" },
  { value: "customText", id: "archive-custom-value-custom-text", label: "Custom Text" },
];

export const REFERRAL_DATE_FIELDS = {
  overrideReferralDate: "ReferralDate",
  overrideReferralDateTime: "ReferralDateTime",
  overrideReferralExpirationDate: "ReferralExpirationDate",
  overrideReferralLastUpdateDate: "ReferralLastUpdateDate",
};

export const DEFAULT_FORM = Object.freeze({
  theme: "light",
  mainTab: "referral",
  subTab: "edit",
  optionalFieldsVisible: false,
  inputDir: "",
  outputDir: "",
  replacementCode: "",
  archiveBasename: "referrals",
  archiveAppendNetwork: false,
  archiveAppendReferralDateTime: false,
  useIfamsFilenamePrefix: false,
  archiveNamingMode: "referral-number",
  archiveCustomValues: ["referralNumber", "customText"],
  archiveCustomText: "",
  masterFileName: "",
  referralPrefixMode: "va",
  customReferralPrefix: "",
  referralCode: "",
  ssnValue: "999-99-0001",
  randomizeSsn: true,
  randomizeDob: true,
  randomizeStationId: false,
  matchSuffixLength: "5",
  icnMode: "test-dynamic",
  icnCustomValue: "",
  selectedStationIds: [],
  selectedNetworks: [],
  useAllNetworks: false,
  selectedSeocKeys: [],
  useAllSeocs: false,
  selectedSituationalSeocKeys: [],
  useAllSituationalSeocs: false,
  selectedPaymentCodes: [],
  useAllPaymentCodes: true,
  overrideReferralPeriod: "",
  overrideDob: "",
  overrideReferralCategory: "",
  useCurrentReferralDates: true,
  overrideReferralDate: "",
  overrideReferralDateTime: "",
  overrideReferralExpirationDate: "",
  overrideReferralLastUpdateDate: "",
  overrideReferralConsultId: "",
  fileCount: "1",
  referralsPerFile: "1",
  clearOutput: false,
  keepMasterJson: true,
  keepProcessedJson: true,
  uploadEnabled: false,
  uploadTargets: {},
  leieDuplicateKey: "full-row",
  leieDuplicateHandling: "manual",
  leieOutputFileName: "",
  leieValidationBatchId: "",
});

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export function isExcelPath(value) {
  return /\.(xlsx|xls|xlsm|xlsb)$/i.test(String(value || "").trim());
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return Number(count) === 1 ? singular : pluralForm;
}

export function normalizeDigits(value, width) {
  return (String(value || "").match(/\d/g) || []).join("").slice(0, width);
}

export function keepCharacters(value, pattern) {
  return (String(value || "").match(pattern) || []).join("");
}

export function sanitizeLeieFileNameInput(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/g, "");
}

export function sanitizeReferralNumberInput(value, customReferralPrefix = "") {
  let normalized = String(value || "").trim();
  const prefixes = [customReferralPrefix, "VAiFAMS", "iFAMS", "VA"]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  for (const prefix of prefixes) {
    if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  return keepCharacters(normalized, /[A-Za-z0-9_-]/g);
}

export function sanitizeIcnInput(value, mode, constants) {
  if (mode === "test-custom-suffix") {
    return keepCharacters(value, /[A-Za-z0-9]/g).slice(0, constants.suffixLength);
  }
  if (mode === "custom-full") {
    return keepCharacters(value, /[A-Za-z0-9]/g).slice(0, constants.totalLength);
  }
  return "";
}

export function getIcnConstants(info) {
  return {
    testPrefix: info?.constants?.icnTestPrefix || "TEST",
    suffixLength: Number(info?.constants?.icnSuffixLength || 13),
    totalLength: Number(info?.constants?.icnTotalLength || 17),
  };
}

export function getIcnPlaceholder(mode, constants) {
  if (mode === "test-custom-suffix") {
    return `Enter up to ${constants.suffixLength} letters or numbers after ${constants.testPrefix}`;
  }
  if (mode === "custom-full") return `Enter up to ${constants.totalLength} letters or numbers`;
  if (mode === "referral-match") return "Generated from each Referral Number";
  return `Using ${constants.testPrefix} + generated digits`;
}

export function getReferralPrefixLabel(mode, customReferralPrefix) {
  if (mode === "ifams") return "iFAMS";
  if (mode === "custom") return customReferralPrefix || "your custom prefix";
  if (mode === "mixed") return "VAiFAMS";
  return "VA";
}

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

export function dateText(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nowAsListDate(now = new Date()) {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function parseListDate(text) {
  const match = String(text || "").trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    return { year: "0000", month: "00", day: "00", hour: "00", minute: "00", second: "00" };
  }
  return { year: match[1], month: match[2], day: match[3], hour: match[4], minute: match[5], second: match[6] };
}

export function formatListDate(parts) {
  const values = {};
  for (const part of DATE_PARTS) {
    values[part.key] = normalizeDigits(parts[part.key], part.width).padStart(part.width, "0");
  }
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

/** Current-date values for the generator's referral date fields. */
export function currentReferralDates(referralPeriod, now = new Date()) {
  const period = String(referralPeriod || "").trim().match(/^(\d+)\s*(?:days?)?$/i);
  const expiration = new Date(now);
  expiration.setDate(expiration.getDate() + (period ? Number(period[1]) : 990));
  return {
    overrideReferralDate: dateText(now),
    overrideReferralDateTime: `${dateText(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    overrideReferralExpirationDate: dateText(expiration),
    overrideReferralLastUpdateDate: dateText(now),
  };
}

export function formatUploadProfileSummary(summary) {
  if (!summary || !summary.serverCount || !summary.userCount) return "";
  return `${summary.serverCount} ${plural(summary.serverCount, "server")}, ${summary.userCount} ${plural(summary.userCount, "user")}`;
}

export function formatJsonPreviewList(baseName, fileCount, isGenerate) {
  if (!baseName) {
    return isGenerate ? "Preview: generated JSON names will be used" : "Preview: original JSON names will be used";
  }
  if (fileCount <= 1) return `Preview: ${baseName}.json`;
  const visibleCount = Math.min(fileCount, 3);
  const fileNames = [];
  for (let index = 1; index <= visibleCount; index += 1) fileNames.push(`${baseName}_${index}.json`);
  if (fileCount > visibleCount) fileNames.push(`+${fileCount - visibleCount} more`);
  return `Preview: ${fileNames.join(", ")}`;
}

/** Maps a status label to the tone used by the status badge. */
export function statusTone(label, activityActive) {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("failed") || normalized.includes("warning")) return "failed";
  if (normalized.includes("complete") || normalized.includes("ready to save") || normalized.includes("uploaded")) {
    return "completed";
  }
  return activityActive ? "working" : "idle";
}

/** Returns the active workflow step (0-4) and whether the whole workflow is complete. */
export function workflowProgress(statusLabel = "Idle", phase = "") {
  const normalized = String(statusLabel).toLowerCase();
  const normalizedPhase = String(phase || "").toLowerCase();
  let activeStep = normalizedPhase === "upload" ? 4
    : normalizedPhase === "packaging" || normalizedPhase === "processing" ? 3
      : normalizedPhase === "preflight" || normalizedPhase === "validation" ? 2
        : normalizedPhase === "configuration" ? 1
          : normalized.includes("upload") || normalized.includes("uploaded") || normalized.includes("testing connection") ? 4
            : normalized.includes("process") || normalized.includes("generat") || normalized.includes("working") || normalized.includes("packag") || normalized.includes("archive") ? 3
              : normalized.includes("valid") || normalized.includes("duplicate") || normalized.includes("scanning") ? 2
                : normalized.includes("config") || normalized.includes("import") ? 1
                  : 0;
  if (normalized.includes("complete") || normalized.includes("ready to save")) activeStep = 4;
  return { activeStep, complete: normalized.includes("complete") };
}

export function progressDisplay(current = 0, total = 0) {
  const safeTotal = Math.max(Number(total) || 0, 0);
  if (safeTotal <= 0) {
    return { determinate: false, label: "Working — keep the app open...", value: "In progress", percent: 0 };
  }
  const safeCurrent = Math.min(Math.max(Number(current) || 0, 0), safeTotal);
  const percent = Math.min(100, Math.round((safeCurrent / safeTotal) * 100));
  return {
    determinate: true,
    label: `${safeCurrent.toLocaleString()} of ${safeTotal.toLocaleString()} finished`,
    value: `${percent}%`,
    percent,
    valueText: `${safeCurrent} of ${safeTotal}, ${percent}% complete`,
  };
}

/** Builds the label/value rows shown in the pre-run safety review. */
export function buildReviewItems(command, payload, sourceInspection, archivePreviewText) {
  const uploads = (payload.upload?.enabled ? payload.upload.targets : []) || [];
  const total = command === "generate"
    ? Number(payload.fileCount || 0) * Number(payload.referralsPerFile || 0)
    : Number(sourceInspection?.fileCount || 0);
  const stations = payload.identityOptions?.randomizeStationId
    ? "Random from all approved stations"
    : (payload.identityOptions?.selectedStationIds || []).join(", ") || "Mix approved station values";
  const referralPrefixMode = payload.identityOptions?.referralPrefixMode || "va";
  const referralPrefix = referralPrefixMode === "ifams"
    ? "iFAMS for every referral"
    : referralPrefixMode === "mixed"
      ? "Alternate VA and iFAMS"
      : referralPrefixMode === "custom"
        ? `${payload.identityOptions?.customReferralPrefix || "Custom"} for every referral`
        : "VA for every referral";
  const isLeie = command === "process-leie";
  const items = [
    ["Workflow", command === "generate" ? "Generate Referral Files" : isLeie ? "Process LEIE Data" : "Process Referral Files"],
    ["Source", payload.inputDir || (command === "generate" ? "Built-in referral templates" : "Not selected")],
    ["Output", payload.outputDir || "Not selected"],
    [command === "generate" ? "Total referrals" : "Source files", total.toLocaleString()],
    ["Output behavior", "Overwrite matching filenames after validation; preserve unrelated files"],
    ["Archive", isLeie ? payload.outputFileName || "Generated workbook name" : archivePreviewText || "Gzip and selected JSON outputs"],
    ["Referral prefix", isLeie ? "Not applicable" : referralPrefix],
    ["Stations", isLeie ? "Not applicable" : stations],
    ["Upload destinations", uploads.length ? uploads.map((item) => `${item.server_name}: ${item.remote_directory}`).join("; ") : "Local output only"],
  ];
  const situationalSeocCount = payload.identityOptions?.useAllSituationalSeocs
    ? "All Situational values"
    : (payload.identityOptions?.selectedSituationalSeocKeys || []).length;
  if (situationalSeocCount) {
    items.push([
      "Situational SEOC caution",
      `${situationalSeocCount} selected. Most referrals use regular SEOC only; confirm this Situational choice is required.`,
    ]);
  }
  const networkValues = payload.identityOptions?.selectedNetworks || [];
  items.push([
    "Network plan",
    networkValues.length === 1
      ? `${networkValues[0]} will be used for every referral.`
      : networkValues.length > 1
        ? `${networkValues.join(", ")} will be mixed across referrals.`
        : "Keep each referral's source Network automatically.",
  ]);
  return items;
}

export function needsProdConfirmation(payload) {
  return Boolean(
    payload.upload?.enabled &&
      payload.upload.targets?.some((target) => String(target.server_name).toUpperCase() === "PROD")
  );
}

/** Search indexes built once from the backend catalog information. */
export function buildCatalogs(info) {
  const stationById = new Map();
  let stationSelectableCount = 0;
  const stationIndex = (info?.stations || []).map((option) => {
    const stationId = String(option.station_id || "").trim().toUpperCase();
    if (stationId && !stationById.has(stationId)) stationById.set(stationId, option);
    if (stationId) stationSelectableCount += 1;
    return {
      option,
      searchText: [option.station_key, option.station_id, option.visn_id, option.station_name, option.parent_station_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });

  const seocIndexFor = (options) => {
    const byKey = new Map();
    const index = (options || []).map((option) => {
      byKey.set(option.selectorKey, option);
      return {
        option,
        searchText: [option.displayName, option.name, option.seocNumber, option.seocKey, option.seocId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      };
    });
    return { byKey, index };
  };

  const paymentByKey = new Map();
  const paymentIndex = (info?.paymentAuthorityCodes || []).map((code) => {
    const option = { selectorKey: code, name: code };
    paymentByKey.set(code, option);
    return { option, searchText: String(code).toLowerCase() };
  });

  return {
    stationById,
    stationIndex,
    stationSelectableCount,
    stationCount: (info?.stations || []).length,
    seoc: seocIndexFor(info?.seocOptions),
    situationalSeoc: seocIndexFor(info?.situationalSeocOptions),
    payment: { byKey: paymentByKey, index: paymentIndex },
  };
}

export function seocVisibleName(option = {}) {
  return String(option.name || option.seocId || option.displayName || "").trim();
}

function unique(values) {
  return [...new Set(values)];
}

/** Turns saved UI settings into a complete form state, dropping values that no longer exist. */
export function formFromSettings(settings = {}, catalogs, baseForm = DEFAULT_FORM) {
  const form = { ...baseForm };
  const text = (key, settingsKey = key) => {
    const value = settings[settingsKey];
    if (value !== undefined && value !== null) form[key] = String(value);
  };

  form.theme = settings.theme === "dark" ? "dark" : "light";
  form.mainTab = ["referral", "leie", "other"].includes(settings.mainTab) ? settings.mainTab : "referral";
  form.subTab = settings.subTab === "generate" && form.mainTab === "referral" ? "generate" : "edit";
  form.leieDuplicateKey = settings.leieDuplicateKey || "full-row";
  form.leieDuplicateHandling = settings.leieDuplicateHandling === "auto-remove" ? "auto-remove" : "manual";
  form.leieOutputFileName = String(settings.leieOutputFileName || "").trim();
  form.optionalFieldsVisible = Boolean(settings.optionalFieldsVisible);
  form.useCurrentReferralDates = settings.useCurrentReferralDates !== false;

  for (const key of [
    "inputDir", "outputDir", "replacementCode", "archiveBasename", "archiveCustomText", "masterFileName",
    "referralCode", "ssnValue", "icnCustomValue", "overrideReferralPeriod", "overrideDob",
    "overrideReferralCategory", "overrideReferralDate", "overrideReferralDateTime",
    "overrideReferralExpirationDate", "overrideReferralLastUpdateDate", "overrideReferralConsultId",
    "fileCount", "referralsPerFile", "leieValidationBatchId",
  ]) {
    text(key);
  }
  if (!form.archiveBasename) form.archiveBasename = "referrals";
  form.matchSuffixLength = ["3", "4", "5"].includes(String(settings.matchSuffixLength)) ? String(settings.matchSuffixLength) : "5";

  const icnMode = String(settings.icnMode || "test-dynamic").trim();
  form.icnMode = ["test-dynamic", "custom-full", "referral-match"].includes(icnMode) ? icnMode : "test-dynamic";
  form.archiveAppendNetwork = Boolean(settings.archiveAppendNetwork);
  form.archiveAppendReferralDateTime = Boolean(settings.archiveAppendReferralDateTime);
  form.useIfamsFilenamePrefix = Boolean(settings.useIfamsFilenamePrefix);
  form.archiveNamingMode = ARCHIVE_NAMING_MODES.includes(settings.archiveNamingMode)
    ? settings.archiveNamingMode
    : "referral-number";
  const knownCustomValues = ARCHIVE_CUSTOM_VALUES.map((entry) => entry.value);
  form.archiveCustomValues = Array.isArray(settings.archiveCustomValues)
    ? knownCustomValues.filter((value) => settings.archiveCustomValues.includes(value))
    : ["referralNumber", "customText"];
  const prefixMode = ["va", "ifams", "mixed", "custom"].includes(settings.referralPrefixMode)
    ? settings.referralPrefixMode
    : settings.useIfamsReferralPrefix ? "ifams" : "va";
  // Only VA and Custom are offered in the interface.
  form.referralPrefixMode = prefixMode === "custom" ? "custom" : "va";
  form.customReferralPrefix = String(settings.customReferralPrefix || "");
  form.clearOutput = Boolean(settings.clearOutput);
  form.useAllPaymentCodes = settings.useAllPaymentCodes !== false;
  form.selectedPaymentCodes = unique(
    (settings.selectedPaymentCodes || [settings.overridePaymentAuthorityCode]).filter((code) => catalogs.payment.byKey.has(code))
  );
  form.keepMasterJson = settings.keepMasterJson !== false;
  form.keepProcessedJson = settings.keepProcessedJson !== false;
  form.uploadEnabled = Boolean(settings.uploadEnabled);
  form.randomizeSsn = settings.randomizeSsn !== false;
  form.randomizeDob = settings.randomizeDob !== false;
  form.randomizeStationId = Boolean(settings.randomizeStationId);
  form.selectedStationIds = unique(
    (Array.isArray(settings.selectedStationIds) ? settings.selectedStationIds : [settings.overrideStationId])
      .map((value) => String(value || "").trim().toUpperCase())
      .filter((value) => value && catalogs.stationById.has(value))
  );
  form.selectedSeocKeys = unique(
    (Array.isArray(settings.selectedSeocKeys) ? settings.selectedSeocKeys : [])
      .map((value) => String(value || ""))
      .filter((value) => catalogs.seoc.byKey.has(value))
  );
  form.selectedSituationalSeocKeys = unique(
    (Array.isArray(settings.selectedSituationalSeocKeys) ? settings.selectedSituationalSeocKeys : [])
      .map((value) => String(value || ""))
      .filter((value) => catalogs.situationalSeoc.byKey.has(value))
  );
  form.selectedNetworks = unique(
    (Array.isArray(settings.selectedNetworks)
      ? settings.selectedNetworks
      : settings.overrideNetwork ? [settings.overrideNetwork] : [])
      .map((value) => String(value || "").trim().toUpperCase())
      .filter((value) => NETWORK_VALUES.includes(value))
  );
  form.useAllSeocs = Boolean(settings.useAllSeocs);
  form.useAllSituationalSeocs = Boolean(settings.useAllSituationalSeocs);
  form.useAllNetworks = Boolean(settings.useAllNetworks);
  if (form.randomizeStationId) form.selectedStationIds = [];
  if (form.useAllSeocs) form.selectedSeocKeys = [];
  if (form.useAllSituationalSeocs) form.selectedSituationalSeocKeys = [];
  if (form.useAllNetworks) form.selectedNetworks = [];
  if (form.useAllPaymentCodes) form.selectedPaymentCodes = [];
  form.icnCustomValue = form.icnMode === "custom-full" ? form.icnCustomValue : "";
  return form;
}

/** Database servers used to validate a LEIE load, in the required load order. */
export const LEIE_DATABASE_ENVIRONMENTS = [
  { environment: "SQA", server: "VAC10SQLCCN816.va.gov", database: "ccrsdb" },
  { environment: "DEV", server: "VAC10SQLCCN802.va.gov", database: "ccrsdb" },
  { environment: "PPD", server: "VAC10SQLCCN404.va.gov", database: "ccrsdb" },
];

export const UPLOAD_RESULT_LABELS = {
  pending: "Waiting",
  uploading: "Uploading",
  completed: "Passed",
  failed: "Failed",
  skipped: "Skipped",
};

export function formatUploadDuration(durationMs) {
  const seconds = Number(durationMs) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/** Display rows and a one-line summary for the per-server upload results of a run. */
export function summarizeUploadResults(results = []) {
  const rows = (Array.isArray(results) ? results : []).map((result, index) => {
    const status = UPLOAD_RESULT_LABELS[result.status] ? result.status : "pending";
    const duration = formatUploadDuration(result.durationMs);
    const location = result.remotePath || result.remoteDirectory || "";
    return {
      key: `${result.serverName || "server"}-${index}`,
      serverName: result.serverName || "Server",
      status,
      label: UPLOAD_RESULT_LABELS[status],
      message: [result.message, location && status !== "skipped" ? `(${location})` : "", duration ? `· ${duration}` : ""]
        .filter(Boolean)
        .join(" "),
    };
  });
  const counts = rows.reduce((totals, row) => {
    totals[row.status] = (totals[row.status] || 0) + 1;
    return totals;
  }, {});
  const summary = [
    counts.completed ? `${counts.completed} passed` : "",
    counts.failed ? `${counts.failed} failed` : "",
    counts.skipped ? `${counts.skipped} skipped` : "",
    counts.uploading ? "1 in progress" : "",
    counts.pending ? `${counts.pending} waiting` : "",
  ].filter(Boolean).join(" · ");
  return { rows, summary };
}

/** Removes Electron's IPC wrapper so people see only the actual reason. */
export function cleanErrorMessage(message) {
  return String(message || "")
    .replace(/^Error invoking remote method '[^']*':\s*/i, "")
    .replace(/^(?:Error:\s*)+/i, "")
    .trim();
}
