const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DEFAULT_ARCHIVE_BASENAME = "processed_files";
const ARCHIVE_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

function sanitizeArchiveBasename(value) {
  let basename = (value || "").trim();
  if (!basename) {
    return DEFAULT_ARCHIVE_BASENAME;
  }

  basename = basename.replace(/\.(json|gz)$/i, "");
  basename = basename.replace(/\s+/g, "_");
  basename = basename.replace(/[<>:"/\\|?*]+/g, "_");
  basename = basename.replace(/_+/g, "_");
  basename = basename.replace(/^[ .]+|[ .]+$/g, "");
  return basename || DEFAULT_ARCHIVE_BASENAME;
}

function sanitizeArchiveSegment(value) {
  const sanitized = sanitizeArchiveBasename(value || "").replace(/^_+|_+$/g, "");
  return sanitized === DEFAULT_ARCHIVE_BASENAME && !(value || "").trim() ? "" : sanitized;
}

function formatArchiveReferralDateTime(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(ARCHIVE_DATE_TIME_PATTERN);
  if (!match) {
    throw new Error("Enter Referral DateTime in Referral Details using YYYY-MM-DD HH:mm:ss to append it to the .gz name.");
  }

  return `${match[1]}${match[2]}${match[3]}_${match[4]}${match[5]}${match[6]}`;
}

function buildArchiveBasename(payload = {}) {
  const archiveNamingOptions = payload.archiveNamingOptions || {};
  const optionalOverrides = payload.optionalOverrides || {};
  const segments = [sanitizeArchiveBasename(payload.archiveBasename || DEFAULT_ARCHIVE_BASENAME)];

  if (archiveNamingOptions.includeNetwork) {
    const networkSegment = sanitizeArchiveSegment(optionalOverrides.Network || "");
    if (!networkSegment) {
      throw new Error("Choose a Network in Referral Details before appending it to the .gz name.");
    }
    segments.push(networkSegment);
  }

  if (archiveNamingOptions.includeReferralDateTime) {
    segments.push(formatArchiveReferralDateTime(optionalOverrides.ReferralDateTime || ""));
  }

  return sanitizeArchiveBasename(segments.join("_"));
}

function zipOutput(folder, archiveBasename = DEFAULT_ARCHIVE_BASENAME) {
  if (!fs.existsSync(folder)) {
    return null;
  }

  const normalizedArchiveBase = sanitizeArchiveBasename(archiveBasename);
  let combinedContainer = null;
  const fallbackPayloads = [];

  for (const filename of fs.readdirSync(folder).sort()) {
    const filePath = path.join(folder, filename);
    if (!fs.statSync(filePath).isFile() || !filename.toLowerCase().endsWith(".json")) {
      continue;
    }

    const rawContent = fs.readFileSync(filePath, "utf8");
    let content = rawContent;
    try {
      content = JSON.parse(rawContent);
    } catch (_error) {
      content = rawContent;
    }

    if (content && typeof content === "object" && Array.isArray(content.Referrals)) {
      if (combinedContainer == null) {
        combinedContainer = { ...content, Referrals: [...content.Referrals] };
      } else {
        combinedContainer.Referrals = combinedContainer.Referrals || [];
        combinedContainer.Referrals.push(...content.Referrals);
        for (const [key, value] of Object.entries(content)) {
          if (key === "Referrals") {
            continue;
          }
          const currentValue = combinedContainer[key];
          if (
            !Object.prototype.hasOwnProperty.call(combinedContainer, key) ||
            currentValue === "" ||
            currentValue == null ||
            (Array.isArray(currentValue) && currentValue.length === 0) ||
            (typeof currentValue === "object" && !Array.isArray(currentValue) && Object.keys(currentValue).length === 0)
          ) {
            combinedContainer[key] = value;
          }
        }
      }
    } else {
      fallbackPayloads.push({ filename, content });
    }
  }

  const archivePath = path.join(folder, `${normalizedArchiveBase}.gz`);
  const payload = combinedContainer != null ? combinedContainer : fallbackPayloads;
  fs.writeFileSync(archivePath, zlib.gzipSync(Buffer.from(JSON.stringify(payload, null, 2), "utf8")));
  return archivePath;
}

module.exports = {
  buildArchiveBasename,
  DEFAULT_ARCHIVE_BASENAME,
  formatArchiveReferralDateTime,
  sanitizeArchiveBasename,
  zipOutput,
};
