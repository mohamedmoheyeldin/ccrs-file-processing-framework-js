const fs = require("fs");
const { bundlePath, dataPath } = require("./appPaths");

function loadMappings() {
  const runtimePath = dataPath("config", "mappings.json");
  if (fs.existsSync(runtimePath)) {
    return JSON.parse(fs.readFileSync(runtimePath, "utf8"));
  }

  const bundledPath = bundlePath("config", "mappings.json");
  if (fs.existsSync(bundledPath)) {
    return JSON.parse(fs.readFileSync(bundledPath, "utf8"));
  }

  throw new Error("Could not find config/mappings.json in either the runtime or bundled app resources.");
}

const LIST_DATE_FORMAT = "YYYY-MM-DD HH:mm:ss";
const SSN_PATTERN = /^\d{3}-\d{2}-\d{4}$/;
const OPTIONAL_RANDOM_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const NUMERIC_RANDOM_CHARSET = "0123456789";
const STATION_ID_MAX_LENGTH = 5;
const PAYMENT_AUTHORITY_CODE_LENGTH = 10;
const REFERRAL_NUMBER_PREFIX = "VA";
const REFERRAL_NUMBER_TOTAL_LENGTH = 12;
const REFERRAL_NUMBER_DIGIT_COUNT = REFERRAL_NUMBER_TOTAL_LENGTH - REFERRAL_NUMBER_PREFIX.length;
const TRACKED_JSON_FIELDS = [
  "SSN",
  "DOB",
  "Network",
  "StationID",
  "PaymentAuthorityCode",
  "ReferralCategory",
  "ReferralDate",
  "ReferralDateTime",
  "ReferralExpirationDate",
  "ReferralLastUpdateDate",
  "ReferralPeriod",
  "ReferralConsultId",
];

const VARIABLE_OVERRIDE_FIELDS = {
  StationID: {
    length: STATION_ID_MAX_LENGTH,
    charset: OPTIONAL_RANDOM_CHARSET,
  },
  PaymentAuthorityCode: {
    length: PAYMENT_AUTHORITY_CODE_LENGTH,
    charset: NUMERIC_RANDOM_CHARSET,
  },
};

const FIRST_NAMES = [
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
  "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
];
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
];

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomFromCharset(charset, length) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += charset[Math.floor(Math.random() * charset.length)];
  }
  return output;
}

function validateSsn(ssnValue) {
  if (!SSN_PATTERN.test((ssnValue || "").trim())) {
    throw new Error("SSN must use the format 999-99-0001.");
  }
}

function normalizeStationId(value) {
  return ((value || "").trim().match(/[A-Za-z0-9]/g) || []).join("");
}

function normalizePaymentAuthorityCode(value) {
  return ((value || "").trim().match(/\d/g) || []).join("");
}

function completeWithRandomSuffix(value, targetLength, fillCharacters = OPTIONAL_RANDOM_CHARSET) {
  const normalized = (value || "").trim();
  if (normalized.length >= targetLength) {
    return normalized.slice(0, targetLength);
  }
  return normalized + randomFromCharset(fillCharacters, targetLength - normalized.length);
}

function validateStationId(value) {
  const normalized = normalizeStationId(value);
  if (normalized.length > STATION_ID_MAX_LENGTH) {
    throw new Error(`Station ID must be ${STATION_ID_MAX_LENGTH} characters or less.`);
  }
  return completeWithRandomSuffix(normalized, STATION_ID_MAX_LENGTH);
}

function validatePaymentAuthorityCode(value) {
  const normalized = normalizePaymentAuthorityCode(value);
  if (normalized.length > PAYMENT_AUTHORITY_CODE_LENGTH) {
    throw new Error(`Payment Authority Code must be ${PAYMENT_AUTHORITY_CODE_LENGTH} characters or less.`);
  }
  return completeWithRandomSuffix(normalized, PAYMENT_AUTHORITY_CODE_LENGTH, NUMERIC_RANDOM_CHARSET);
}

function generateOptionalFieldOverrides(rawOverrides) {
  const overrides = {};
  for (const [key, rawValue] of Object.entries(rawOverrides || {})) {
    const normalizedValue = (rawValue || "").trim();
    if (key !== "StationID" && key !== "PaymentAuthorityCode" && normalizedValue) {
      overrides[key] = normalizedValue;
    }
  }

  if (Object.prototype.hasOwnProperty.call(rawOverrides || {}, "StationID")) {
    overrides.StationID = validateStationId(rawOverrides.StationID || "");
  }
  if (Object.prototype.hasOwnProperty.call(rawOverrides || {}, "PaymentAuthorityCode")) {
    overrides.PaymentAuthorityCode = validatePaymentAuthorityCode(rawOverrides.PaymentAuthorityCode || "");
  }
  return overrides;
}

