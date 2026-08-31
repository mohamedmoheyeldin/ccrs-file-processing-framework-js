const fs = require("fs");
const { DEFAULT_ARCHIVE_BASENAME } = require("./zipper");
const { bundlePath, dataPath, userDataPath } = require("./appPaths");
const { writeFileAtomic } = require("./atomicFile");

const DEFAULT_UI_SETTINGS = {
  schemaVersion: 2,
  theme: "light",
  mainTab: "referral",
  subTab: "edit",
  optionalFieldsVisible: false,
  acknowledgedReleaseKey: "",
  inputDir: "",
  outputDir: "",
  replacementCode: "",
  archiveBasename: DEFAULT_ARCHIVE_BASENAME,
  archiveAppendNetwork: false,
  archiveAppendReferralDateTime: false,
  useIfamsFilenamePrefix: false,
  archiveNamingMode: "referral-number",
  archiveCustomPattern: "{customText}_{referralNumber}_Final",
  archiveCustomText: "CCRS",
  useIfamsReferralPrefix: false,
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
  overrideStationId: "",
  selectedStationIds: [],
  selectedSeocKeys: [],
  useAllSeocs: false,
  selectedSituationalSeocKeys: [],
  useAllSituationalSeocs: false,
  overridePaymentAuthorityCode: "",
  overrideReferralPeriod: "",
  overrideNetwork: "",
  overrideDob: "",
  overrideSeocKey: "",
  overrideSeocId: "",
  overrideReferralCategory: "",
  overrideReferralDate: "",
  overrideReferralDateTime: "",
  overrideReferralExpirationDate: "",
  overrideReferralLastUpdateDate: "",
  overrideReferralConsultId: "",
  fileCount: "1",
  referralsPerFile: "1",
  clearOutput: false,
  keepProcessedJson: true,
  uploadEnabled: false,
  uploadTargets: {},
  leieDuplicateKey: "full-row",
  leieDuplicateHandling: "manual",
  leieOutputFileName: "",
  leieValidationBatchId: "",
};

function toBoolean(value, fallbackValue = false) {
  if (value === undefined || value === null || value === "") {
    return fallbackValue;
  }
  return Boolean(value);
}

function normalizeUploadTargets(rawValue) {
  const normalized = {};

  for (const [targetName, targetSettings] of Object.entries(rawValue || {})) {
    if (!targetName || !targetSettings || typeof targetSettings !== "object") {
      continue;
    }

    normalized[targetName] = {
      enabled: toBoolean(targetSettings.enabled, false),
      userName: String(targetSettings.userName || targetSettings.user_name || "").trim(),
      remoteDirectory: String(targetSettings.remoteDirectory || targetSettings.remote_directory || "").trim(),
    };
  }

  return normalized;
}

