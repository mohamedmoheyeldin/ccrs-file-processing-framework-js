const fs = require("fs");
const { bundlePath, dataPath } = require("./appPaths");
const { loadStationOptions } = require("./stationCatalog");

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
const SSN_PATTERN = /^999-\d{2}-\d{4}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const OPTIONAL_RANDOM_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const NUMERIC_RANDOM_CHARSET = "0123456789";
const STATION_ID_MAX_LENGTH = 9;
const PAYMENT_AUTHORITY_CODE_LENGTH = 5;
const PAYMENT_AUTHORITY_CODE_MAX = 99999;
const PAYMENT_AUTHORITY_CODE_DEFAULT_START = 10000;
const PAYMENT_AUTHORITY_CODE_ERROR_MESSAGE =
  `Payment Authority Code must be a whole number between 0 and ${PAYMENT_AUTHORITY_CODE_MAX}.`;
const REFERRAL_NUMBER_PREFIX = "VA";
const REFERRAL_NUMBER_TOTAL_LENGTH = 12;
const REFERRAL_NUMBER_DIGIT_COUNT = REFERRAL_NUMBER_TOTAL_LENGTH - REFERRAL_NUMBER_PREFIX.length;
const ICN_TEST_PREFIX = "TEST";
const ICN_TOTAL_LENGTH = 17;
const ICN_TEST_SUFFIX_LENGTH = ICN_TOTAL_LENGTH - ICN_TEST_PREFIX.length;
const ICN_MODES = {
  TEST_DYNAMIC: "test-dynamic",
  TEST_CUSTOM_SUFFIX: "test-custom-suffix",
  CUSTOM_FULL: "custom-full",
};
const RANDOM_SSN_BASE = Math.floor(Math.random() * 1000000);
const RANDOM_DOB_BASE = Math.floor(Math.random() * 24107);
const RANDOM_STATION_ASSIGNMENT_STATES = new WeakMap();
const TRACKED_JSON_FIELDS = [
  "SSN",
  "DOB",
  "Network",
  "StationID",
  "SeocID",
  "SeocKey",
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
    throw new Error("SSN must start with 999 and use the format 999-99-0001.");
  }
}

function validateIsoDate(value, fieldLabel) {
  const normalized = (value || "").trim();
  if (!normalized) {
    return "";
  }
  if (!ISO_DATE_PATTERN.test(normalized)) {
    throw new Error(`${fieldLabel} must use the format YYYY-MM-DD.`);
  }

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldLabel} must be a valid calendar date.`);
  }
  return normalized;
}

function validateIsoDateTime(value, fieldLabel) {
  const normalized = (value || "").trim();
  if (!normalized) {
    return "";
  }
  if (!ISO_DATE_TIME_PATTERN.test(normalized)) {
    throw new Error(`${fieldLabel} must use the format YYYY-MM-DD HH:mm:ss.`);
  }

  const [datePart, timePart] = normalized.split(" ");
  const parsed = new Date(`${datePart}T${timePart}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldLabel} must be a valid date and time.`);
  }
  return normalized;
}

function normalizeStationId(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizePaymentAuthorityCode(value) {
  return ((value || "").trim().match(/\d/g) || []).join("");
}

function normalizeAlphaNumeric(value) {
  return ((value || "").trim().match(/[A-Za-z0-9]/g) || []).join("").toUpperCase();
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
  if (!normalized) {
    return "";
  }
  if (normalized.length > STATION_ID_MAX_LENGTH) {
    throw new Error(`Station ID must be ${STATION_ID_MAX_LENGTH} characters or less.`);
  }
  if (!loadStationOptions().some((option) => option.stationKey === normalized)) {
    throw new Error("Station ID must exactly match a station_id from the station reference data.");
  }
  return normalized;
}

function generateRandomSsn(sequenceIndex = 1) {
  const offset = Math.max(sequenceIndex - 1, 0);
  const generatedSuffix = String((RANDOM_SSN_BASE + offset) % 1000000).padStart(6, "0");
  const digits = `999${generatedSuffix}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function generateRandomDob(sequenceIndex = 1) {
  const firstDay = Date.UTC(1940, 0, 1);
  const lastDay = Date.UTC(2005, 11, 31);
  const dayCount = Math.floor((lastDay - firstDay) / 86400000) + 1;
  const dayOffset = (RANDOM_DOB_BASE + Math.max(sequenceIndex - 1, 0)) % dayCount;
  return new Date(firstDay + dayOffset * 86400000).toISOString().slice(0, 10);
}