function normalizeReferralNumberStart(value) {
  let normalized = (value || "").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith(REFERRAL_NUMBER_PREFIX)) {
    normalized = normalized.slice(REFERRAL_NUMBER_PREFIX.length);
  }

  normalized = ((normalized || "").match(/[A-Za-z0-9]/g) || []).join("");
  if (!normalized) {
    return "";
  }

  if (normalized.length > REFERRAL_NUMBER_DIGIT_COUNT) {
    return `${REFERRAL_NUMBER_PREFIX}${normalized.slice(0, REFERRAL_NUMBER_DIGIT_COUNT)}`;
  }

  return `${REFERRAL_NUMBER_PREFIX}${normalized.padStart(REFERRAL_NUMBER_DIGIT_COUNT, "0")}`;
}

function validateReferralNumberStart(value) {
  const normalized = normalizeReferralNumberStart(value);
  if (!normalized) {
    throw new Error("Enter only the number part of Referral Number.");
  }

  let bodyOnly = (value || "").trim();
  if (bodyOnly.startsWith(REFERRAL_NUMBER_PREFIX)) {
    bodyOnly = bodyOnly.slice(REFERRAL_NUMBER_PREFIX.length);
  }
  bodyOnly = (bodyOnly.match(/[A-Za-z0-9]/g) || []).join("");
  if (bodyOnly.length > REFERRAL_NUMBER_DIGIT_COUNT) {
    throw new Error(`Enter up to ${REFERRAL_NUMBER_DIGIT_COUNT} letters or numbers for Referral Number.`);
  }

  return normalized;
}

function fitReferralBody(baseValue, availableLength) {
  if (availableLength <= 0) {
    throw new Error("Referral Number does not have enough room for the generated sequence.");
  }
  return (baseValue || "").padStart(REFERRAL_NUMBER_DIGIT_COUNT, "0").slice(-availableLength);
}

function generateReferralNumber(startValue, sequenceIndex) {
  const normalizedStart = validateReferralNumberStart(startValue);
  const normalizedBody = normalizedStart.slice(REFERRAL_NUMBER_PREFIX.length);
  const offset = Math.max((sequenceIndex || 1) - 1, 0);

  if (/^\d+$/.test(normalizedBody)) {
    const generatedNumber = Number(normalizedBody) + offset;
    const upperBound = 10 ** REFERRAL_NUMBER_DIGIT_COUNT;
    if (generatedNumber >= upperBound) {
      throw new Error(
        `Referral Number range exceeded. The largest supported value is ${REFERRAL_NUMBER_PREFIX}${"9".repeat(REFERRAL_NUMBER_DIGIT_COUNT)}.`
      );
    }
    return `${REFERRAL_NUMBER_PREFIX}${String(generatedNumber).padStart(REFERRAL_NUMBER_DIGIT_COUNT, "0")}`;
  }

  const suffixMatch = normalizedBody.match(/(\d+)$/);
  if (suffixMatch) {
    const suffixDigits = suffixMatch[1];
    const prefixPart = normalizedBody.slice(0, -suffixDigits.length);
    const incrementedSuffix = String(Number(suffixDigits) + offset);
    if (incrementedSuffix.length >= REFERRAL_NUMBER_DIGIT_COUNT) {
      throw new Error("Referral Number range exceeded for the selected files.");
    }

    const maxPrefixLength = REFERRAL_NUMBER_DIGIT_COUNT - incrementedSuffix.length;
    const adjustedPrefix = fitReferralBody(prefixPart, maxPrefixLength);
    const availableSuffixLength = REFERRAL_NUMBER_DIGIT_COUNT - adjustedPrefix.length;
    return `${REFERRAL_NUMBER_PREFIX}${adjustedPrefix}${incrementedSuffix.padStart(availableSuffixLength, "0")}`;
  }

  if ((sequenceIndex || 1) === 1) {
    return `${REFERRAL_NUMBER_PREFIX}${normalizedBody}`;
  }

  const sequenceSuffix = String(Math.max(sequenceIndex || 1, 1));
  const prefixLength = REFERRAL_NUMBER_DIGIT_COUNT - sequenceSuffix.length;
  if (prefixLength <= 0) {
    throw new Error("Too many files were selected for the available Referral Number length.");
  }

  return `${REFERRAL_NUMBER_PREFIX}${fitReferralBody(normalizedBody, prefixLength)}${sequenceSuffix}`;
}

