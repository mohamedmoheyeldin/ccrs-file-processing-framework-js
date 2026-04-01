const fs = require("fs");
const {
  describeIcnPreview,
  ICN_MODES,
  ICN_TEST_PREFIX,
  ICN_TEST_SUFFIX_LENGTH,
  ICN_TOTAL_LENGTH,
  LIST_DATE_FORMAT,
  PAYMENT_AUTHORITY_CODE_LENGTH,
  REFERRAL_NUMBER_DIGIT_COUNT,
  REFERRAL_NUMBER_PREFIX,
  STATION_ID_MAX_LENGTH,
  extractJsonChangeDefaults,
  extractListDate,
  generateOptionalFieldOverrides,
  prepareIcnSettings,
  validateIsoDate,
  validateIcnSettings,
  validateIsoDateTime,
  validatePaymentAuthorityCode,
  validateReferralNumberStart,
  validateSsn,
  validateStationId,
} = require("./contentEditor");
const { bundlePath, dataPath, ensureRuntimeFiles, getRuntimeRoot } = require("./appPaths");
const { getFiles } = require("./fileHandler");
const { setupLogger } = require("./logger");
const { processFiles } = require("./processor");
const {
  buildGeneratedReferralSources,
  getGeneratorDefaults,
} = require("./referralGenerator");
const { cleanupRuntimeArtifacts, cleanupStaleRuntimeArtifacts, removePath } = require("./runtimeCleanup");
const { loadStationOptions } = require("./stationCatalog");
const { getUiSettingsPath, loadUiSettings, saveUiSettings } = require("./userSettings");
const {
  getServerDisplayForTarget,
  getUploadProfileSourcePath,
  getUploadTargetNames,
  getUserNamesForServer,
  importUploadSourceToConfig,
  loadUploadProfiles,
  resolveUploadTargets,
  summarizeUploadProfiles,
  testUploadConnection,
} = require("./uploader");
const { sanitizeFilenameBase } = require("./renamer");
const { buildArchiveBasename, DEFAULT_ARCHIVE_BASENAME, sanitizeArchiveBasename } = require("./zipper");

ensureRuntimeFiles();
setupLogger();

function normalizeReleaseNotes(rawValue) {
  return (Array.isArray(rawValue) ? rawValue : [])
    .map((note) => String(note || "").trim())
    .filter(Boolean);
}

function loadAppVersionInfo() {
  const runtimePath = dataPath("config", "app_version.json");
  const bundledPath = bundlePath("config", "app_version.json");
  for (const targetPath of [runtimePath, bundledPath]) {
    try {
      if (fs.existsSync(targetPath)) {
        const parsed = JSON.parse(fs.readFileSync(targetPath, "utf8"));
        const version = String(parsed.version || "").trim();
        const label = String(parsed.label || "").trim();
        const channel = String(parsed.channel || "").trim();
        const displayVersion = version.endsWith(".0") ? version.slice(0, -2) : version;
        const displayLabel = label || [channel, displayVersion].filter(Boolean).join(" ").trim();
        return {
          version,
          label,
          channel,
          displayLabel,
          releaseKey: [version, label || channel || displayVersion].filter(Boolean).join("|"),
          releaseNotes: normalizeReleaseNotes(parsed.releaseNotes || parsed.release_notes),
        };
      }
    } catch (_error) {
      // Ignore invalid version config and fall back to empty.
    }
  }
  return {
    version: "",
    label: "",
    channel: "",
    displayLabel: "",
    releaseKey: "",
    releaseNotes: [],
  };
}

function buildUploadTargets(profiles) {
  return getUploadTargetNames(profiles).map((targetName) => ({
    name: targetName,
    serverDisplay: getServerDisplayForTarget(profiles, targetName),
    users: getUserNamesForServer(profiles, targetName),
    defaultRemoteDirectory: "/CCRA_Uploads",
  }));
}