function validatePaymentAuthorityCode(value) {
  const normalized = normalizePaymentAuthorityCode(value);
  if (!normalized) {
    return "";
  }

  if (normalized.length > PAYMENT_AUTHORITY_CODE_LENGTH) {
    throw new Error(PAYMENT_AUTHORITY_CODE_ERROR_MESSAGE);
  }

  const numericValue = Number(normalized);
  if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > PAYMENT_AUTHORITY_CODE_MAX) {
    throw new Error(PAYMENT_AUTHORITY_CODE_ERROR_MESSAGE);
  }

  return normalized;
}

function validateIcnSettings(rawSettings = {}) {
  const requestedMode = String(rawSettings.mode || ICN_MODES.TEST_DYNAMIC).trim();
  const mode = Object.values(ICN_MODES).includes(requestedMode) ? requestedMode : ICN_MODES.TEST_DYNAMIC;

  if (mode === ICN_MODES.TEST_DYNAMIC) {
    return {
      mode,
      value: "",
    };
  }

  if (mode === ICN_MODES.TEST_CUSTOM_SUFFIX) {
    const normalizedValue = normalizeAlphaNumeric(rawSettings.value || "");
    if (!normalizedValue) {
      throw new Error(`Enter up to ${ICN_TEST_SUFFIX_LENGTH} letters or numbers after ${ICN_TEST_PREFIX}.`);
    }
    if (normalizedValue.length > ICN_TEST_SUFFIX_LENGTH) {
      throw new Error(`Enter up to ${ICN_TEST_SUFFIX_LENGTH} letters or numbers after ${ICN_TEST_PREFIX}.`);
    }
    return {
      mode,
      value: normalizedValue,
    };
  }

  const normalizedValue = normalizeAlphaNumeric(rawSettings.value || "");
  if (!normalizedValue) {
    throw new Error(`Enter up to ${ICN_TOTAL_LENGTH} letters or numbers for the full ICN.`);
  }
  if (normalizedValue.length > ICN_TOTAL_LENGTH) {
    throw new Error(`Enter up to ${ICN_TOTAL_LENGTH} letters or numbers for the full ICN.`);
  }

  return {
    mode: ICN_MODES.CUSTOM_FULL,
    value: normalizedValue,
  };
}

function prepareIcnSettings(rawSettings = {}) {
  const validatedSettings = validateIcnSettings(rawSettings);

  if (validatedSettings.mode === ICN_MODES.TEST_DYNAMIC) {
    return {
      mode: validatedSettings.mode,
      baseValue: randomFromCharset(NUMERIC_RANDOM_CHARSET, ICN_TEST_SUFFIX_LENGTH),
    };
  }

  if (validatedSettings.mode === ICN_MODES.TEST_CUSTOM_SUFFIX) {
    return {
      mode: validatedSettings.mode,
      baseValue: completeWithRandomSuffix(
        validatedSettings.value,
        ICN_TEST_SUFFIX_LENGTH,
        OPTIONAL_RANDOM_CHARSET
      ),
    };
  }

  return {
    mode: validatedSettings.mode,
    baseValue: completeWithRandomSuffix(validatedSettings.value, ICN_TOTAL_LENGTH),
  };
}

