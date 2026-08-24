const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
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
  getSeocOptions,
} = require("./referralGenerator");
const { cleanupRuntimeArtifacts, cleanupStaleRuntimeArtifacts, removePath } = require("./runtimeCleanup");
const { loadStationOptions, loadStations } = require("./stationCatalog");
const { getUiSettingsPath, loadUiSettings, saveUiSettings } = require("./userSettings");
const { inspectLeieSource, processLeieFiles } = require("./leieProcessor");
const { loadReleaseTracker, saveReleaseTracker } = require("./releaseTracker");
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
const { assertSourceFilesWithinLimits, getProcessingLimits } = require("./limits");
const { writeFileAtomic } = require("./atomicFile");

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
        const announcementId = String(
          parsed.announcementId || parsed.releaseAnnouncementId || parsed.release_announcement_id || ""
        ).trim();
        const displayVersion = version.endsWith(".0") ? version.slice(0, -2) : version;
        const displayLabel = label || [channel, displayVersion].filter(Boolean).join(" ").trim();
        const releaseKey = announcementId || [version, label || channel || displayVersion].filter(Boolean).join("|");
        return {
          version,
          label,
          channel,
          announcementId,
          displayLabel,
          releaseKey,
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
    announcementId: "",
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

function inspectLeieSourceAsync(payload) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, "leieWorker.js");
    let settled = false;
    const worker = new Worker(workerPath, {
      workerData: {
        task: "inspect",
        payload,
      },
    });

    worker.on("message", (message) => {
      if (settled) {
        return;
      }
      settled = true;
      if (message?.ok) {
        resolve(message.result);
      } else {
        reject(new Error(message?.error || "LEIE scan failed."));
      }
    });

    worker.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });

    worker.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (code === 0) {
        reject(new Error("LEIE scan worker exited before returning a result."));
      } else {
        reject(new Error(`LEIE scan worker exited with code ${code}.`));
      }
    });
  });
}

function getInfo() {
  const uiSettings = loadUiSettings();
  const releaseTracker = loadReleaseTracker();
  const acknowledgedReleaseKey = String(
    releaseTracker.acknowledgedReleaseKey || uiSettings.acknowledgedReleaseKey || ""
  ).trim();

  const appVersion = loadAppVersionInfo();
  const profiles = loadUploadProfiles();
  const [profileSourcePath, profileSourceKind] = getUploadProfileSourcePath();
  const userGuidePdfPath = dataPath("docs", "USER_GUIDE.pdf");
  const userGuidePath = fs.existsSync(userGuidePdfPath)
    ? userGuidePdfPath
    : dataPath("docs", "USER_GUIDE.md");
  const leieValidationGuidePathCandidates = [
    dataPath("docs", "LEIE_UPLOAD_VALIDATION_GUIDE.pdf"),
    dataPath("docs", "LEIE_UPLOAD_VALIDATION_GUIDE.md"),
    dataPath("docs", "LEIE_Data_Upload_Validation_Guide.md"),
  ];
  const leieValidationGuidePath = leieValidationGuidePathCandidates.find((targetPath) => fs.existsSync(targetPath)) || "";
  return {
    runtimeRoot: getRuntimeRoot(),
    appVersionLabel: appVersion.displayLabel,
    appVersion,
    releaseAnnouncement: {
      releaseKey: appVersion.releaseKey,
      acknowledgedReleaseKey,
      version: appVersion.version,
      label: appVersion.label || appVersion.displayLabel,
      notes: appVersion.releaseNotes,
      shouldShow: Boolean(
        appVersion.releaseKey &&
          acknowledgedReleaseKey !== appVersion.releaseKey
      ),
    },
    profileSource: {
      path: profileSourcePath,
      kind: profileSourceKind,
    },
    uploadProfileSummary: summarizeUploadProfiles(profiles),
    uploadTargets: buildUploadTargets(profiles),
    generatorDefaults: getGeneratorDefaults(),
    stations: loadStations(),
    seocOptions: getSeocOptions(),
    uiSettings,
    constants: {
      processingLimits: getProcessingLimits(),
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
      leieValidationGuidePath,
    },
    userConfig: {
      uiSettingsPath: getUiSettingsPath(),
    },
  };
}