function getInfo() {
  const uiSettings = loadUiSettings();
  const appVersion = loadAppVersionInfo();
  const profiles = loadUploadProfiles();
  const [profileSourcePath, profileSourceKind] = getUploadProfileSourcePath();
  const userGuidePdfPath = dataPath("docs", "USER_GUIDE.pdf");
  const userGuidePath = fs.existsSync(userGuidePdfPath)
    ? userGuidePdfPath
    : dataPath("docs", "USER_GUIDE.md");
  return {
    runtimeRoot: getRuntimeRoot(),
    appVersionLabel: appVersion.displayLabel,
    appVersion,
    releaseAnnouncement: {
      releaseKey: appVersion.releaseKey,
      version: appVersion.version,
      label: appVersion.label || appVersion.displayLabel,
      notes: appVersion.releaseNotes,
      shouldShow: Boolean(
        appVersion.releaseKey &&
          appVersion.releaseNotes.length &&
          uiSettings.acknowledgedReleaseKey !== appVersion.releaseKey
      ),
    },
    profileSource: {
      path: profileSourcePath,
      kind: profileSourceKind,
    },
    uploadProfileSummary: summarizeUploadProfiles(profiles),
    uploadTargets: buildUploadTargets(profiles),
    generatorDefaults: getGeneratorDefaults(),
    stationOptions: loadStationOptions(),
    uiSettings,
    constants: {
      icnModes: ICN_MODES,
      icnTestPrefix: ICN_TEST_PREFIX,
      icnSuffixLength: ICN_TEST_SUFFIX_LENGTH,
      icnTotalLength: ICN_TOTAL_LENGTH,
      listDateFormat: LIST_DATE_FORMAT,
      referralNumberPrefix: REFERRAL_NUMBER_PREFIX,
      referralNumberDigits: REFERRAL_NUMBER_DIGIT_COUNT,
      stationIdMaxLength: STATION_ID_MAX_LENGTH,
      paymentAuthorityCodeLength: PAYMENT_AUTHORITY_CODE_LENGTH,
      defaultArchiveBasename: DEFAULT_ARCHIVE_BASENAME,
    },
    docs: {
      userGuidePath,
    },
    userConfig: {
      uiSettingsPath: getUiSettingsPath(),
    },
  };
}

function inspectSource(payload) {
  const inputDir = (payload.inputDir || "").trim();
  if (!inputDir) {
    return {
      inputDir: "",
      fileCount: 0,
      firstListDate: "",
      defaults: {},
      sourceFiles: [],
    };
  }

  const sourceFiles = getFiles(inputDir);
  if (sourceFiles.length === 0) {
    return {
      inputDir,
      fileCount: 0,
      firstListDate: "",
      defaults: {},
      sourceFiles: [],
    };
  }

  const firstFile = sourceFiles[0];
  let defaults = {};
  let firstListDate = "";

  try {
    defaults = extractJsonChangeDefaults(firstFile);
  } catch (_error) {
    defaults = {};
  }

  try {
    firstListDate = extractListDate(firstFile) || "";
  } catch (_error) {
    firstListDate = "";
  }

  return {
    inputDir,
    fileCount: sourceFiles.length,
    firstListDate,
    defaults,
    sourceFiles: sourceFiles.map((filePath) => ({
      path: filePath,
      name: require("path").basename(filePath),
    })),
  };
}

function buildPreview(payload) {
  const replacementCode = sanitizeFilenameBase(payload.replacementCode || "");
  const referralValue = (payload.referralReplacementCode || "").trim();
  const icnSettings = payload.icnSettings || {};
  const optionalOverrides = payload.optionalOverrides || {};
  const fieldErrors = collectFieldErrors(payload);
  const archiveBasename = fieldErrors.archiveBasename
    ? sanitizeArchiveBasename(payload.archiveBasename || DEFAULT_ARCHIVE_BASENAME)
    : buildArchiveBasename(payload);

  let normalizedReferral = "";
  if (referralValue && !fieldErrors.referralReplacementCode) {
    normalizedReferral = validateReferralNumberStart(referralValue);
  }

  const normalizedOptionalOverrides = {};
  if (Object.prototype.hasOwnProperty.call(optionalOverrides, "StationID") && !fieldErrors.StationID) {
    normalizedOptionalOverrides.StationID = validateStationId(optionalOverrides.StationID || "");
  }
  if (
    Object.prototype.hasOwnProperty.call(optionalOverrides, "PaymentAuthorityCode") &&
    !fieldErrors.PaymentAuthorityCode
  ) {
    normalizedOptionalOverrides.PaymentAuthorityCode = validatePaymentAuthorityCode(
      optionalOverrides.PaymentAuthorityCode || ""
    );
  }

  let icnPreview = describeIcnPreview({ mode: ICN_MODES.TEST_DYNAMIC });
  if (!fieldErrors.icnValue) {
    icnPreview = describeIcnPreview(icnSettings);
  }

  return {
    replacementCode,
    archiveBasename,
    icnPreview,
    referralNumber: normalizedReferral,
    optionalOverrides: normalizedOptionalOverrides,
    fieldErrors,
  };
}

