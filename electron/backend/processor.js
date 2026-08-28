const fs = require("fs");
const path = require("path");
const { assertSafeFolderRelationship, createRunId, createRunStagingDirectory, listFileMetadata, promoteStagedFiles, sha256File } = require("./batchSafety");
const { clearDirectory, getFiles, saveFile } = require("./fileHandler");
const { log } = require("./logger");
const { renameFile } = require("./renamer");
const { modifyContent } = require("./contentEditor");
const { uploadFileWithRetry } = require("./uploader");
const { zipOutput } = require("./zipper");
const { assertSourceFilesWithinLimits } = require("./limits");
const { saveRun } = require("./runHistory");
const { writeFileAtomic } = require("./atomicFile");
const { validateReferralSourceFiles } = require("./referralValidator");

function emit(callback, event) {
  callback?.({ phase: event.phase || "processing", state: event.state || "working", current: Number(event.current) || 0, total: Number(event.total) || 0, filename: String(event.filename || ""), uploadTarget: event.uploadTarget || null, detail: event.detail || null, message: event.message || null });
}

function collectValues(node, acceptedKeys, values = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectValues(item, acceptedKeys, values);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (acceptedKeys.has(key.toLowerCase()) && ["string", "number"].includes(typeof value)) {
        const normalized = String(value).trim();
        if (normalized) values.push(normalized);
      }
      collectValues(value, acceptedKeys, values);
    }
  }
  return values;
}

function summarizeProcessedJson(stagingDir) {
  const referralNumbers = [];
  const icnNumbers = [];
  const stationIds = [];
  let referralCount = 0;
  for (const file of getFiles(stagingDir)) {
    const content = JSON.parse(fs.readFileSync(file, "utf8"));
    referralCount += Array.isArray(content?.Referrals) ? content.Referrals.length : 0;
    collectValues(content, new Set(["referralnumber", "referral_number"]), referralNumbers);
    collectValues(content, new Set(["icn", "icnnumber", "icn_number"]), icnNumbers);
    collectValues(content, new Set(["stationid", "station_id"]), stationIds);
  }
  const stationDistribution = {};
  for (const stationId of stationIds) stationDistribution[stationId] = (stationDistribution[stationId] || 0) + 1;
  return {
    referralCount: referralCount || referralNumbers.length,
    referralNumbers: { first: referralNumbers[0] || "", last: referralNumbers.at(-1) || "", count: referralNumbers.length, unique: new Set(referralNumbers).size === referralNumbers.length },
    icnCount: icnNumbers.length,
    stationDistribution,
  };
}

function buildManifest({ runId, startedAt, sourceFiles, stagingDir, archiveName, outputDir, processedCount, batchSummary, identityOptions, icnSettings, uploadResults, appVersion }) {
  const archivePath = path.join(stagingDir, archiveName);
  return {
    schemaVersion: 1,
    runId,
    applicationVersion: String(appVersion || ""),
    workflow: "referral",
    startedAt,
    completedAt: new Date().toISOString(),
    status: uploadResults.some((item) => item.status === "failed") ? "upload-failed" : "completed",
    outputDirectory: outputDir,
    counts: { sourceFiles: sourceFiles.length, processedFiles: processedCount, referrals: batchSummary.referralCount, icns: batchSummary.icnCount },
    referralNumbers: batchSummary.referralNumbers,
    icnMode: String(icnSettings?.mode || ""),
    selectedStationIds: [...(identityOptions?.selectedStationIds || [])],
    stationDistribution: batchSummary.stationDistribution,
    sourceFiles: sourceFiles.map((filePath) => ({ name: path.basename(filePath), bytes: fs.statSync(filePath).size, sha256: sha256File(filePath) })),
    generatedJsonFiles: listFileMetadata(stagingDir, ".json").filter((item) => !item.name.endsWith(".manifest.json")),
    archive: { name: archiveName, bytes: fs.statSync(archivePath).size, sha256: sha256File(archivePath) },
    uploads: uploadResults,
  };
}

