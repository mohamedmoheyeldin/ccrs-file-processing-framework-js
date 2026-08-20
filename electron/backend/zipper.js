const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { once } = require("events");

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

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, "drain");
}

async function zipOutput(folder, archiveBasename = DEFAULT_ARCHIVE_BASENAME) {
  if (!fs.existsSync(folder)) {
    return null;
  }

  const normalizedArchiveBase = sanitizeArchiveBasename(archiveBasename);
  const jsonFiles = fs.readdirSync(folder).sort().filter((filename) => {
    const filePath = path.join(folder, filename);
    return fs.statSync(filePath).isFile() && filename.toLowerCase().endsWith(".json");
  });
  if (jsonFiles.length === 0) return null;

  const archivePath = path.join(folder, `${normalizedArchiveBase}.gz`);
  const gzip = zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED });
  const output = fs.createWriteStream(archivePath);
  gzip.pipe(output);

  const firstPath = path.join(folder, jsonFiles[0]);
  let firstContent;
  try {
    firstContent = JSON.parse(fs.readFileSync(firstPath, "utf8"));
  } catch (_error) {
    firstContent = null;
  }
  const referralMode = Boolean(firstContent && typeof firstContent === "object" && Array.isArray(firstContent.Referrals));

  if (referralMode) {
    const metadata = { ...firstContent };
    delete metadata.Referrals;
    const metadataJson = JSON.stringify(metadata);
    await writeChunk(gzip, `${metadataJson.slice(0, -1)},"Referrals":[`);
    let firstReferral = true;
    for (const filename of jsonFiles) {
      const content = JSON.parse(fs.readFileSync(path.join(folder, filename), "utf8"));
      for (const referral of Array.isArray(content.Referrals) ? content.Referrals : []) {
        await writeChunk(gzip, `${firstReferral ? "" : ","}${JSON.stringify(referral)}`);
        firstReferral = false;
      }
    }
    await writeChunk(gzip, "]}");
  } else {
    await writeChunk(gzip, "[");
    for (let index = 0; index < jsonFiles.length; index += 1) {
      const filename = jsonFiles[index];
      const rawContent = fs.readFileSync(path.join(folder, filename), "utf8");
      let content = rawContent;
      try {
        content = JSON.parse(rawContent);
      } catch (_error) {
        // Preserve non-JSON input as text in the fallback archive format.
      }
      await writeChunk(gzip, `${index ? "," : ""}${JSON.stringify({ filename, content })}`);
    }
    await writeChunk(gzip, "]");
  }

  gzip.end();
  await once(output, "finish");
  return archivePath;
}

module.exports = {
  buildArchiveBasename,
  DEFAULT_ARCHIVE_BASENAME,
  formatArchiveReferralDateTime,
  sanitizeArchiveBasename,
  zipOutput,
};