function collectFieldErrors(payload) {
  const fieldErrors = {};
  const icnSettings = payload.icnSettings || {};
  const optionalOverrides = payload.optionalOverrides || {};

  if ((payload.ssnValue || "").trim()) {
    try {
      validateSsn(payload.ssnValue);
    } catch (error) {
      fieldErrors.ssnValue = error.message;
    }
  }

  if ((payload.referralReplacementCode || "").trim()) {
    try {
      validateReferralNumberStart(payload.referralReplacementCode);
    } catch (error) {
      fieldErrors.referralReplacementCode = error.message;
    }
  }

  if (Object.prototype.hasOwnProperty.call(optionalOverrides, "StationID")) {
    try {
      validateStationId(optionalOverrides.StationID || "");
    } catch (error) {
      fieldErrors.StationID = error.message;
    }
  }

  if (Object.prototype.hasOwnProperty.call(optionalOverrides, "PaymentAuthorityCode")) {
    try {
      validatePaymentAuthorityCode(optionalOverrides.PaymentAuthorityCode || "");
    } catch (error) {
      fieldErrors.PaymentAuthorityCode = error.message;
    }
  }

  const dateFieldValidators = [
    ["DOB", "DOB", validateIsoDate],
    ["ReferralDate", "Referral Date", validateIsoDate],
    ["ReferralDateTime", "Referral DateTime", validateIsoDateTime],
    ["ReferralExpirationDate", "Referral Expiration Date", validateIsoDate],
    ["ReferralLastUpdateDate", "Referral Last Update Date", validateIsoDate],
  ];
  for (const [fieldName, fieldLabel, validator] of dateFieldValidators) {
    if (!Object.prototype.hasOwnProperty.call(optionalOverrides, fieldName)) {
      continue;
    }
    try {
      validator(optionalOverrides[fieldName] || "", fieldLabel);
    } catch (error) {
      fieldErrors[fieldName] = error.message;
    }
  }

  if (payload.fileCount !== undefined && Number(payload.fileCount || 0) <= 0) {
    fieldErrors.fileCount = "Number of JSON files to generate must be greater than zero.";
  }
  if (payload.referralsPerFile !== undefined && Number(payload.referralsPerFile || 0) <= 0) {
    fieldErrors.referralsPerFile = "Number of referrals per file must be greater than zero.";
  }

  try {
    validateIcnSettings(icnSettings);
  } catch (error) {
    fieldErrors.icnValue = error.message;
  }

  try {
    buildArchiveBasename(payload);
  } catch (error) {
    fieldErrors.archiveBasename = error.message;
  }

  const uploadPayload = payload.upload || {};
  if (uploadPayload.enabled) {
    for (const target of uploadPayload.targets || []) {
      const serverName = (target.server_name || "").trim() || "target";
      if (!(target.user_name || "").trim()) {
        fieldErrors[`upload:${serverName}:user_name`] = `Please choose a user for ${serverName}.`;
      }
      if (!(target.remote_directory || "").trim()) {
        fieldErrors[`upload:${serverName}:remote_directory`] = `Please enter the remote upload location for ${serverName}.`;
      }
    }
  }

  return fieldErrors;
}

function buildUploadOptions(payload) {
  const uploadPayload = payload.upload || {};
  if (!uploadPayload.enabled) {
    return null;
  }

  return {
    enabled: true,
    targets: resolveUploadTargets(loadUploadProfiles(), uploadPayload.targets || []),
  };
}