function encodeSequenceValue(number, charset) {
  if (number <= 0) {
    return charset[0];
  }

  const base = charset.length;
  let current = number;
  const encoded = [];
  while (current > 0) {
    const remainder = current % base;
    current = Math.floor(current / base);
    encoded.push(charset[remainder]);
  }
  return encoded.reverse().join("");
}

function generateUniqueFieldValue(baseValue, sequenceIndex, totalLength, charset) {
  let normalized = (baseValue || "").trim();
  if (!normalized) {
    normalized = randomFromCharset(charset, totalLength);
  }
  normalized = normalized.slice(0, totalLength);

  if ((sequenceIndex || 1) <= 1) {
    return normalized;
  }

  let sequenceOffset = (sequenceIndex || 1) - 1;
  while (true) {
    const suffix = encodeSequenceValue(sequenceOffset, charset);
    const candidate =
      suffix.length >= totalLength
        ? suffix.slice(-totalLength)
        : `${normalized.slice(0, totalLength - suffix.length)}${suffix}`;
    if (candidate !== normalized) {
      return candidate;
    }
    sequenceOffset += 1;
  }
}

function getStationIdSequenceCharset(baseValue) {
  const normalized = normalizeStationId(baseValue);
  const lastChar = normalized.slice(-1);
  if (/[A-Za-z]/.test(lastChar)) {
    return NUMERIC_RANDOM_CHARSET;
  }
  if (/\d/.test(lastChar)) {
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  }
  return OPTIONAL_RANDOM_CHARSET;
}

function getVariableFieldSequenceCharset(key, baseValue) {
  if (key === "StationID") {
    return getStationIdSequenceCharset(baseValue);
  }
  return VARIABLE_OVERRIDE_FIELDS[key].charset;
}

function updatePatientIdentity(data, ssnValue) {
  if (Array.isArray(data)) {
    for (const item of data) {
      updatePatientIdentity(item, ssnValue);
    }
    return;
  }

  if (!data || typeof data !== "object") {
    return;
  }

  if (["ICN", "FirstName", "LastName", "SSN"].every((key) => Object.prototype.hasOwnProperty.call(data, key))) {
    data.ICN = `TEST${randomFromCharset(NUMERIC_RANDOM_CHARSET, 13)}`;
    data.FirstName = randomChoice(FIRST_NAMES);
    data.LastName = randomChoice(LAST_NAMES);
    if (Object.prototype.hasOwnProperty.call(data, "MiddleName")) {
      data.MiddleName = randomChoice("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
    }
    data.SSN = ssnValue;
  }

  for (const value of Object.values(data)) {
    updatePatientIdentity(value, ssnValue);
  }
}

function applyOptionalOverrides(data, overrides) {
  const variableOverrideCounts = {};
  const variableOverrideUsedValues = {};
  for (const key of Object.keys(VARIABLE_OVERRIDE_FIELDS)) {
    variableOverrideCounts[key] = 0;
    variableOverrideUsedValues[key] = new Set();
  }

  function apply(currentData) {
    if (Array.isArray(currentData)) {
      for (const item of currentData) {
        apply(item);
      }
      return;
    }

    if (!currentData || typeof currentData !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(currentData)) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        if (VARIABLE_OVERRIDE_FIELDS[key]) {
          const settings = VARIABLE_OVERRIDE_FIELDS[key];
          const sequenceCharset = key === "StationID" ? getStationIdSequenceCharset(overrides[key]) : settings.charset;

          while (true) {
            variableOverrideCounts[key] += 1;
            const candidateValue = generateUniqueFieldValue(
              overrides[key],
              variableOverrideCounts[key],
              settings.length,
              sequenceCharset
            );
            if (!variableOverrideUsedValues[key].has(candidateValue)) {
              variableOverrideUsedValues[key].add(candidateValue);
              currentData[key] = candidateValue;
              break;
            }
          }
        } else {
          currentData[key] = overrides[key];
        }
      } else {
        apply(value);
      }
    }
  }

  apply(data);
}

