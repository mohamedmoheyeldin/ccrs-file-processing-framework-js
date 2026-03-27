const path = require("path");
const { clearDirectory, directoryHasContents, getFiles, removeJsonFiles, saveFile } = require("./fileHandler");
const { log } = require("./logger");
const { renameFile } = require("./renamer");
const { modifyContent } = require("./contentEditor");
const { uploadFile } = require("./uploader");
const { zipOutput } = require("./zipper");

async function processFiles(
  inputDir,
  outputDir,
  replacementCode,
  clearOutput,
  referralReplacementCode,
  icnSettings,
  listDateOverride,
  ssnValue,
  optionalOverrides,
  keepProcessedJson,
  progressCallback,
  uploadOptions,
  archiveBasename
) {
  const files = getFiles(inputDir);
  if (files.length === 0) {
    log("warning", "No files found in input directory.");
    return "No files found in the selected source folder.";
  }

  let processedCount = 0;
  let errorCount = 0;
  let referralSequenceIndex = 1;
  let icnSequenceIndex = 1;

  removeJsonFiles(outputDir);
  if (clearOutput && directoryHasContents(outputDir)) {
    clearDirectory(outputDir);
    log("info", `Cleared existing files from: ${outputDir}`);
  }

  const totalFiles = files.length;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const currentIndex = index + 1;
    try {
      const newName = renameFile(file, replacementCode, currentIndex, totalFiles);
      const result = modifyContent(
        file,
        referralReplacementCode,
        listDateOverride,
        ssnValue,
        currentIndex,
        totalFiles,
        optionalOverrides,
        referralSequenceIndex,
        icnSettings,
        icnSequenceIndex
      );
      saveFile(outputDir, newName, result.content);
      if (result.referralNumbersUsed) {
        referralSequenceIndex += result.referralNumbersUsed;
      }
      if (result.patientIdentitiesUsed) {
        icnSequenceIndex += result.patientIdentitiesUsed;
      }

      processedCount += 1;
      log("info", `Processed: ${file} -> ${newName}`);
      if (progressCallback) {
        progressCallback(currentIndex, totalFiles, path.basename(file), "processed");
      }
    } catch (error) {
      errorCount += 1;
      log("error", `Error processing ${file}: ${error.message}`);
      if (progressCallback) {
        progressCallback(currentIndex, totalFiles, path.basename(file), "error");
      }
    }
  }

  const archivePath = zipOutput(outputDir, archiveBasename);
  const uploadedPaths = [];

  if (archivePath) {
    if (uploadOptions && uploadOptions.enabled) {
      const selectedTargets = uploadOptions.targets || [];
      for (let index = 0; index < selectedTargets.length; index += 1) {
        const uploadTarget = selectedTargets[index];
        if (progressCallback) {
          progressCallback(index + 1, selectedTargets.length, path.basename(archivePath), "uploading", uploadTarget.server_name);
        }
        const uploadedPath = await uploadFile(
          archivePath,
          uploadTarget.remote_directory,
          uploadTarget.connection_details
        );
        uploadedPaths.push({
          server_name: uploadTarget.server_name,
          remote_path: uploadedPath,
        });
        log("info", `Uploaded gzip file to ${uploadTarget.server_name}: ${uploadedPath}`);
      }
    }

    if (!keepProcessedJson) {
      removeJsonFiles(outputDir);
      log("info", `Removed processed JSON files from: ${outputDir}`);
    }

    log("info", `Created gzip file: ${archivePath}`);
    const uploadedMessage =
      uploadedPaths.length > 0
        ? ` Uploaded file to ${uploadedPaths.map((item) => `${item.server_name} (${item.remote_path})`).join(", ")}.`
        : "";
    const jsonMessage = keepProcessedJson ? `saved output to ${outputDir}` : `saved output to ${outputDir} temporarily`;
    return (
      `Done. Processed ${processedCount} file${processedCount !== 1 ? "s" : ""}, ` +
      `${jsonMessage}, and created ${archivePath}.` +
      uploadedMessage +
      (errorCount ? ` ${errorCount} file${errorCount !== 1 ? "s" : ""} had errors.` : "")
    );
  }

  return (
    `Done. Processed ${processedCount} file${processedCount !== 1 ? "s" : ""} and saved output to ${outputDir}, ` +
    `but no .gz file was created.` +
    (errorCount ? ` ${errorCount} file${errorCount !== 1 ? "s" : ""} had errors.` : "")
  );
}

module.exports = {
  processFiles,
};