function buildCommonArgs(payload, progressCallback) {
  const ssnValue = (payload.ssnValue || "999-99-0001").trim();
  validateSsn(ssnValue);

  let referralCode = (payload.referralReplacementCode || "").trim();
  if (referralCode) {
    referralCode = validateReferralNumberStart(referralCode);
  }

  return {
    outputDir: (payload.outputDir || "").trim(),
    replacementCode: (payload.replacementCode || "").trim(),
    clearOutput: Boolean(payload.clearOutput),
    referralReplacementCode: referralCode,
    icnSettings: prepareIcnSettings(payload.icnSettings || {}),
    listDateOverride: (payload.listDateOverride || "").trim() || null,
    ssnValue,
    optionalOverrides: generateOptionalFieldOverrides(payload.optionalOverrides || {}),
    keepProcessedJson: Boolean(payload.keepProcessedJson),
    progressCallback,
    uploadOptions: buildUploadOptions(payload),
    archiveBasename: buildArchiveBasename(payload),
  };
}

async function runProcess(payload, emitProgress) {
  const inputDir = (payload.inputDir || "").trim();
  if (!inputDir) {
    throw new Error("Please select a source folder.");
  }

  const args = buildCommonArgs(payload, emitProgress);
  if (!args.outputDir) {
    throw new Error("Please select an output folder.");
  }

  const message = await processFiles(
    inputDir,
    args.outputDir,
    args.replacementCode,
    args.clearOutput,
    args.referralReplacementCode,
    args.icnSettings,
    args.listDateOverride,
    args.ssnValue,
    args.optionalOverrides,
    args.keepProcessedJson,
    args.progressCallback,
    args.uploadOptions,
    args.archiveBasename
  );
  return { message };
}

async function runGenerate(payload, emitProgress) {
  const fileCount = Number(payload.fileCount || 0);
  const referralsPerFile = Number(payload.referralsPerFile || 0);
  if (fileCount <= 0) {
    throw new Error("Files to generate must be greater than zero.");
  }
  if (referralsPerFile <= 0) {
    throw new Error("Referrals per file must be greater than zero.");
  }

  const args = buildCommonArgs(payload, emitProgress);
  if (!args.outputDir) {
    throw new Error("Please select an output folder.");
  }

  let generatedInputDir = "";
  try {
    generatedInputDir = buildGeneratedReferralSources(fileCount, referralsPerFile);
    const message = await processFiles(
      generatedInputDir,
      args.outputDir,
      args.replacementCode,
      args.clearOutput,
      args.referralReplacementCode,
      args.icnSettings,
      args.listDateOverride,
      args.ssnValue,
      args.optionalOverrides,
      args.keepProcessedJson,
      args.progressCallback,
      args.uploadOptions,
      args.archiveBasename
    );
    return { message };
  } finally {
    removePath(generatedInputDir);
  }
}

async function runTestUploadTarget(payload) {
  const target = {
    server_name: (payload.server_name || "").trim(),
    user_name: (payload.user_name || "").trim(),
    remote_directory: (payload.remote_directory || "").trim(),
  };
  const [resolvedTarget] = resolveUploadTargets(loadUploadProfiles(), [target]);
  const message = await testUploadConnection(
    resolvedTarget.connection_details,
    resolvedTarget.remote_directory
  );

  return {
    message: `${resolvedTarget.server_name}: ${message}`,
  };
}

async function handleCommand(command, payload, emitProgress) {
  if (command === "info") {
    return getInfo();
  }
  if (command === "import-upload-source") {
    return {
      importResult: importUploadSourceToConfig((payload.sourcePath || "").trim()),
      info: getInfo(),
    };
  }
  if (command === "save-ui-settings") {
    return {
      uiSettings: saveUiSettings(payload),
    };
  }
  if (command === "acknowledge-release-announcement") {
    return {
      uiSettings: saveUiSettings({
        ...loadUiSettings(),
        acknowledgedReleaseKey: String(payload.releaseKey || "").trim(),
      }),
    };
  }
  if (command === "inspect-source") {
    return inspectSource(payload);
  }
  if (command === "preview") {
    return buildPreview(payload);
  }
  if (command === "process") {
    return runProcess(payload, emitProgress);
  }
  if (command === "generate") {
    return runGenerate(payload, emitProgress);
  }
  if (command === "test-upload-target") {
    return runTestUploadTarget(payload);
  }
  throw new Error(`Unsupported command: ${command}`);
}

module.exports = {
  cleanupRuntimeArtifacts,
  cleanupStaleRuntimeArtifacts,
  handleCommand,
};