function ensureSourceVariableFieldsAreUnique(data, overrides = {}) {
  const usedValues = {};
  const duplicateCounts = {};
  for (const key of Object.keys(VARIABLE_OVERRIDE_FIELDS)) {
    usedValues[key] = new Set();
    duplicateCounts[key] = new Map();
  }

  function apply(currentData) {
    if (Array.isArray(currentData)) {
      for (const item of currentData) {
        apply(item);
      }
      return;
    }

    if (!currentData || typeof currentData !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(currentData)) {
      if (VARIABLE_OVERRIDE_FIELDS[key] && !Object.prototype.hasOwnProperty.call(overrides, key)) {
        const settings = VARIABLE_OVERRIDE_FIELDS[key];
        const baseValue = typeof value === "string" || typeof value === "number" ? String(value) : "";
        const duplicateIndex = (duplicateCounts[key].get(baseValue) || 0) + 1;
        duplicateCounts[key].set(baseValue, duplicateIndex);

        if (!usedValues[key].has(baseValue)) {
          usedValues[key].add(baseValue);
          continue;
        }

        const sequenceCharset = getVariableFieldSequenceCharset(key, baseValue);
        let sequenceIndex = Math.max(duplicateIndex, 2);
        while (true) {
          const candidateValue = generateUniqueFieldValue(
            baseValue,
            sequenceIndex,
            settings.length,
            sequenceCharset
          );
          if (!usedValues[key].has(candidateValue)) {
            usedValues[key].add(candidateValue);
            currentData[key] = candidateValue;
            break;
          }
          sequenceIndex += 1;
        }
      } else {
        apply(value);
      }
    }
  }

  apply(data);
}

function applyReferralNumberOverride(data, startValue, sequenceStart = 1) {
  let replacementsUsed = 0;

  if (Array.isArray(data)) {
    for (const item of data) {
      replacementsUsed += applyReferralNumberOverride(item, startValue, sequenceStart + replacementsUsed);
    }
    return replacementsUsed;
  }

  if (!data || typeof data !== "object") {
    return replacementsUsed;
  }

  for (const [key, value] of Object.entries(data)) {
    if (key === "ReferralNumber" && (typeof value !== "object" || value === null)) {
      data[key] = generateReferralNumber(startValue, sequenceStart + replacementsUsed);
      replacementsUsed += 1;
    } else {
      replacementsUsed += applyReferralNumberOverride(value, startValue, sequenceStart + replacementsUsed);
    }
  }

  return replacementsUsed;
}

function extractFirstValues(data, defaults) {
  if (Array.isArray(data)) {
    for (const item of data) {
      extractFirstValues(item, defaults);
    }
    return;
  }

  if (!data || typeof data !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(data)) {
    if (Object.prototype.hasOwnProperty.call(defaults, key) && defaults[key] === "" && (typeof value !== "object" || value === null)) {
      defaults[key] = String(value);
    }
    extractFirstValues(value, defaults);
  }
}

function extractJsonChangeDefaults(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const defaults = Object.fromEntries(TRACKED_JSON_FIELDS.map((fieldName) => [fieldName, ""]));
  defaults.ReferralNumber = "";
  extractFirstValues(data, defaults);

  if (defaults.ReferralNumber) {
    const normalizedReferral = normalizeReferralNumberStart(defaults.ReferralNumber);
    if (normalizedReferral) {
      defaults.ReferralNumber = normalizedReferral.slice(REFERRAL_NUMBER_PREFIX.length);
    }
  }

  return defaults;
}

function extractListDate(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/"ListDate"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function modifyContent(
  filePath,
  referralReplacementCode,
  listDateOverride,
  ssnValue,
  _fileIndex,
  _totalFiles,
  optionalOverrides,
  referralSequenceStart = 1
) {
  const mappings = loadMappings();
  let content = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(mappings)) {
    content = content.split(key).join(value);
  }

  if (listDateOverride) {
    content = content.replace(/("ListDate"\s*:\s*")([^"]+)(")/g, `$1${listDateOverride}$3`);
  }

  validateSsn(ssnValue);
  const data = JSON.parse(content);
  let referralNumbersUsed = 0;
  if (referralReplacementCode) {
    referralNumbersUsed = applyReferralNumberOverride(data, referralReplacementCode, referralSequenceStart);
  }
  updatePatientIdentity(data, ssnValue.trim());
  if (optionalOverrides && Object.keys(optionalOverrides).length > 0) {
    applyOptionalOverrides(data, optionalOverrides);
  }
  ensureSourceVariableFieldsAreUnique(data, optionalOverrides);

  return {
    content: JSON.stringify(data, null, 4),
    referralNumbersUsed,
  };
}

module.exports = {
  LIST_DATE_FORMAT,
  PAYMENT_AUTHORITY_CODE_LENGTH,
  REFERRAL_NUMBER_DIGIT_COUNT,
  REFERRAL_NUMBER_PREFIX,
  STATION_ID_MAX_LENGTH,
  completeWithRandomSuffix,
  extractJsonChangeDefaults,
  extractListDate,
  generateOptionalFieldOverrides,
  generateReferralNumber,
  modifyContent,
  normalizePaymentAuthorityCode,
  normalizeReferralNumberStart,
  normalizeStationId,
  validatePaymentAuthorityCode,
  validateReferralNumberStart,
  validateSsn,
  validateStationId,
};