function describeIcnPreview(rawSettings = {}) {
  const validatedSettings = validateIcnSettings(rawSettings);

  if (validatedSettings.mode === ICN_MODES.TEST_DYNAMIC) {
    return `Preview: ${ICN_TEST_PREFIX} + ${ICN_TEST_SUFFIX_LENGTH} generated digits`;
  }

  if (validatedSettings.mode === ICN_MODES.TEST_CUSTOM_SUFFIX) {
    const remaining = ICN_TEST_SUFFIX_LENGTH - validatedSettings.value.length;
    if (remaining <= 0) {
      return `Preview: ${ICN_TEST_PREFIX}${validatedSettings.value}`;
    }
    return `Preview: ${ICN_TEST_PREFIX}${validatedSettings.value} + ${remaining} generated character${remaining === 1 ? "" : "s"}`;
  }

  const remaining = ICN_TOTAL_LENGTH - validatedSettings.value.length;
  if (remaining <= 0) {
    return `Preview: ${validatedSettings.value}`;
  }
  return `Preview: ${validatedSettings.value} + ${remaining} generated character${remaining === 1 ? "" : "s"}`;
}

function generateIcnValue(icnSettings, sequenceIndex) {
  if (!icnSettings || !icnSettings.mode) {
    icnSettings = prepareIcnSettings();
  }

  if (icnSettings.mode === ICN_MODES.CUSTOM_FULL) {
    return generateUniqueFieldValue(
      icnSettings.baseValue,
      sequenceIndex,
      ICN_TOTAL_LENGTH,
      OPTIONAL_RANDOM_CHARSET
    );
  }

  return `${ICN_TEST_PREFIX}${generateUniqueFieldValue(
    icnSettings.baseValue,
    sequenceIndex,
    ICN_TEST_SUFFIX_LENGTH,
    icnSettings.mode === ICN_MODES.TEST_CUSTOM_SUFFIX ? OPTIONAL_RANDOM_CHARSET : NUMERIC_RANDOM_CHARSET
  )}`;
}

