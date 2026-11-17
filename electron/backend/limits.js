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

/** Message shown when a batch of source or generated JSON is larger than the combined limit. */
function describeTotalSizeLimit(totalBytes, limitBytes, { generated = false, estimated = false } = {}) {
  const size = `${estimated ? "about " : ""}${formatBytes(totalBytes)}`;
  const subject = generated ? `This run would create ${size} of JSON files` : `The selected source files total ${size}`;
  const advice = generated
    ? "Lower the number of JSON files or the referrals per file, or split the work into several runs."
    : "Split the files into smaller batches and run them one batch at a time.";
  return `${subject}, which is over the ${formatBytes(limitBytes)} combined safety limit. ${advice}`;
}

function assertSourceFilesWithinLimits(filePaths) {
  const limits = getProcessingLimits();
  let totalBytes = 0;
  for (const filePath of filePaths) {
    const size = require("fs").statSync(filePath).size;
    if (size > limits.maxSourceFileBytes) {
      throw new Error(`Source file exceeds the ${formatBytes(limits.maxSourceFileBytes)} safety limit: ${filePath}`);
    }
    totalBytes += size;
  }
  if (totalBytes > limits.maxTotalSourceBytes) {
    throw new Error(describeTotalSizeLimit(totalBytes, limits.maxTotalSourceBytes));
  }
  return totalBytes;
}

module.exports = {
  DEFAULT_LIMITS,
  assertSourceFilesWithinLimits,
  describeTotalSizeLimit,
  formatBytes,
  getProcessingLimits,
};
