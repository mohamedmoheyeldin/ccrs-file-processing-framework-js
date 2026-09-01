const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { once } = require("events");

const DEFAULT_ARCHIVE_BASENAME = "referrals";
const IFAMS_FILENAME_PREFIX = "iFAMS";
const VA_IFAMS_FILENAME_PREFIX = "VAiFAMS";
const ARCHIVE_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const ARCHIVE_NAMING_MODES = {
  REFERRAL_NUMBER: "referral-number",
  NETWORK: "network",
  REFERRAL_DATE_TIME: "referral-date-time",
  PREFIX: "prefix",
  CUSTOM: "custom",
};

function sanitizeArchiveBasename(value) {
  let basename = (value || "").trim();
  if (!basename) {
    return DEFAULT_ARCHIVE_BASENAME;
  }

  basename = basename.replace(/(?:\.(?:json|gz))+$/i, "");
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

  return `${match[1]}-${match[2]}-${match[3]}_${match[4]}${match[5]}${match[6]}`;
}

function formatCurrentDateTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function resolveReferralPrefix(identityOptions = {}) {
  const mode = String(identityOptions.referralPrefixMode || "va").trim().toLowerCase();
  if (mode === "ifams") return IFAMS_FILENAME_PREFIX;
  if (mode === "mixed") return VA_IFAMS_FILENAME_PREFIX;
  if (mode === "custom") return sanitizeArchiveSegment(identityOptions.customReferralPrefix || "VA") || "VA";
  return "VA";
}

function resolveArchivePrefixToken(identityOptions = {}) {
  return resolveReferralPrefix(identityOptions);
}

function resolveReferralNumber(payload = {}) {
  const value = String(payload.referralReplacementCode || "").trim();
  if (!value) return DEFAULT_ARCHIVE_BASENAME;
  const prefix = resolveReferralPrefix(payload.identityOptions);
  if (/^(?:va|ifams)/i.test(value) || value.toLowerCase().startsWith(prefix.toLowerCase())) {
    return sanitizeArchiveSegment(value);
  }
  return sanitizeArchiveSegment(`${prefix}${value}`);
}

function resolveNamingTokens(payload = {}, now = new Date()) {
  const optionalOverrides = payload.optionalOverrides || {};
  const referralDateTime = String(optionalOverrides.ReferralDateTime || "").trim();
  const dateTime = referralDateTime ? formatArchiveReferralDateTime(referralDateTime) : formatCurrentDateTime(now);
  const date = sanitizeArchiveSegment(
    optionalOverrides.ReferralDate || referralDateTime.slice(0, 10) ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  );
  return {
    referralNumber: resolveReferralNumber(payload),
    referralPrefix: resolveArchivePrefixToken(payload.identityOptions),
    icn: sanitizeArchiveSegment(payload.icnPreview || ""),
    networkName: sanitizeArchiveSegment(optionalOverrides.Network || ""),
    date,
    dateTime,
    customText: sanitizeArchiveSegment(payload.archiveNamingOptions?.customText || ""),
  };
}

function resolveNamingPattern(pattern, tokens) {
  const resolved = String(pattern || "").replace(
    /\{(referralNumber|referralPrefix|icn|networkName|date|dateTime|customText)\}/g,
    (_match, tokenName) => tokens[tokenName] || ""
  );
  return sanitizeArchiveBasename(resolved.replace(/_+/g, "_"));
}

function buildArchiveBasename(payload = {}, now = new Date()) {
  const archiveNamingOptions = payload.archiveNamingOptions || {};
  const requestedMode = String(archiveNamingOptions.mode || "").trim();
  if (!Object.values(ARCHIVE_NAMING_MODES).includes(requestedMode)) {
    const legacySegments = [];
    const baseSegment = sanitizeArchiveBasename(payload.archiveBasename || DEFAULT_ARCHIVE_BASENAME);
    if (archiveNamingOptions.useIfamsPrefix && !/^ifams(?:_|$)/i.test(baseSegment)) legacySegments.push(IFAMS_FILENAME_PREFIX);
    legacySegments.push(baseSegment);
    if (archiveNamingOptions.includeNetwork) {
      const networkSegment = sanitizeArchiveSegment(payload.optionalOverrides?.Network || "");
      if (!networkSegment) throw new Error("Choose a Network before adding it to the archive name.");
      legacySegments.push(networkSegment);
    }
    if (archiveNamingOptions.includeReferralDateTime) {
      legacySegments.push(formatArchiveReferralDateTime(payload.optionalOverrides?.ReferralDateTime || ""));
    }
    legacySegments.push(formatCurrentDateTime(now));
    return sanitizeArchiveBasename(legacySegments.join("_"));
  }

  const tokens = resolveNamingTokens(payload, now);
  if (requestedMode === ARCHIVE_NAMING_MODES.NETWORK && !tokens.networkName) {
    throw new Error("Choose a Network before using Network Name archive naming.");
  }
  const patterns = {
    [ARCHIVE_NAMING_MODES.REFERRAL_NUMBER]: "{referralNumber}_Final",
    [ARCHIVE_NAMING_MODES.NETWORK]: "{networkName}_{referralNumber}_Final",
    [ARCHIVE_NAMING_MODES.REFERRAL_DATE_TIME]: "{referralNumber}_{dateTime}_Final",
    [ARCHIVE_NAMING_MODES.PREFIX]: "{referralPrefix}_{referralNumber}_Final",
    [ARCHIVE_NAMING_MODES.CUSTOM]: archiveNamingOptions.customPattern || "{customText}_{referralNumber}_Final",
  };
  let pattern = patterns[requestedMode];
  if (requestedMode === ARCHIVE_NAMING_MODES.PREFIX) {
    const body = tokens.referralNumber.replace(/^(?:VA|iFAMS)/i, "").replace(
      new RegExp(`^${resolveReferralPrefix(payload.identityOptions).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
      ""
    );
    pattern = `${tokens.referralPrefix}_${body}_Final`;
  }
  const basename = resolveNamingPattern(pattern, tokens);
  if (!basename || basename === DEFAULT_ARCHIVE_BASENAME) {
    throw new Error("Archive naming must produce a non-empty filename.");
  }
  return basename;
}

function buildOutputFileNames(payload = {}, now = new Date()) {
  const basename = buildArchiveBasename(payload, now);
  return { basename, json: `${basename}.json`, gzip: `${basename}.gz` };
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
  ARCHIVE_NAMING_MODES,
  buildArchiveBasename,
  buildOutputFileNames,
  DEFAULT_ARCHIVE_BASENAME,
  IFAMS_FILENAME_PREFIX,
  formatCurrentDateTime,
  formatArchiveReferralDateTime,
  sanitizeArchiveBasename,
  resolveNamingPattern,
  resolveNamingTokens,
  zipOutput,
};