function normalizeUiSettings(rawValue = {}) {
  const normalized = {
    ...DEFAULT_UI_SETTINGS,
    schemaVersion: DEFAULT_UI_SETTINGS.schemaVersion,
    theme:
      String(rawValue.theme || "").trim().toLowerCase() === "dark" ||
      String(rawValue.theme_mode || "").trim().toLowerCase() === "dark"
        ? "dark"
        : "light",
    mainTab: String(rawValue.mainTab || DEFAULT_UI_SETTINGS.mainTab).trim() || DEFAULT_UI_SETTINGS.mainTab,
    subTab: String(rawValue.subTab || DEFAULT_UI_SETTINGS.subTab).trim() || DEFAULT_UI_SETTINGS.subTab,
    optionalFieldsVisible: toBoolean(rawValue.optionalFieldsVisible, DEFAULT_UI_SETTINGS.optionalFieldsVisible),
    acknowledgedReleaseKey: String(
      rawValue.acknowledgedReleaseKey || rawValue.acknowledged_release_key || ""
    ).trim(),
    inputDir: String(rawValue.inputDir || "").trim(),
    outputDir: String(rawValue.outputDir || "").trim(),
    replacementCode: String(rawValue.replacementCode || "").trim(),
    archiveBasename: String(rawValue.archiveBasename || DEFAULT_UI_SETTINGS.archiveBasename).trim() || DEFAULT_UI_SETTINGS.archiveBasename,
    archiveAppendNetwork: toBoolean(rawValue.archiveAppendNetwork, DEFAULT_UI_SETTINGS.archiveAppendNetwork),
    archiveAppendReferralDateTime: toBoolean(
      rawValue.archiveAppendReferralDateTime,
      DEFAULT_UI_SETTINGS.archiveAppendReferralDateTime
    ),
    useIfamsFilenamePrefix: toBoolean(rawValue.useIfamsFilenamePrefix, DEFAULT_UI_SETTINGS.useIfamsFilenamePrefix),
    archiveNamingMode: ["referral-number", "network", "referral-date-time", "prefix", "custom"].includes(
      String(rawValue.archiveNamingMode || "").trim().toLowerCase()
    )
      ? String(rawValue.archiveNamingMode).trim().toLowerCase()
      : DEFAULT_UI_SETTINGS.archiveNamingMode,
    archiveCustomPattern: String(rawValue.archiveCustomPattern || DEFAULT_UI_SETTINGS.archiveCustomPattern).trim().slice(0, 160),
    archiveCustomText: String(rawValue.archiveCustomText || DEFAULT_UI_SETTINGS.archiveCustomText).trim().slice(0, 48),
    useIfamsReferralPrefix: toBoolean(rawValue.useIfamsReferralPrefix, DEFAULT_UI_SETTINGS.useIfamsReferralPrefix),
    referralPrefixMode: ["va", "ifams", "mixed", "custom"].includes(String(rawValue.referralPrefixMode || "").trim().toLowerCase())
      ? String(rawValue.referralPrefixMode).trim().toLowerCase()
      : toBoolean(rawValue.useIfamsReferralPrefix, DEFAULT_UI_SETTINGS.useIfamsReferralPrefix)
        ? "ifams"
        : DEFAULT_UI_SETTINGS.referralPrefixMode,
    customReferralPrefix: ((String(rawValue.customReferralPrefix || "").match(/[A-Za-z0-9_]/g) || []).join(""))
      .slice(0, 24),
    referralCode: String(rawValue.referralCode || "").trim(),
    ssnValue: String(rawValue.ssnValue || DEFAULT_UI_SETTINGS.ssnValue).trim() || DEFAULT_UI_SETTINGS.ssnValue,
    randomizeSsn: toBoolean(rawValue.randomizeSsn, DEFAULT_UI_SETTINGS.randomizeSsn),
    randomizeDob: toBoolean(rawValue.randomizeDob, DEFAULT_UI_SETTINGS.randomizeDob),
    randomizeStationId: toBoolean(rawValue.randomizeStationId, DEFAULT_UI_SETTINGS.randomizeStationId),
    matchSuffixLength: ["3", "4", "5"].includes(String(rawValue.matchSuffixLength || ""))
      ? String(rawValue.matchSuffixLength)
      : DEFAULT_UI_SETTINGS.matchSuffixLength,
    icnMode: String(rawValue.icnMode || DEFAULT_UI_SETTINGS.icnMode).trim() || DEFAULT_UI_SETTINGS.icnMode,
    icnCustomValue: String(rawValue.icnCustomValue || "").trim(),
    overrideStationId: String(rawValue.overrideStationId || "").trim(),
    selectedStationIds: [...new Set(
      (Array.isArray(rawValue.selectedStationIds) ? rawValue.selectedStationIds : [])
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean)
    )],
    selectedSeocKeys: [...new Set(
      (Array.isArray(rawValue.selectedSeocKeys)
        ? rawValue.selectedSeocKeys
        : rawValue.overrideSeocKey && rawValue.overrideSeocId
          ? [`${encodeURIComponent(String(rawValue.overrideSeocKey).trim())}::${encodeURIComponent(String(rawValue.overrideSeocId).trim())}`]
          : [])
        .map((value) => String(value || ""))
        .filter(Boolean)
    )],
    useAllSeocs: toBoolean(rawValue.useAllSeocs, DEFAULT_UI_SETTINGS.useAllSeocs),
    selectedSituationalSeocKeys: [...new Set(
      (Array.isArray(rawValue.selectedSituationalSeocKeys) ? rawValue.selectedSituationalSeocKeys : [])
        .map((value) => String(value || ""))
        .filter(Boolean)
    )],
    useAllSituationalSeocs: toBoolean(
      rawValue.useAllSituationalSeocs,
      DEFAULT_UI_SETTINGS.useAllSituationalSeocs
    ),
    overridePaymentAuthorityCode: String(rawValue.overridePaymentAuthorityCode || "").trim(),
    overrideReferralPeriod: String(rawValue.overrideReferralPeriod || "").trim(),
    overrideNetwork: String(rawValue.overrideNetwork || "").trim(),
    overrideDob: String(rawValue.overrideDob || "").trim(),
    overrideSeocKey: String(rawValue.overrideSeocKey || "").trim(),
    overrideSeocId: String(rawValue.overrideSeocId || "").trim(),
    overrideReferralCategory: String(rawValue.overrideReferralCategory || "").trim(),
    overrideReferralDate: String(rawValue.overrideReferralDate || "").trim(),
    overrideReferralDateTime: String(rawValue.overrideReferralDateTime || "").trim(),
    overrideReferralExpirationDate: String(rawValue.overrideReferralExpirationDate || "").trim(),
    overrideReferralLastUpdateDate: String(rawValue.overrideReferralLastUpdateDate || "").trim(),
    overrideReferralConsultId: String(rawValue.overrideReferralConsultId || "").trim(),
    fileCount: String(rawValue.fileCount || DEFAULT_UI_SETTINGS.fileCount).trim() || DEFAULT_UI_SETTINGS.fileCount,
    referralsPerFile:
      String(rawValue.referralsPerFile || DEFAULT_UI_SETTINGS.referralsPerFile).trim() ||
      DEFAULT_UI_SETTINGS.referralsPerFile,
    clearOutput: toBoolean(rawValue.clearOutput, DEFAULT_UI_SETTINGS.clearOutput),
    keepProcessedJson: toBoolean(rawValue.keepProcessedJson, DEFAULT_UI_SETTINGS.keepProcessedJson),
    uploadEnabled: toBoolean(rawValue.uploadEnabled, DEFAULT_UI_SETTINGS.uploadEnabled),
    uploadTargets: normalizeUploadTargets(rawValue.uploadTargets),
    leieDuplicateKey:
      String(rawValue.leieDuplicateKey || DEFAULT_UI_SETTINGS.leieDuplicateKey).trim().toLowerCase() ||
      DEFAULT_UI_SETTINGS.leieDuplicateKey,
    leieDuplicateHandling:
      String(rawValue.leieDuplicateHandling || DEFAULT_UI_SETTINGS.leieDuplicateHandling).trim().toLowerCase() ||
      DEFAULT_UI_SETTINGS.leieDuplicateHandling,
    leieOutputFileName: String(rawValue.leieOutputFileName || "").trim(),
    leieValidationBatchId: String(rawValue.leieValidationBatchId || "").trim(),
  };

  if (!["referral", "leie", "other"].includes(normalized.mainTab)) {
    normalized.mainTab = DEFAULT_UI_SETTINGS.mainTab;
  }
  if (normalized.subTab !== "edit" && normalized.subTab !== "generate") {
    normalized.subTab = DEFAULT_UI_SETTINGS.subTab;
  }
  if (normalized.mainTab !== "referral") {
    normalized.subTab = "edit";
  }

  return normalized;
}

function getUiSettingsPath() {
  return userDataPath("config", "ui_settings.json");
}

function getLegacyUiSettingsPaths() {
  return [
    userDataPath("config", "ui_settings.json"),
    dataPath("config", "ui_settings.json"),
    bundlePath("config", "ui_settings.json"),
  ];
}

function loadUiSettings() {
  for (const filePath of getLegacyUiSettingsPaths()) {
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return normalizeUiSettings(parsed);
      }
    } catch (_error) {
      // Ignore invalid settings files and continue to the next candidate.
    }
  }

  return { ...DEFAULT_UI_SETTINGS };
}

function saveUiSettings(rawValue = {}) {
  const normalized = normalizeUiSettings(rawValue);
  const payload = {
    ...normalized,
    theme_mode: normalized.theme === "dark" ? "Dark" : "Light",
  };

  writeFileAtomic(getUiSettingsPath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return normalized;
}

module.exports = {
  DEFAULT_UI_SETTINGS,
  getUiSettingsPath,
  loadUiSettings,
  normalizeUiSettings,
  saveUiSettings,
};