function exportDiagnosticReport(payload = {}) {
  const outputDir = String(payload.outputDir || "").trim();
  if (!outputDir) throw new Error("Please choose a folder for the diagnostic report.");
  fs.mkdirSync(outputDir, { recursive: true });
  const appVersion = loadAppVersionInfo();
  const profiles = loadUploadProfiles();
  const settings = loadUiSettings();
  const report = {
    generatedAt: new Date().toISOString(),
    appVersion: appVersion.version,
    appLabel: appVersion.displayLabel,
    platform: process.platform,
    architecture: process.arch,
    runtimeVersions: process.versions,
    uploadProfileSummary: summarizeUploadProfiles(profiles),
    processingLimits: getProcessingLimits(),
    workflowPreferences: {
      theme: settings.theme,
      mainTab: settings.mainTab,
      subTab: settings.subTab,
      randomizeSsn: settings.randomizeSsn,
      randomizeDob: settings.randomizeDob,
      randomizeStationId: settings.randomizeStationId,
      matchSuffixLength: settings.matchSuffixLength,
      uploadEnabled: settings.uploadEnabled,
      leieDuplicateHandling: settings.leieDuplicateHandling,
    },
    health: {
      stationCount: loadStations().length,
      selectableStationCount: loadStationOptions().length,
      seocOptionCount: getSeocOptions().length,
      userGuideAvailable: fs.existsSync(dataPath("docs", "USER_GUIDE.pdf")),
    },
  };
  const reportPath = path.join(outputDir, `ccrs-diagnostics-${Date.now()}.json`);
  writeFileAtomic(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { reportPath, message: `Diagnostic report saved to ${reportPath}.` };
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
  const totalSourceBytes = assertSourceFilesWithinLimits(sourceFiles);

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
    totalSourceBytes,
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

  if (payload.identityOptions?.randomizeSsn === false && (payload.ssnValue || "").trim()) {
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
  const processingLimits = getProcessingLimits();
  if (Number(payload.fileCount || 0) > processingLimits.maxGeneratedFiles) {
    fieldErrors.fileCount = `Number of JSON files cannot exceed ${processingLimits.maxGeneratedFiles.toLocaleString()}.`;
  }
  if (Number(payload.referralsPerFile || 0) > processingLimits.maxReferralsPerFile) {
    fieldErrors.referralsPerFile = `Referrals per file cannot exceed ${processingLimits.maxReferralsPerFile.toLocaleString()}.`;
  }
  if (Number(payload.fileCount || 0) * Number(payload.referralsPerFile || 0) > processingLimits.maxGeneratedReferrals) {
    fieldErrors.referralsPerFile = `The generated batch cannot exceed ${processingLimits.maxGeneratedReferrals.toLocaleString()} referrals.`;
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
    targets: Array.isArray(uploadPayload.resolvedTargets)
      ? uploadPayload.resolvedTargets
      : resolveUploadTargets(loadUploadProfiles(), uploadPayload.targets || []),
  };
}

function prepareBackgroundPayload(command, payload = {}) {
  const prepared = structuredClone(payload || {});
  if (prepared.upload?.enabled) {
    prepared.upload.resolvedTargets = resolveUploadTargets(loadUploadProfiles(), prepared.upload.targets || []);
  }
  if (command === "test-upload-target") {
    const [resolvedTarget] = resolveUploadTargets(loadUploadProfiles(), [{
      server_name: String(prepared.server_name || "").trim(),
      user_name: String(prepared.user_name || "").trim(),
      remote_directory: String(prepared.remote_directory || "").trim(),
    }]);
    prepared.resolvedTarget = resolvedTarget;
  }
  return prepared;
}

function buildCommonArgs(payload, progressCallback) {
  const ssnValue = (payload.ssnValue || "999-99-0001").trim();
  const identityOptions = {
    randomizeSsn: payload.identityOptions?.randomizeSsn !== false,
    randomizeDob: payload.identityOptions?.randomizeDob !== false,
    randomizeStationId: Boolean(payload.identityOptions?.randomizeStationId),
    matchSuffixLength: [3, 4, 5].includes(Number(payload.identityOptions?.matchSuffixLength))
      ? Number(payload.identityOptions.matchSuffixLength)
      : 5,
  };
  if (!identityOptions.randomizeSsn) validateSsn(ssnValue);

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
    identityOptions,
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
    args.archiveBasename,
    args.identityOptions
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
  const limits = getProcessingLimits();
  if (fileCount > limits.maxGeneratedFiles) {
    throw new Error(`Files to generate cannot exceed ${limits.maxGeneratedFiles.toLocaleString()}.`);
  }
  if (referralsPerFile > limits.maxReferralsPerFile) {
    throw new Error(`Referrals per file cannot exceed ${limits.maxReferralsPerFile.toLocaleString()}.`);
  }
  if (fileCount * referralsPerFile > limits.maxGeneratedReferrals) {
    throw new Error(`The generated batch cannot exceed ${limits.maxGeneratedReferrals.toLocaleString()} referrals.`);
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
      args.archiveBasename,
      args.identityOptions
    );
    return { message };
  } finally {
    removePath(generatedInputDir);
  }
}

async function runTestUploadTarget(payload) {
  if (payload.resolvedTarget) {
    const resolvedTarget = payload.resolvedTarget;
    const message = await testUploadConnection(resolvedTarget.connection_details, resolvedTarget.remote_directory);
    return { message: `${resolvedTarget.server_name}: ${message}` };
  }
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
  if (command === "export-diagnostics") return exportDiagnosticReport(payload);
  if (command === "acknowledge-release-announcement") {
    const releaseKey = String(payload.releaseKey || "").trim();
    saveReleaseTracker({ acknowledgedReleaseKey: releaseKey });
    return {
      uiSettings: saveUiSettings({
        ...loadUiSettings(),
        acknowledgedReleaseKey: releaseKey,
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
  if (command === "inspect-leie-source") {
    return inspectLeieSourceAsync(payload);
  }
  if (command === "process-leie") {
    return processLeieFiles(payload, emitProgress);
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
  prepareBackgroundPayload,
};