function generatePaymentAuthorityCodeValue(baseValue, sequenceIndex) {
  const normalized = normalizePaymentAuthorityCode(baseValue);
  const baseNumericValue = normalized ? Number(normalized) : PAYMENT_AUTHORITY_CODE_DEFAULT_START;
  const offset = Math.max((sequenceIndex || 1) - 1, 0);
  const candidateValue = baseNumericValue + offset;

  if (!Number.isInteger(candidateValue) || candidateValue < 0 || candidateValue > PAYMENT_AUTHORITY_CODE_MAX) {
    throw new Error(
      `Payment Authority Code range exceeded. The largest supported value is ${PAYMENT_AUTHORITY_CODE_MAX}.`
    );
  }

  return String(candidateValue);
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
  if (Object.prototype.hasOwnProperty.call(rawOverrides || {}, "DOB")) {
    overrides.DOB = validateIsoDate(rawOverrides.DOB || "", "DOB");
  }
  if (Object.prototype.hasOwnProperty.call(rawOverrides || {}, "ReferralDate")) {
    overrides.ReferralDate = validateIsoDate(rawOverrides.ReferralDate || "", "Referral Date");
  }
  if (Object.prototype.hasOwnProperty.call(rawOverrides || {}, "ReferralDateTime")) {
    overrides.ReferralDateTime = validateIsoDateTime(rawOverrides.ReferralDateTime || "", "Referral DateTime");
  }
  if (Object.prototype.hasOwnProperty.call(rawOverrides || {}, "ReferralExpirationDate")) {
    overrides.ReferralExpirationDate = validateIsoDate(
      rawOverrides.ReferralExpirationDate || "",
      "Referral Expiration Date"
    );
  }
  if (Object.prototype.hasOwnProperty.call(rawOverrides || {}, "ReferralLastUpdateDate")) {
    overrides.ReferralLastUpdateDate = validateIsoDate(
      rawOverrides.ReferralLastUpdateDate || "",
      "Referral Last Update Date"
    );
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

function updatePatientIdentity(data, ssnValue, icnSettings = prepareIcnSettings(), sequenceStart = 1, identityOptions = {}) {
  let replacementsUsed = 0;

  if (Array.isArray(data)) {
    for (const item of data) {
      replacementsUsed += updatePatientIdentity(item, ssnValue, icnSettings, sequenceStart + replacementsUsed, identityOptions);
    }
    return replacementsUsed;
  }

  if (!data || typeof data !== "object") {
    return replacementsUsed;
  }

  if (["ICN", "FirstName", "LastName", "SSN"].every((key) => Object.prototype.hasOwnProperty.call(data, key))) {
    data.ICN = generateIcnValue(icnSettings, sequenceStart + replacementsUsed);
    data.FirstName = randomChoice(FIRST_NAMES);
    data.LastName = randomChoice(LAST_NAMES);
    if (Object.prototype.hasOwnProperty.call(data, "MiddleName")) {
      data.MiddleName = randomChoice("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
    }
    const identityIndex = sequenceStart + replacementsUsed;
    data.SSN = identityOptions.randomizeSsn ? generateRandomSsn(identityIndex) : ssnValue;
    if (identityOptions.randomizeDob && Object.prototype.hasOwnProperty.call(data, "DOB")) {
      data.DOB = generateRandomDob(identityIndex);
    }
    replacementsUsed += 1;
  }

  for (const value of Object.values(data)) {
    replacementsUsed += updatePatientIdentity(value, ssnValue, icnSettings, sequenceStart + replacementsUsed, identityOptions);
  }

  return replacementsUsed;
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
        if (key === "StationID") {
          currentData[key] = overrides[key];
        } else if (VARIABLE_OVERRIDE_FIELDS[key]) {
          while (true) {
            variableOverrideCounts[key] += 1;
            const candidateValue =
              key === "PaymentAuthorityCode"
                ? generatePaymentAuthorityCodeValue(overrides[key], variableOverrideCounts[key])
                : generateUniqueFieldValue(
                    overrides[key],
                    variableOverrideCounts[key],
                    VARIABLE_OVERRIDE_FIELDS[key].length,
                    getStationIdSequenceCharset(overrides[key])
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

function applyRandomValidStationIds(data, identityOptions = {}) {
  const stationOptions = loadStationOptions();
  if (stationOptions.length === 0) {
    throw new Error("No valid Station IDs are available in the reference list.");
  }

  let assignmentState = RANDOM_STATION_ASSIGNMENT_STATES.get(identityOptions);
  if (!assignmentState) {
    const stationKeys = stationOptions.map((option) => option.stationKey);
    for (let index = stationKeys.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [stationKeys[index], stationKeys[swapIndex]] = [
        stationKeys[swapIndex],
        stationKeys[index],
      ];
    }
    assignmentState = { stationKeys, stationIndex: 0 };
    RANDOM_STATION_ASSIGNMENT_STATES.set(identityOptions, assignmentState);
  }
  const shuffledStationKeys = assignmentState.stationKeys;
  const validStationKeys = new Set(shuffledStationKeys);
  let stationIndex = assignmentState.stationIndex;

  function apply(currentData) {
    if (Array.isArray(currentData)) {
      currentData.forEach(apply);
      return;
    }
    if (!currentData || typeof currentData !== "object") return;
    for (const [key, value] of Object.entries(currentData)) {
      if (key === "StationID") {
        const stationKey = shuffledStationKeys[stationIndex % shuffledStationKeys.length];
        if (!validStationKeys.has(stationKey)) {
          throw new Error("Generated Station ID did not match the reference list.");
        }
        currentData[key] = stationKey;
        stationIndex += 1;
        assignmentState.stationIndex = stationIndex;
      } else {
        apply(value);
      }
    }
  }
  apply(data);
}

function alignReferralAndIcnSuffixes(data, suffixLength) {
  const length = Number(suffixLength || 0);
  if (![3, 4, 5].includes(length)) return;
  const usedIcns = new Set();

  function replaceIcnSuffix(currentData, suffix) {
    if (Array.isArray(currentData)) return currentData.forEach((item) => replaceIcnSuffix(item, suffix));
    if (!currentData || typeof currentData !== "object") return;
    for (const [key, value] of Object.entries(currentData)) {
      if (key === "ICN" && typeof value === "string") {
        const prefix = value.slice(0, Math.max(0, value.length - length));
        let candidate = `${prefix}${suffix}`;
        let attempt = 0;
        while (usedIcns.has(candidate) && prefix.length > 0) {
          const marker = OPTIONAL_RANDOM_CHARSET[attempt % OPTIONAL_RANDOM_CHARSET.length];
          candidate = `${prefix.slice(0, -1)}${marker}${suffix}`;
          attempt += 1;
        }
        usedIcns.add(candidate);
        currentData[key] = candidate;
      } else {
        replaceIcnSuffix(value, suffix);
      }
    }
  }

  function visit(currentData) {
    if (Array.isArray(currentData)) return currentData.forEach(visit);
    if (!currentData || typeof currentData !== "object") return;
    if (typeof currentData.ReferralNumber === "string") {
      replaceIcnSuffix(currentData, currentData.ReferralNumber.slice(-length));
      return;
    }
    Object.values(currentData).forEach(visit);
  }
  visit(data);
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
        if (key === "PaymentAuthorityCode") {
          validatePaymentAuthorityCode(baseValue);
        }
        const duplicateIndex = (duplicateCounts[key].get(baseValue) || 0) + 1;
        duplicateCounts[key].set(baseValue, duplicateIndex);

        if (!usedValues[key].has(baseValue)) {
          usedValues[key].add(baseValue);
          continue;
        }

        let sequenceIndex = Math.max(duplicateIndex, 2);
        while (true) {
          const candidateValue =
            key === "PaymentAuthorityCode"
              ? generatePaymentAuthorityCodeValue(baseValue, sequenceIndex)
              : generateUniqueFieldValue(
                  baseValue,
                  sequenceIndex,
                  settings.length,
                  getVariableFieldSequenceCharset(key, baseValue)
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
  referralSequenceStart = 1,
  icnSettings = prepareIcnSettings(),
  icnSequenceStart = 1,
  identityOptions = {}
) {
  const mappings = loadMappings();
  let content = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(mappings)) {
    content = content.split(key).join(value);
  }

  if (listDateOverride) {
    content = content.replace(/("ListDate"\s*:\s*")([^"]+)(")/g, `$1${listDateOverride}$3`);
  }

  if (!identityOptions.randomizeSsn) validateSsn(ssnValue);
  const data = JSON.parse(content);
  let referralNumbersUsed = 0;
  if (referralReplacementCode) {
    referralNumbersUsed = applyReferralNumberOverride(data, referralReplacementCode, referralSequenceStart);
  }
  const patientIdentitiesUsed = updatePatientIdentity(data, ssnValue.trim(), icnSettings, icnSequenceStart, identityOptions);
  if (optionalOverrides && Object.keys(optionalOverrides).length > 0) {
    applyOptionalOverrides(data, optionalOverrides);
  }
  if (identityOptions.randomizeStationId) applyRandomValidStationIds(data, identityOptions);
  alignReferralAndIcnSuffixes(data, identityOptions.matchSuffixLength);
  ensureSourceVariableFieldsAreUnique(data, optionalOverrides);

  return {
    content: JSON.stringify(data, null, 4),
    referralNumbersUsed,
    patientIdentitiesUsed,
  };
}

module.exports = {
  ICN_MODES,
  ICN_TEST_PREFIX,
  ICN_TEST_SUFFIX_LENGTH,
  ICN_TOTAL_LENGTH,
  LIST_DATE_FORMAT,
  PAYMENT_AUTHORITY_CODE_LENGTH,
  PAYMENT_AUTHORITY_CODE_MAX,
  REFERRAL_NUMBER_DIGIT_COUNT,
  REFERRAL_NUMBER_PREFIX,
  STATION_ID_MAX_LENGTH,
  completeWithRandomSuffix,
  describeIcnPreview,
  extractJsonChangeDefaults,
  extractListDate,
  generatePaymentAuthorityCodeValue,
  generateOptionalFieldOverrides,
  generateRandomDob,
  generateRandomSsn,
  generateReferralNumber,
  modifyContent,
  normalizePaymentAuthorityCode,
  normalizeReferralNumberStart,
  normalizeStationId,
  prepareIcnSettings,
  validateIsoDate,
  validateIcnSettings,
  validateIsoDateTime,
  validatePaymentAuthorityCode,
  validateReferralNumberStart,
  validateSsn,
  validateStationId,
};
