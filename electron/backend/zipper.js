const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DEFAULT_ARCHIVE_BASENAME = "processed_files";

function sanitizeArchiveBasename(value) {
  let basename = (value || "").trim();
  if (!basename) {
    return DEFAULT_ARCHIVE_BASENAME;
  }

  basename = basename.replace(/\.(json|gz)$/i, "");
  basename = basename.replace(/[<>:"/\\|?*]+/g, "_");
  basename = basename.replace(/^[ .]+|[ .]+$/g, "");
  return basename || DEFAULT_ARCHIVE_BASENAME;
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
  DEFAULT_ARCHIVE_BASENAME,
  sanitizeArchiveBasename,
  zipOutput,
};
