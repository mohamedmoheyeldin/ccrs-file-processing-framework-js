const fs = require("fs");
const {
  LIST_DATE_FORMAT,
  PAYMENT_AUTHORITY_CODE_LENGTH,
  REFERRAL_NUMBER_DIGIT_COUNT,
  REFERRAL_NUMBER_PREFIX,
  STATION_ID_MAX_LENGTH,
  extractJsonChangeDefaults,
  extractListDate,
  generateOptionalFieldOverrides,
  validateReferralNumberStart,
  validateSsn,
} = require("./contentEditor");
const { dataPath, ensureRuntimeFiles, getRuntimeRoot } = require("./appPaths");
const { getFiles } = require("./fileHandler");
const { setupLogger } = require("./logger");
const { processFiles } = require("./processor");
const {
  ROTATE_ALL_TEMPLATES,
  buildGeneratedReferralSources,
  getReferralTemplateMetadata,
  getReferralTemplateOptions,
} = require("./referralGenerator");
const {
  getServerDisplayForTarget,
  getUploadProfileSourcePath,
  getUploadTargetNames,
  getUserNamesForServer,
  importUploadSourceToConfig,
  loadUploadProfiles,
  resolveUploadTargets,
} = require("./uploader");
const { sanitizeFilenameBase } = require("./renamer");
const { DEFAULT_ARCHIVE_BASENAME, sanitizeArchiveBasename } = require("./zipper");

ensureRuntimeFiles();
setupLogger();

function buildUploadTargets(profiles) {
  return getUploadTargetNames(profiles).map((targetName) => ({
    name: targetName,
    serverDisplay: getServerDisplayForTarget(profiles, targetName),
    users: getUserNamesForServer(profiles, targetName),
    defaultRemoteDirectory: "/CCRA_Uploads",
  }));
}

function getInfo() {
  const profiles = loadUploadProfiles();
  const [profileSourcePath, profileSourceKind] = getUploadProfileSourcePath();
  return {
    runtimeRoot: getRuntimeRoot(),
    profileSource: {
      path: profileSourcePath,
      kind: profileSourceKind,
    },
    templateOptions: getReferralTemplateOptions(),
    templateMetadata: getReferralTemplateMetadata(),
    uploadTargets: buildUploadTargets(profiles),
    constants: {
      listDateFormat: LIST_DATE_FORMAT,
      referralNumberPrefix: REFERRAL_NUMBER_PREFIX,
      referralNumberDigits: REFERRAL_NUMBER_DIGIT_COUNT,
      stationIdMaxLength: STATION_ID_MAX_LENGTH,
      paymentAuthorityCodeLength: PAYMENT_AUTHORITY_CODE_LENGTH,
      rotateAllTemplatesLabel: ROTATE_ALL_TEMPLATES,
      defaultArchiveBasename: DEFAULT_ARCHIVE_BASENAME,
    },
    docs: {
      userGuidePath: dataPath("docs", "CCRS_File_Processing_Framework_User_Guide.pdf"),
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
  const archiveBasename = sanitizeArchiveBasename(payload.archiveBasename || DEFAULT_ARCHIVE_BASENAME);
  const referralValue = (payload.referralReplacementCode || "").trim();
  const optionalOverrides = payload.optionalOverrides || {};

  let normalizedReferral = "";
  if (referralValue) {
    normalizedReferral = validateReferralNumberStart(referralValue);
  }

  return {
    replacementCode,
    archiveBasename,
    referralNumber: normalizedReferral,
    optionalOverrides: generateOptionalFieldOverrides(optionalOverrides),
  };
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
    listDateOverride: (payload.listDateOverride || "").trim() || null,
    ssnValue,
    optionalOverrides: generateOptionalFieldOverrides(payload.optionalOverrides || {}),
    keepProcessedJson: Boolean(payload.keepProcessedJson),
    progressCallback,
    uploadOptions: buildUploadOptions(payload),
    archiveBasename: (payload.archiveBasename || "").trim() || null,
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
  const templateOption = (payload.templateOption || "").trim() || ROTATE_ALL_TEMPLATES;
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
    generatedInputDir = buildGeneratedReferralSources(templateOption, fileCount, referralsPerFile);
    const message = await processFiles(
      generatedInputDir,
      args.outputDir,
      args.replacementCode,
      args.clearOutput,
      args.referralReplacementCode,
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
    if (generatedInputDir && fs.existsSync(generatedInputDir)) {
      fs.rmSync(generatedInputDir, { recursive: true, force: true });
    }
  }
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
  throw new Error(`Unsupported command: ${command}`);
}

module.exports = {
  handleCommand,
};
