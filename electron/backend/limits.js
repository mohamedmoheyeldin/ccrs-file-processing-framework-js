const DEFAULT_LIMITS = Object.freeze({
  maxSourceFileBytes: 250 * 1024 * 1024,
  maxTotalSourceBytes: 1024 * 1024 * 1024,
  maxLeieRows: 1_000_000,
  maxGeneratedFiles: 500,
  maxReferralsPerFile: 10_000,
  maxGeneratedReferrals: 1_000_000,
});

function envLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function getProcessingLimits() {
  return {
    maxSourceFileBytes: envLimit("CCRS_MAX_SOURCE_FILE_BYTES", DEFAULT_LIMITS.maxSourceFileBytes),
    maxTotalSourceBytes: envLimit("CCRS_MAX_TOTAL_SOURCE_BYTES", DEFAULT_LIMITS.maxTotalSourceBytes),
    maxLeieRows: envLimit("CCRS_MAX_LEIE_ROWS", DEFAULT_LIMITS.maxLeieRows),
    maxGeneratedFiles: envLimit("CCRS_MAX_GENERATED_FILES", DEFAULT_LIMITS.maxGeneratedFiles),
    maxReferralsPerFile: envLimit("CCRS_MAX_REFERRALS_PER_FILE", DEFAULT_LIMITS.maxReferralsPerFile),
    maxGeneratedReferrals: envLimit("CCRS_MAX_GENERATED_REFERRALS", DEFAULT_LIMITS.maxGeneratedReferrals),
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Message shown when the selected source files are larger than the combined limit. */
function describeTotalSizeLimit(totalBytes, limitBytes) {
  return `The selected source files total ${formatBytes(totalBytes)}, which is over the ${formatBytes(limitBytes)} combined safety limit. Split the files into smaller batches and run them one batch at a time.`;
}

/**
 * Warning for a generate run that is larger than the recommended size. Large generate runs are
 * allowed: files are written and packaged as streams, so the run needs disk space, not memory.
 */
function describeLargeGeneratedRun(estimatedBytes, limitBytes) {
  // The run holds the generated sources, the processed JSON, the combined JSON and the archive.
  const diskBytes = estimatedBytes * 3;
  return `This run will create about ${formatBytes(estimatedBytes)} of JSON files, which is more than the recommended ${formatBytes(limitBytes)}. You can still run it. It will take longer, and the computer needs about ${formatBytes(diskBytes)} of free disk space.`;
}

function assertSourceFilesWithinLimits(filePaths, { allowLargeTotal = false } = {}) {
  const limits = getProcessingLimits();
  let totalBytes = 0;
  for (const filePath of filePaths) {
    const size = require("fs").statSync(filePath).size;
    if (size > limits.maxSourceFileBytes) {
      throw new Error(`Source file exceeds the ${formatBytes(limits.maxSourceFileBytes)} safety limit: ${filePath}`);
    }
    totalBytes += size;
  }
  if (!allowLargeTotal && totalBytes > limits.maxTotalSourceBytes) {
    throw new Error(describeTotalSizeLimit(totalBytes, limits.maxTotalSourceBytes));
  }
  return totalBytes;
}

module.exports = {
  DEFAULT_LIMITS,
  assertSourceFilesWithinLimits,
  describeLargeGeneratedRun,
  describeTotalSizeLimit,
  formatBytes,
  getProcessingLimits,
};