async function processFiles(inputDir, outputDir, replacementCode, clearOutput, referralReplacementCode, icnSettings, listDateOverride, ssnValue, optionalOverrides, keepProcessedJson, progressCallback, uploadOptions, archiveBasename, identityOptions, runContext = {}) {
  assertSafeFolderRelationship(inputDir, outputDir);
  const files = getFiles(inputDir);
  if (files.length === 0) throw new Error("No JSON files were found in the selected source folder.");
  assertSourceFilesWithinLimits(files);
  const preflight = validateReferralSourceFiles(files);

  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const stagingDir = createRunStagingDirectory();
  let processedCount = 0;
  let referralSequenceIndex = 1;
  let icnSequenceIndex = 1;
  const failures = [];

  try {
    emit(progressCallback, { phase: "preflight", state: "preflight-complete", current: preflight.referralCount, total: preflight.referralCount, message: `${files.length} source file${files.length === 1 ? "" : "s"} and ${preflight.referralCount.toLocaleString()} referral${preflight.referralCount === 1 ? "" : "s"} passed schema, path, and size validation.` });
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const newName = renameFile(file, replacementCode, index + 1, files.length);
        const result = modifyContent(file, referralReplacementCode, listDateOverride, ssnValue, index + 1, files.length, optionalOverrides, referralSequenceIndex, icnSettings, icnSequenceIndex, identityOptions);
        saveFile(stagingDir, newName, result.content);
        referralSequenceIndex += result.referralNumbersUsed || 0;
        icnSequenceIndex += result.patientIdentitiesUsed || 0;
        processedCount += 1;
        log("info", `Processed in staging: ${file} -> ${newName}`);
        emit(progressCallback, { phase: "processing", state: "processed", current: index + 1, total: files.length, filename: path.basename(file), message: `Processed ${index + 1} of ${files.length} source files.` });
      } catch (error) {
        failures.push({ fileName: path.basename(file), message: error.message });
        log("error", `Error processing ${file}: ${error.message}`);
        emit(progressCallback, { phase: "processing", state: "error", current: index + 1, total: files.length, filename: path.basename(file), detail: error.message, message: `Validation failed for ${path.basename(file)}.` });
      }
    }

    if (failures.length > 0) {
      const summary = failures.slice(0, 5).map((failure) => `${failure.fileName}: ${failure.message}`).join("; ");
      throw new Error(`The batch was stopped because ${failures.length} source file${failures.length === 1 ? "" : "s"} failed. No archive was created or uploaded. ${summary}${failures.length > 5 ? "; ..." : ""}`);
    }

    const batchSummary = summarizeProcessedJson(stagingDir);
    if (!batchSummary.referralNumbers.unique) throw new Error("The batch contains duplicate Referral Numbers. No archive was created or uploaded.");
    emit(progressCallback, { phase: "packaging", state: "packaging", filename: archiveBasename || "referrals", message: "Creating the gzip archive from this run's isolated staging folder." });
    const stagedArchivePath = await zipOutput(stagingDir, archiveBasename);
    if (!stagedArchivePath) throw new Error("No .gz archive could be created from the processed files.");
    const archiveName = path.basename(stagedArchivePath);
    const manifestName = `${path.basename(archiveName, ".gz")}.manifest.json`;
    const uploadResults = [];
    const manifestArgs = { runId, startedAt, sourceFiles: files, stagingDir, archiveName, outputDir, processedCount, batchSummary, identityOptions, icnSettings, uploadResults, appVersion: runContext.appVersion };
    writeFileAtomic(path.join(stagingDir, manifestName), `${JSON.stringify(buildManifest(manifestArgs), null, 2)}\n`, "utf8");

    const jsonNames = keepProcessedJson
      ? getFiles(stagingDir).map((filePath) => path.basename(filePath)).filter((name) => name !== manifestName)
      : [];
    const promotedPaths = promoteStagedFiles(stagingDir, outputDir, [...jsonNames, archiveName, manifestName], clearOutput, clearDirectory);
    const archivePath = path.join(outputDir, archiveName);
    const manifestPath = path.join(outputDir, manifestName);
    emit(progressCallback, { phase: "packaging", state: "archive-created", current: 1, total: 1, filename: archiveName, message: "Archive and manifest were saved safely." });

    if (uploadOptions?.enabled) {
      const selectedTargets = uploadOptions.targets || [];
      for (let index = 0; index < selectedTargets.length; index += 1) {
        const target = selectedTargets[index];
        emit(progressCallback, { phase: "upload", state: "uploading", current: index + 1, total: selectedTargets.length, filename: archiveName, uploadTarget: target.server_name, message: `Uploading to ${target.server_name}.` });
        try {
          const remotePath = await uploadFileWithRetry(archivePath, target.remote_directory, target.connection_details);
          uploadResults.push({ serverName: target.server_name, userName: target.user_name || "", remoteDirectory: target.remote_directory, remotePath, status: "completed", message: "Upload completed." });
          emit(progressCallback, { phase: "upload", state: "upload-target-complete", current: index + 1, total: selectedTargets.length, filename: archiveName, uploadTarget: target.server_name });
        } catch (error) {
          uploadResults.push({ serverName: target.server_name, userName: target.user_name || "", remoteDirectory: target.remote_directory, remotePath: "", status: "failed", message: error.message });
          emit(progressCallback, { phase: "upload", state: "upload-target-error", current: index + 1, total: selectedTargets.length, filename: archiveName, uploadTarget: target.server_name, detail: error.message });
        }
      }
    }

    const finalManifest = buildManifest(manifestArgs);
    writeFileAtomic(manifestPath, `${JSON.stringify(finalManifest, null, 2)}\n`, "utf8");
    const failedUploads = uploadResults.filter((item) => item.status === "failed");
    const run = saveRun({ runId, createdAt: finalManifest.completedAt, status: failedUploads.length ? "upload-failed" : "completed", workflow: "referral", outputDir, archivePath, manifestPath, processedCount, referralCount: batchSummary.referralCount, uploadResults });
    const message = failedUploads.length
      ? `Processed ${processedCount} files and created ${archiveName}, but ${failedUploads.length} upload target${failedUploads.length === 1 ? "" : "s"} failed. Use Retry Failed Uploads; processing does not need to run again.`
      : `Completed safely. Processed ${processedCount} file${processedCount === 1 ? "" : "s"}, created ${archiveName}, and wrote a batch manifest.`;
    return { message, run, archivePath, manifestPath, outputDir, promotedPaths, uploadResults, retryable: failedUploads.length > 0 };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

module.exports = { collectValues, processFiles, summarizeProcessedJson };
