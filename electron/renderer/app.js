const DATE_PARTS = [
  { key: "year", width: 4, min: 0, max: 9999 },
  { key: "month", width: 2, min: 0, max: 12 },
  { key: "day", width: 2, min: 0, max: 31 },
  { key: "hour", width: 2, min: 0, max: 23 },
  { key: "minute", width: 2, min: 0, max: 59 },
  { key: "second", width: 2, min: 0, max: 59 },
];
const PAYMENT_AUTHORITY_CODE_MAX = 99999;
const LEIE_BATCH_ID_PLACEHOLDER = "H202604150409112638";

const state = {
  info: null,
  busy: false,
  theme: "light",
  mainTab: "referral",
  subTab: "edit",
  leieDuplicateKey: "full-row",
  leieDuplicateHandling: "manual",
  leieInspection: null,
  leieInspectionError: "",
  leieScanRequestId: 0,
  leieLastScannedInput: "",
  leieSourceValid: false,
  leieOutputFileName: "",
  sourceInspection: null,
  sourceListDate: "",
  listDateTouched: false,
  optionalFieldsVisible: false,
  liveListDateTimer: null,
  uploadImportState: "idle",
  uiSettingsSaveTimer: null,
  acknowledgedReleaseKey: "",
  releaseAnnouncementOpen: false,
};

const elements = {};
const STATIC_HELPER_IDS = [
  "ssnHelp",
  "archiveNameHelp",
  "fileCountHelp",
  "referralsPerFileHelp",
  "dobHelp",
  "referralDateHelp",
  "referralDateTimeHelp",
  "referralExpirationDateHelp",
  "referralLastUpdateDateHelp",
];

function $(id) {
  return document.getElementById(id);
}

function captureStaticHelperDefaults() {
  for (const key of STATIC_HELPER_IDS) {
    const element = elements[key];
    if (element && !element.dataset.defaultText) {
      element.dataset.defaultText = element.textContent;
    }
  }
}

function setInputValidity(input, hasError) {
  if (!input) {
    return;
  }
  input.classList.toggle("is-invalid", Boolean(hasError));
  input.closest(".combo-shell")?.classList.toggle("is-invalid", Boolean(hasError));
}

function setStaticHelperState(helperElement, inputElement, message = "") {
  if (!helperElement) {
    return;
  }

  const hasError = Boolean(message);
  helperElement.classList.toggle("is-error", hasError);
  helperElement.classList.toggle("is-success", false);
  helperElement.textContent = hasError ? message : helperElement.dataset.defaultText || "";
  setInputValidity(inputElement, hasError);
}

function setPreviewHelperState(helperElement, inputElement, message = "") {
  if (!helperElement) {
    return;
  }
  const hasError = Boolean(message);
  helperElement.classList.toggle("is-error", hasError);
  helperElement.classList.toggle("is-success", false);
  if (hasError) {
    helperElement.textContent = message;
  }
  setInputValidity(inputElement, hasError);
}

function setUploadTargetStatus(row, message = "", stateName = "") {
  const statusElement = row?.querySelector(".upload-test-status");
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message || "Not tested yet.";
  statusElement.classList.toggle("is-error", stateName === "error");
  statusElement.classList.toggle("is-success", stateName === "success");
  statusElement.classList.toggle("is-working", stateName === "working");
}

function setStatus(label, message) {
  const normalizedLabel = String(label || "Idle").trim();
  elements.statusBadge.textContent = normalizedLabel;
  elements.statusMessage.textContent = message;

  const badgeClass = normalizedLabel.toLowerCase();
  elements.statusBadge.className = "status-badge";
  if (badgeClass.includes("failed")) {
    elements.statusBadge.classList.add("failed");
  } else if (badgeClass.includes("completed")) {
    elements.statusBadge.classList.add("completed");
  } else if (badgeClass.includes("working") || badgeClass.includes("processing") || badgeClass.includes("generating") || badgeClass.includes("upload")) {
    elements.statusBadge.classList.add("working");
  } else {
    elements.statusBadge.classList.add("idle");
  }
}

function setBusy(busy) {
  state.busy = busy;
  for (const element of document.querySelectorAll("button, input, select")) {
    element.disabled = busy;
  }
  if (!busy) syncIdentityControls();
}

function setReleaseAnnouncementOpen(isOpen) {
  state.releaseAnnouncementOpen = Boolean(isOpen);
  elements.releaseAnnouncementOverlay?.classList.toggle("hidden", !state.releaseAnnouncementOpen);
  document.body.classList.toggle("modal-open", state.releaseAnnouncementOpen);
}

function syncReleaseAnnouncement() {
  if (!elements.releaseAnnouncementOverlay || !elements.releaseAnnouncementList) {
    return;
  }

  const announcement = state.info?.releaseAnnouncement || null;
  const notes = Array.isArray(announcement?.notes) ? announcement.notes : [];
  elements.releaseAnnouncementTitle.textContent = announcement?.label
    ? `What's new in ${announcement.label}`
    : "What's new in this release";
  elements.releaseAnnouncementVersion.textContent = announcement?.label || "";
  elements.releaseAnnouncementList.innerHTML = "";

  for (const note of notes) {
    const item = document.createElement("li");
    item.textContent = note;
    elements.releaseAnnouncementList.appendChild(item);
  }

  const shouldOpen = Boolean(
    announcement?.releaseKey &&
      (announcement?.shouldShow === true || state.acknowledgedReleaseKey !== announcement.releaseKey)
  );
  setReleaseAnnouncementOpen(shouldOpen);
}

async function acknowledgeReleaseAnnouncement() {
  const announcement = state.info?.releaseAnnouncement;
  if (!announcement?.releaseKey) {
    setReleaseAnnouncementOpen(false);
    return;
  }

  const previousReleaseKey = state.acknowledgedReleaseKey;
  state.acknowledgedReleaseKey = announcement.releaseKey;

  try {
    await window.ccrs.acknowledgeReleaseAnnouncement(announcement.releaseKey);
    if (state.info?.releaseAnnouncement) {
      state.info.releaseAnnouncement.shouldShow = false;
    }
    setReleaseAnnouncementOpen(false);
  } catch (_error) {
    state.acknowledgedReleaseKey = previousReleaseKey;
    setStatus("Failed", "Unable to save the release acknowledgement.");
  }
}

function readValue(id) {
  return $(id).value.trim();
}

function readChecked(id) {
  return $(id).checked;
}

function sanitizeStationIdInput(value) {
  const normalized = String(value || "").trim();
  const prefixedKeyMatch = normalized.match(/^([A-Za-z0-9]{1,5})(?:\s*[-|].*)$/);
  if (prefixedKeyMatch) {
    return prefixedKeyMatch[1];
  }

  return ((normalized.match(/[A-Za-z0-9]/g) || []).join("")).slice(0, 5);
}

function isExcelPath(value) {
  return /\.(xlsx|xls|xlsm|xlsb)$/i.test(String(value || "").trim());
}

function buildLeieValidationSql(batchIdRaw = "") {
  const normalizedBatchId = String(batchIdRaw || "").trim() || LEIE_BATCH_ID_PLACEHOLDER;
  return [
    "Use ccrsdb;",
    "",
    "Select File_Name, *",
    "from CLAIM_BATCH_LOG",
    `where etl_batch_id = '${normalizedBatchId}'`,
    "order by Start_date_time desc;",
    "",
    "select count(*)",
    "from dbo.LKUP_PROVIDER_SANCTION",
    `where etl_batch_id = '${normalizedBatchId}';`,
    "",
    "Select count(*)",
    "from dbo.LKUP_PROVIDER_SANCTION",
    `where etl_batch_id <> '${normalizedBatchId}'`,
    "  and is_current = 'Y';",
    "",
    "select * from dbo.LKUP_PROVIDER_SANCTION;",
  ].join("\n");
}

function syncLeieValidationSql() {
  if (!elements.leieValidationSql || !elements.leieValidationBatchId) {
    return;
  }
  elements.leieValidationSql.value = buildLeieValidationSql(elements.leieValidationBatchId.value);
}

async function copyLeieValidationSql() {
  if (!elements.leieValidationSql) {
    return;
  }

  const sqlText = elements.leieValidationSql.value;
  let copied = false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(sqlText);
      copied = true;
    } catch (_error) {
      copied = false;
    }
  }

  if (!copied) {
    elements.leieValidationSql.focus();
    elements.leieValidationSql.select();
    copied = document.execCommand("copy");
  }

  elements.leieValidationCopyStatus.textContent = copied
    ? "SQL copied. Run it in ccrsdb for the selected environment."
    : "Unable to copy automatically. Select the SQL and copy it manually.";
  elements.leieValidationCopyStatus.classList.toggle("is-success", copied);
  elements.leieValidationCopyStatus.classList.toggle("is-error", !copied);
}

function getStationOptions() {
  return Array.isArray(state.info?.stationOptions) ? state.info.stationOptions : [];
}

function getSeocOptions() {
  return Array.isArray(state.info?.seocOptions) ? state.info.seocOptions : [];
}

function renderSeocOptions() {
  const keySelect = elements.overrideSeocKey;
  const idSelect = elements.overrideSeocId;
  if (!keySelect || !idSelect) return;
  const selectedKey = keySelect.value;
  const selectedId = idSelect.value;
  keySelect.innerHTML = '<option value="">Keep source SEOC</option>';
  idSelect.innerHTML = '<option value="">Keep source SEOC</option>';
  for (const option of getSeocOptions()) {
    keySelect.add(new Option(`${option.seocKey} — ${option.seocId}`, option.seocKey));
    idSelect.add(new Option(option.seocId, option.seocId));
  }
  keySelect.value = selectedKey;
  idSelect.value = selectedId;
}

function syncSeocPair(source) {
  const options = getSeocOptions();
  const match = source === "key"
    ? options.find((option) => option.seocKey === elements.overrideSeocKey.value)
    : options.find((option) => option.seocId === elements.overrideSeocId.value);
  elements.overrideSeocKey.value = match?.seocKey || "";
  elements.overrideSeocId.value = match?.seocId || "";
}

function syncIdentityControls() {
  $("ssn-value").disabled = readChecked("randomize-ssn");
  $("override-dob").disabled = readChecked("randomize-dob");
  elements.overrideStationId.disabled = readChecked("randomize-station-id");
  elements.stationIdToggle.disabled = readChecked("randomize-station-id");
}

function findStationOption(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  return getStationOptions().find((option) => option.stationKey === normalized) || null;
}

function renderStationOptions(options = []) {
  if (!elements.stationIdMenu) {
    return;
  }
  elements.stationIdMenu.innerHTML = "";
  const normalizedQuery = readValue("override-station-id").toLowerCase();
  const fragment = document.createDocumentFragment();
  const filteredOptions = options
    .filter((option) => {
      if (!normalizedQuery) {
        return true;
      }
      const searchTarget = `${option.stationKey} ${option.stationName}`.toLowerCase();
      return searchTarget.includes(normalizedQuery);
    });

  if (filteredOptions.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "combo-empty";
    emptyState.textContent = "No matching station found. Choose a station_key from the reference list.";
    fragment.appendChild(emptyState);
  }

  for (const option of filteredOptions) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "combo-option";
    element.title = `${option.stationKey} - ${option.stationName}`;
    element.innerHTML = `
      <span class="combo-option-title">${option.stationKey}</span>
      <span class="combo-option-copy">${option.stationName}</span>
    `;
    element.addEventListener("click", async () => {
      elements.overrideStationId.value = option.stationKey;
      setStationMenuOpen(false);
      updateStationIdMatch();
      await updatePreviews();
    });
    fragment.appendChild(element);
  }

  elements.stationIdMenu.appendChild(fragment);
}

function setStationMenuOpen(isOpen) {
  if (!elements.stationIdCombobox || !elements.stationIdMenu) {
    return;
  }

  elements.stationIdCombobox.classList.toggle("is-open", Boolean(isOpen));
  elements.stationIdMenu.classList.toggle("hidden", !isOpen);
}

function updateStationIdMatch() {
  if (!elements.stationIdMatch) {
    return;
  }

  if (readChecked("randomize-station-id")) {
    elements.stationIdMatch.classList.add("is-success");
    elements.stationIdMatch.classList.remove("is-error");
    elements.stationIdMatch.textContent = `Random selection will use only the ${getStationOptions().length.toLocaleString()} Station IDs in the reference list.`;
    return;
  }

  const stationId = readValue("override-station-id");
  if (!stationId) {
    elements.stationIdMatch.classList.remove("is-success", "is-error");
    elements.stationIdMatch.textContent = `Loaded ${getStationOptions().length.toLocaleString()} valid Station IDs. Choose an exact station_key or enable random valid IDs.`;
    return;
  }

  const match = findStationOption(stationId);
  if (match) {
    elements.stationIdMatch.classList.add("is-success");
    elements.stationIdMatch.classList.remove("is-error");
    elements.stationIdMatch.textContent = `Matched station: ${match.stationKey} | ${match.stationName}`;
    return;
  }

  elements.stationIdMatch.classList.remove("is-success");
  elements.stationIdMatch.classList.add("is-error");
  elements.stationIdMatch.textContent = "No exact reference match. Select a valid station_key from the list.";
}

function sanitizePaymentAuthorityCodeInput(value, fallbackValue = "") {
  const digitsOnly = ((String(value || "").match(/\d/g) || []).join("")).slice(0, 5);
  if (!digitsOnly) {
    return "";
  }

  if (Number(digitsOnly) > PAYMENT_AUTHORITY_CODE_MAX) {
    return fallbackValue;
  }

  return digitsOnly;
}

function getSelectedIcnMode() {
  const selected = document.querySelector('input[name="icn-mode"]:checked');
  return selected?.value || "test-dynamic";
}

function getReferralNumberBodyLimit() {
  return Number(state.info?.constants?.referralNumberDigits || 10);
}

function getIcnConstants() {
  return {
    testPrefix: state.info?.constants?.icnTestPrefix || "TEST",
    suffixLength: Number(state.info?.constants?.icnSuffixLength || 13),
    totalLength: Number(state.info?.constants?.icnTotalLength || 17),
  };
}

function sanitizeIcnInput(value, mode = getSelectedIcnMode()) {
  const { suffixLength, totalLength } = getIcnConstants();
  if (mode === "test-custom-suffix") {
    return ((String(value || "").toUpperCase().match(/[A-Z0-9]/g) || []).join("")).slice(0, suffixLength);
  }

  if (mode === "custom-full") {
    return ((String(value || "").toUpperCase().match(/[A-Z0-9]/g) || []).join("")).slice(0, totalLength);
  }

  return "";
}

function sanitizeReferralNumberInput(value) {
  const limit = getReferralNumberBodyLimit();
  let normalized = String(value || "").trim();

  if (/^VA/i.test(normalized)) {
    normalized = normalized.slice(2);
  }

  return ((normalized.match(/[A-Za-z0-9]/g) || []).join("")).slice(0, limit);
}

function sanitizeLeieFileNameInput(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/g, "");
}

function formatUploadProfileSummary(summary) {
  if (!summary || !summary.serverCount || !summary.userCount) {
    return "";
  }
  return `${summary.serverCount} server${summary.serverCount === 1 ? "" : "s"}, ${summary.userCount} user${summary.userCount === 1 ? "" : "s"}`;
}

function setValueIfEmpty(id, value) {
  if (!value || readValue(id)) {
    return;
  }
  $(id).value = value;
}

function setTheme(themeName) {
  state.theme = themeName === "dark" ? "dark" : "light";
  document.body.classList.toggle("theme-dark", state.theme === "dark");
  for (const button of document.querySelectorAll("[data-theme]")) {
    button.classList.toggle("is-active", button.dataset.theme === state.theme);
  }
}

function syncTabState() {
  for (const current of document.querySelectorAll("[data-main-tab]")) {
    current.classList.toggle("is-active", current.dataset.mainTab === state.mainTab);
  }
  for (const current of document.querySelectorAll("[data-sub-tab]")) {
    current.classList.toggle("is-active", current.dataset.subTab === state.subTab);
  }
}

function syncOptionalFieldsVisibility() {
  elements.optionalFields.classList.toggle("hidden", !state.optionalFieldsVisible);
  elements.toggleOptionalFields.textContent = state.optionalFieldsVisible ? "Hide Optional Fields" : "Show Optional Fields";
  elements.toggleOptionalFields.classList.toggle("is-active", state.optionalFieldsVisible);
}

function normalizeDigits(value, width) {
  return (String(value || "").match(/\d/g) || []).join("").slice(0, width);
}

function setDateParts(dateText) {
  const normalized = String(dateText || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  const values = match
    ? {
        year: match[1],
        month: match[2],
        day: match[3],
        hour: match[4],
        minute: match[5],
        second: match[6],
      }
    : {
        year: "0000",
        month: "00",
        day: "00",
        hour: "00",
        minute: "00",
        second: "00",
      };

  for (const part of DATE_PARTS) {
    $(`list-date-${part.key}`).value = values[part.key];
  }
}

function getListDateOverride() {
  const values = {};
  for (const part of DATE_PARTS) {
    values[part.key] = normalizeDigits(readValue(`list-date-${part.key}`), part.width).padStart(part.width, "0");
  }
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function markDateTouched() {
  state.listDateTouched = true;
}

function resumeLiveListDate(syncNow = true) {
  state.listDateTouched = false;
  if (syncNow) {
    setDateParts(nowAsListDate());
  }
}

function adjustDatePart(partKey, delta) {
  const part = DATE_PARTS.find((entry) => entry.key === partKey);
  if (!part) {
    return;
  }

  markDateTouched();
  const input = $(`list-date-${part.key}`);
  const rawValue = normalizeDigits(input.value, part.width);
  let current = Number(rawValue || part.min);
  if (Number.isNaN(current)) {
    current = part.min;
  }

  current += delta;
  if (current > part.max) {
    current = part.min;
  }
  if (current < part.min) {
    current = part.max;
  }

  input.value = String(current).padStart(part.width, "0");
}

function collectOptionalOverrides() {
  const rawValues = {
    StationID: readChecked("randomize-station-id") ? "" : readValue("override-station-id"),
    PaymentAuthorityCode: readValue("override-payment-authority-code"),
    ReferralPeriod: readValue("override-referral-period"),
    Network: readValue("override-network"),
    DOB: readChecked("randomize-dob") ? "" : readValue("override-dob"),
    SeocKey: readValue("override-seoc-key"),
    SeocID: readValue("override-seoc-id"),
    ReferralCategory: readValue("override-referral-category"),
    ReferralDate: readValue("override-referral-date"),
    ReferralDateTime: readValue("override-referral-date-time"),
    ReferralExpirationDate: readValue("override-referral-expiration-date"),
    ReferralLastUpdateDate: readValue("override-referral-last-update-date"),
    ReferralConsultId: readValue("override-referral-consult-id"),
  };

  return Object.fromEntries(
    Object.entries(rawValues).filter(([, value]) => value)
  );
}

function collectUploadSettings() {
  const enabled = readChecked("upload-enabled");
  const targets = [];

  for (const row of document.querySelectorAll(".upload-target")) {
    const useTarget = row.querySelector(".upload-enabled").checked;
    if (!useTarget) {
      continue;
    }

    targets.push({
      server_name: row.dataset.target,
      user_name: row.querySelector(".upload-user").value,
      remote_directory: row.querySelector(".upload-path").value.trim(),
    });
  }

  return { enabled, targets };
}

function collectIcnSettings() {
  return {
    mode: getSelectedIcnMode(),
    value: readValue("icn-custom-value"),
  };
}

function collectArchiveNamingOptions() {
  return {
    includeNetwork: readChecked("archive-append-network"),
    includeReferralDateTime: readChecked("archive-append-referral-date-time"),
  };
}

function sharedPayload() {
  return {
    outputDir: readValue("output-dir"),
    replacementCode: readValue("replacement-code"),
    archiveBasename: readValue("archive-basename"),
    archiveNamingOptions: collectArchiveNamingOptions(),
    referralReplacementCode: readValue("referral-code"),
    icnSettings: collectIcnSettings(),
    ssnValue: readValue("ssn-value"),
    identityOptions: {
      randomizeSsn: readChecked("randomize-ssn"),
      randomizeDob: readChecked("randomize-dob"),
      randomizeStationId: readChecked("randomize-station-id"),
      matchSuffixLength: Number(readValue("match-suffix-length")),
    },
    listDateOverride: getListDateOverride(),
    clearOutput: readChecked("clear-output"),
    keepProcessedJson: readChecked("keep-processed-json"),
    optionalOverrides: collectOptionalOverrides(),
    upload: collectUploadSettings(),
  };
}

function collectPersistedUploadTargets() {
  const uploadTargets = {};

  for (const row of document.querySelectorAll(".upload-target")) {
    const targetName = row.dataset.target;
    if (!targetName) {
      continue;
    }

    uploadTargets[targetName] = {
      enabled: row.querySelector(".upload-enabled")?.checked || false,
      userName: row.querySelector(".upload-user")?.value || "",
      remoteDirectory: row.querySelector(".upload-path")?.value.trim() || "",
    };
  }

  return uploadTargets;
}

function collectUiSettings() {
  return {
    theme: state.theme,
    mainTab: state.mainTab,
    subTab: state.subTab,
    optionalFieldsVisible: state.optionalFieldsVisible,
    acknowledgedReleaseKey: state.acknowledgedReleaseKey,
    inputDir: readValue("input-dir"),
    outputDir: readValue("output-dir"),
    replacementCode: readValue("replacement-code"),
    archiveBasename: readValue("archive-basename"),
    archiveAppendNetwork: readChecked("archive-append-network"),
    archiveAppendReferralDateTime: readChecked("archive-append-referral-date-time"),
    referralCode: readValue("referral-code"),
    ssnValue: readValue("ssn-value"),
    randomizeSsn: readChecked("randomize-ssn"),
    randomizeDob: readChecked("randomize-dob"),
    randomizeStationId: readChecked("randomize-station-id"),
    matchSuffixLength: readValue("match-suffix-length"),
    icnMode: getSelectedIcnMode(),
    icnCustomValue: readValue("icn-custom-value"),
    overrideStationId: readValue("override-station-id"),
    overridePaymentAuthorityCode: readValue("override-payment-authority-code"),
    overrideReferralPeriod: readValue("override-referral-period"),
    overrideNetwork: readValue("override-network"),
    overrideDob: readValue("override-dob"),
    overrideSeocKey: readValue("override-seoc-key"),
    overrideSeocId: readValue("override-seoc-id"),
    overrideReferralCategory: readValue("override-referral-category"),
    overrideReferralDate: readValue("override-referral-date"),
    overrideReferralDateTime: readValue("override-referral-date-time"),
    overrideReferralExpirationDate: readValue("override-referral-expiration-date"),
    overrideReferralLastUpdateDate: readValue("override-referral-last-update-date"),
    overrideReferralConsultId: readValue("override-referral-consult-id"),
    fileCount: readValue("file-count"),
    referralsPerFile: readValue("referrals-per-file"),
    clearOutput: readChecked("clear-output"),
    keepProcessedJson: readChecked("keep-processed-json"),
    uploadEnabled: readChecked("upload-enabled"),
    uploadTargets: collectPersistedUploadTargets(),
    leieDuplicateKey: state.leieDuplicateKey,
    leieDuplicateHandling: state.leieDuplicateHandling,
    leieOutputFileName: state.mainTab === "leie" ? readValue("replacement-code") : state.leieOutputFileName,
    leieValidationBatchId: readValue("leie-validation-batch-id"),
  };
}

function scheduleUiSettingsSave() {
  clearTimeout(state.uiSettingsSaveTimer);
  state.uiSettingsSaveTimer = window.setTimeout(async () => {
    try {
      await window.ccrs.saveUiSettings(collectUiSettings());
    } catch (error) {
      console.error("Unable to save UI settings.", error);
    }
  }, 180);
}

function applyUploadTargetSettings(uploadTargets = {}) {
  for (const row of document.querySelectorAll(".upload-target")) {
    const targetName = row.dataset.target;
    const targetSettings = uploadTargets[targetName];
    if (!targetSettings) {
      continue;
    }

    row.querySelector(".upload-enabled").checked = Boolean(targetSettings.enabled);
    if (targetSettings.userName && row.querySelector(".upload-user")) {
      row.querySelector(".upload-user").value = targetSettings.userName;
    }
    if (targetSettings.remoteDirectory && row.querySelector(".upload-path")) {
      row.querySelector(".upload-path").value = targetSettings.remoteDirectory;
    }
  }
}

async function applyUiSettings(settings = {}) {
  setTheme(settings.theme || "light");
  state.mainTab = ["referral", "leie", "other"].includes(settings.mainTab) ? settings.mainTab : "referral";
  state.subTab = settings.subTab === "generate" ? "generate" : "edit";
  state.leieDuplicateKey = settings.leieDuplicateKey || "full-row";
  state.leieDuplicateHandling = settings.leieDuplicateHandling === "auto-remove" ? "auto-remove" : "manual";
  state.leieOutputFileName = String(settings.leieOutputFileName || "").trim();
  if (state.mainTab !== "referral") {
    state.subTab = "edit";
  }
  syncTabState();

  state.optionalFieldsVisible = Boolean(settings.optionalFieldsVisible);
  syncOptionalFieldsVisibility();

  const valueMap = {
    "input-dir": settings.inputDir,
    "output-dir": settings.outputDir,
    "replacement-code": settings.replacementCode,
    "archive-basename": settings.archiveBasename,
    "referral-code": settings.referralCode,
    "ssn-value": settings.ssnValue,
    "icn-custom-value": settings.icnCustomValue,
    "override-station-id": settings.overrideStationId,
    "override-payment-authority-code": settings.overridePaymentAuthorityCode,
    "override-referral-period": settings.overrideReferralPeriod,
    "override-network": settings.overrideNetwork,
    "override-dob": settings.overrideDob,
    "override-seoc-key": settings.overrideSeocKey,
    "override-seoc-id": settings.overrideSeocId,
    "match-suffix-length": settings.matchSuffixLength || "5",
    "override-referral-category": settings.overrideReferralCategory,
    "override-referral-date": settings.overrideReferralDate,
    "override-referral-date-time": settings.overrideReferralDateTime,
    "override-referral-expiration-date": settings.overrideReferralExpirationDate,
    "override-referral-last-update-date": settings.overrideReferralLastUpdateDate,
    "override-referral-consult-id": settings.overrideReferralConsultId,
    "file-count": settings.fileCount,
    "referrals-per-file": settings.referralsPerFile,
    "leie-validation-batch-id": settings.leieValidationBatchId,
  };

  for (const [id, value] of Object.entries(valueMap)) {
    if ($(id) && value !== undefined && value !== null) {
      $(id).value = String(value);
    }
  }

  if (state.mainTab === "leie") {
    $("replacement-code").value = state.leieOutputFileName;
  }

  const selectedIcnMode = String(settings.icnMode || "test-dynamic").trim();
  const icnModeInput = document.querySelector(`input[name="icn-mode"][value="${selectedIcnMode}"]`);
  if (icnModeInput) {
    icnModeInput.checked = true;
  }

  $("archive-append-network").checked = Boolean(settings.archiveAppendNetwork);
  $("archive-append-referral-date-time").checked = Boolean(settings.archiveAppendReferralDateTime);
  $("clear-output").checked = Boolean(settings.clearOutput);
  $("keep-existing-files").checked = !Boolean(settings.clearOutput);
  $("keep-processed-json").checked = settings.keepProcessedJson !== false;
  $("upload-enabled").checked = Boolean(settings.uploadEnabled);
  $("randomize-ssn").checked = settings.randomizeSsn !== false;
  $("randomize-dob").checked = settings.randomizeDob !== false;
  $("randomize-station-id").checked = Boolean(settings.randomizeStationId);

  syncIcnFieldState();
  syncIdentityControls();
  syncLeieValidationSql();
  updateTemplateSummary();
  syncWorkflowText();
  $("leie-action-auto").checked = state.leieDuplicateHandling === "auto-remove";
  $("leie-action-manual").checked = state.leieDuplicateHandling !== "auto-remove";
  renderStationOptions(getStationOptions());
  applyUploadTargetSettings(settings.uploadTargets || {});
  syncUploadTargetState();

  try {
    if (readValue("input-dir")) {
      await inspectSourceFolder();
    } else {
      updatePreviews();
    }
  } catch (error) {
    console.error("Unable to inspect source while restoring settings.", error);
  }
  syncReleaseAnnouncement();
}

function setUploadReadyState(mode = "idle") {
  state.uploadImportState = mode;
  elements.uploadReadyPill.className = "pill-note";

  if (mode === "importing") {
    elements.uploadReadyPill.classList.add("is-working");
    elements.uploadReadyPill.textContent = "Importing upload config...";
    return;
  }

  if (mode === "failed") {
    elements.uploadReadyPill.classList.add("is-error");
    elements.uploadReadyPill.textContent = "Upload config import failed";
    return;
  }

  if (state.info?.profileSource?.path) {
    elements.uploadReadyPill.classList.add("is-success");
    const summaryText = formatUploadProfileSummary(state.info.uploadProfileSummary);
    elements.uploadReadyPill.textContent = summaryText
      ? `Upload profiles imported: ${summaryText}`
      : "Upload profiles imported";
    return;
  }

  elements.uploadReadyPill.textContent = "No upload config imported";
}

function getPreviewFileCount() {
  if (state.subTab === "generate") {
    return Math.max(Number(readValue("file-count") || 1), 1);
  }

  return Math.max(Number(state.sourceInspection?.fileCount || 0), 1);
}

function formatJsonPreviewList(baseName, fileCount) {
  if (!baseName) {
    return state.subTab === "generate"
      ? "Preview: generated JSON names will be used"
      : "Preview: original JSON names will be used";
  }

  if (fileCount <= 1) {
    return `Preview: ${baseName}.json`;
  }

  const visibleCount = Math.min(fileCount, 3);
  const fileNames = [];
  for (let index = 1; index <= visibleCount; index += 1) {
    fileNames.push(`${baseName}_${index}.json`);
  }

  if (fileCount > visibleCount) {
    fileNames.push(`+${fileCount - visibleCount} more`);
  }

  return `Preview: ${fileNames.join(", ")}`;
}

function renderUploadTargets(targets) {
  elements.uploadTargets.innerHTML = "";

  for (const target of targets) {
    const wrapper = document.createElement("div");
    wrapper.className = "upload-target";
    wrapper.dataset.target = target.name;

    const userOptions = (target.users || [])
      .map((user) => `<option value="${user}">${user}</option>`)
      .join("");

    wrapper.innerHTML = `
      <div class="upload-target-header">
        <div class="upload-target-copy">
          <strong>${target.name} Server: ${target.serverDisplay || "No server found yet"}</strong>
          <span class="upload-target-note">Choose the account and remote destination for ${target.name}.</span>
        </div>
        <label class="checkbox-chip">
          <input class="upload-enabled" type="checkbox" />
          <span>Upload to ${target.name}</span>
        </label>
      </div>
      <div class="form-grid two-col upload-target-grid">
        <label class="field-block">
          <span>User</span>
          <select class="upload-user">${userOptions}</select>
          <small class="helper-text upload-user-help">Choose the account for this upload target.</small>
        </label>
        <label class="field-block">
          <span>Remote Directory</span>
          <input class="upload-path" type="text" value="${target.defaultRemoteDirectory || "/CCRA_Uploads"}" />
          <small class="helper-text upload-path-help">Use the remote folder you want the .gz file uploaded to.</small>
        </label>
      </div>
      <div class="upload-target-actions">
        <button type="button" class="toolbar-button upload-test-connection">Test Connection</button>
        <span class="upload-test-status">Not tested yet.</span>
      </div>
    `;

    const userSelect = wrapper.querySelector(".upload-user");
    const pathInput = wrapper.querySelector(".upload-path");
    const enabledInput = wrapper.querySelector(".upload-enabled");
    const testButton = wrapper.querySelector(".upload-test-connection");

    userSelect.addEventListener("change", () => {
      setUploadTargetStatus(wrapper);
      updatePreviews();
      scheduleUiSettingsSave();
    });
    pathInput.addEventListener("input", () => {
      setUploadTargetStatus(wrapper);
      updatePreviews();
      scheduleUiSettingsSave();
    });
    enabledInput.addEventListener("change", () => {
      setUploadTargetStatus(wrapper);
      syncUploadTargetState();
      updatePreviews();
      scheduleUiSettingsSave();
    });
    testButton.addEventListener("click", () => testUploadTarget(wrapper));

    elements.uploadTargets.appendChild(wrapper);
  }

  syncUploadTargetState();
}

function syncUploadTargetState() {
  const uploadEnabled = Boolean(elements.uploadEnabled?.checked);

  for (const row of document.querySelectorAll(".upload-target")) {
    const targetToggle = row.querySelector(".upload-enabled");
    const userSelect = row.querySelector(".upload-user");
    const pathInput = row.querySelector(".upload-path");
    const testButton = row.querySelector(".upload-test-connection");

    if (!targetToggle) {
      continue;
    }

    targetToggle.disabled = !uploadEnabled;
    const targetActive = uploadEnabled && targetToggle.checked;

    if (userSelect) {
      userSelect.disabled = !targetActive;
    }
    if (pathInput) {
      pathInput.disabled = !targetActive;
    }
    if (testButton) {
      testButton.disabled = !targetActive;
    }
  }
}

function syncIcnFieldState() {
  const mode = getSelectedIcnMode();
  const input = elements.icnCustomValue;
  const { testPrefix, suffixLength, totalLength } = getIcnConstants();
  if (!input) {
    return;
  }

  input.disabled = mode === "test-dynamic";
  input.value = sanitizeIcnInput(input.value, mode);

  if (mode === "test-custom-suffix") {
    input.placeholder = `Enter up to ${suffixLength} letters or numbers after ${testPrefix}`;
    return;
  }

  if (mode === "custom-full") {
    input.placeholder = `Enter up to ${totalLength} letters or numbers`;
    return;
  }

  input.placeholder = `Using ${testPrefix} + generated digits`;
}

function applyGeneratorDefaults() {
  const defaults = state.info?.generatorDefaults || {};

  setValueIfEmpty("override-network", defaults.Network);
  setValueIfEmpty("override-referral-period", defaults.ReferralPeriod);
  setValueIfEmpty("override-referral-category", defaults.ReferralCategory);
  setValueIfEmpty("override-referral-date", defaults.ReferralDate);
  setValueIfEmpty("override-referral-date-time", defaults.ReferralDateTime);
  setValueIfEmpty("override-referral-expiration-date", defaults.ReferralExpirationDate);
  setValueIfEmpty("override-referral-last-update-date", defaults.ReferralLastUpdateDate);
  setValueIfEmpty("override-referral-consult-id", defaults.ReferralConsultId);
}

function applyInfo(info) {
  state.info = info;
  state.acknowledgedReleaseKey = String(
    info.releaseAnnouncement?.acknowledgedReleaseKey || state.acknowledgedReleaseKey || ""
  ).trim();
  renderStationOptions(info.stationOptions || []);
  renderSeocOptions();
  elements.appVersionBadge.textContent = info.appVersionLabel || "";
  elements.appVersionBadge.classList.toggle("hidden", !info.appVersionLabel);
  document.title = info.appVersionLabel
    ? `CCRS File Processing Framework | ${info.appVersionLabel}`
    : "CCRS File Processing Framework";
  setUploadReadyState("idle");
  state.leieOutputFileName = String(info.uiSettings?.leieOutputFileName || state.leieOutputFileName || "").trim();
  renderUploadTargets(info.uploadTargets || []);
  applyGeneratorDefaults();
  applyUploadTargetSettings(info.uiSettings?.uploadTargets || {});
  syncUploadTargetState();
  updateTemplateSummary();
  updatePreviews();
  syncReleaseAnnouncement();
}

function applySourceInspection(inspection) {
  state.sourceInspection = inspection;
  const fileCount = Number(inspection?.fileCount || 0);
  elements.sourceFileCount.textContent = fileCount
    ? `${fileCount} source JSON file${fileCount === 1 ? "" : "s"} selected.`
    : "No JSON files were found in the selected folder.";

  state.sourceListDate = inspection?.firstListDate || "";
  elements.listDateSourceValue.textContent = state.sourceListDate
    ? state.sourceListDate
    : "No source ListDate found yet.";

  const defaults = inspection?.defaults || {};
  setValueIfEmpty("override-network", defaults.Network);
  setValueIfEmpty("override-referral-period", defaults.ReferralPeriod);
  setValueIfEmpty("override-dob", defaults.DOB);
  setValueIfEmpty("override-referral-category", defaults.ReferralCategory);
  setValueIfEmpty("override-referral-date", defaults.ReferralDate);
  setValueIfEmpty("override-referral-date-time", defaults.ReferralDateTime);
  setValueIfEmpty("override-referral-expiration-date", defaults.ReferralExpirationDate);
  setValueIfEmpty("override-referral-last-update-date", defaults.ReferralLastUpdateDate);
  setValueIfEmpty("override-referral-consult-id", defaults.ReferralConsultId);

  updatePreviews();
}

function renderLeieDuplicateTable(duplicates = []) {
  elements.leieDuplicateTableBody.innerHTML = "";
  for (const duplicate of duplicates) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${duplicate.fileName}</td>
      <td>${duplicate.rowNumber}</td>
      <td>${duplicate.duplicateValue || "(blank)"}</td>
      <td>${duplicate.columnName}</td>
    `;
    elements.leieDuplicateTableBody.appendChild(row);
  }
  elements.leieDuplicateTableWrap.classList.toggle("hidden", duplicates.length === 0);
}

function hasLeieBlockingIssues() {
  if (state.mainTab !== "leie") {
    return false;
  }

  const inspection = state.leieInspection;
  if (!inspection || !inspection.fileCount) {
    return true;
  }
  if ((inspection.validationErrors || []).length > 0) {
    return true;
  }
  if (inspection.hasDuplicates && state.leieDuplicateHandling !== "auto-remove") {
    return true;
  }

  return false;
}

function setLeieResultTone(tone = "neutral") {
  const classMap = ["is-success", "is-error", "is-working"];
  elements.leieDuplicateResult.classList.remove(...classMap);
  elements.leieDuplicateSummary.classList.remove(...classMap);

  if (tone === "success") {
    elements.leieDuplicateResult.classList.add("is-success");
    elements.leieDuplicateSummary.classList.add("is-success");
    return;
  }

  if (tone === "error") {
    elements.leieDuplicateResult.classList.add("is-error");
    elements.leieDuplicateSummary.classList.add("is-error");
    return;
  }

  if (tone === "working") {
    elements.leieDuplicateResult.classList.add("is-working");
    elements.leieDuplicateSummary.classList.add("is-working");
  }
}

function syncLeieUiState() {
  if (state.mainTab !== "leie") {
    return;
  }

  const inspection = state.leieInspection;
  const inspectionError = String(state.leieInspectionError || "").trim();
  const duplicates = inspection?.duplicates || [];
  const validationErrors = inspection?.validationErrors || [];
  const hasDuplicates = Boolean(inspection?.hasDuplicates);
  const hasBlockingIssues = hasLeieBlockingIssues();

  elements.leieDuplicateActions.classList.toggle("hidden", !hasDuplicates);
  elements.outputCard.classList.toggle("is-disabled", hasBlockingIssues);
  elements.runProcess.disabled = hasBlockingIssues;

  if (inspectionError) {
    setLeieResultTone("error");
    elements.leieDuplicateResult.value = "LEIE scan failed";
    elements.leieDuplicateSummary.textContent = inspectionError;
  } else if (!inspection || !inspection.fileCount) {
    setLeieResultTone("neutral");
    elements.leieDuplicateResult.value = "No LEIE source folder selected.";
    elements.leieDuplicateSummary.textContent = "Pick a source file and click Rescan to run duplicate detection.";
  } else if (validationErrors.length > 0) {
    setLeieResultTone("error");
    elements.leieDuplicateResult.value = `${validationErrors.length} file validation issue${validationErrors.length === 1 ? "" : "s"} found`;
    elements.leieDuplicateSummary.textContent = "Please fix the file issues and run Rescan.";
  } else if (hasDuplicates) {
    setLeieResultTone("error");
    elements.leieDuplicateResult.value = `${duplicates.length} duplicate row${duplicates.length === 1 ? "" : "s"} found`;
    elements.leieDuplicateSummary.textContent = "Exact full-row duplicates were detected. Review rows in the table below.";
  } else {
    setLeieResultTone("success");
    elements.leieDuplicateResult.value = "No duplicate rows found";
    elements.leieDuplicateSummary.textContent = "Scan complete. Every row is unique across all columns.";
  }

  renderLeieDuplicateTable(duplicates);
}

async function inspectLeieSourceFolder(options = {}) {
  const force = Boolean(options.force);
  const inputDir = readValue("input-dir");
  if (!inputDir) {
    state.leieInspection = null;
    state.leieInspectionError = "";
    state.leieLastScannedInput = "";
    elements.sourceFileCount.textContent = "No LEIE source file or folder selected.";
    elements.listDateSourceValue.textContent = "Select an Excel file or folder to scan for LEIE data.";
    syncLeieUiState();
    updatePreviews();
    return;
  }
  if (!force && inputDir === state.leieLastScannedInput) {
    return;
  }

  const requestId = state.leieScanRequestId + 1;
  state.leieScanRequestId = requestId;

  state.leieInspectionError = "";
  // Reflect user selection immediately so the UI never looks stale while inspection runs.
  elements.sourceFileCount.textContent = "Scanning selected LEIE source...";
  elements.listDateSourceValue.textContent = inputDir;
  setLeieResultTone("working");
  elements.leieDuplicateResult.value = "Scanning duplicate rows...";
  elements.leieDuplicateSummary.textContent = "Running full-row duplicate scan...";

  try {
    const inspection = await window.ccrs.inspectLeieSource(inputDir, "full-row");
    if (requestId !== state.leieScanRequestId) {
      return;
    }
    state.leieInspection = inspection;
    state.leieInspectionError = "";
    state.leieLastScannedInput = inputDir;
    state.leieOutputFileName = state.leieOutputFileName || inspection.outputNameSuggestion || "";
    if (!readValue("replacement-code")) {
      elements.replacementCode.value = state.leieOutputFileName;
    }

    elements.sourceFileCount.textContent = inspection.fileCount
      ? `${inspection.fileCount} source Excel file${inspection.fileCount === 1 ? "" : "s"} selected.`
      : "No Excel files were found in the selected source path.";
    if (inspection.excelFiles?.length) {
      const names = inspection.excelFiles.slice(0, 3).map((file) => file.name).join(", ");
      const more = inspection.excelFiles.length > 3 ? ` +${inspection.excelFiles.length - 3} more` : "";
      elements.listDateSourceValue.textContent = `Detected Excel files: ${names}${more}`;
    } else {
      elements.listDateSourceValue.textContent = "No Excel files detected yet.";
    }

    if (inspection.validationErrors.length > 0) {
      const firstValidationError = inspection.validationErrors[0];
      setStatus("Failed", `${firstValidationError.fileName}: ${firstValidationError.message}`);
    } else if (inspection.hasDuplicates) {
      setStatus("Duplicates Found", "Resolve duplicates before saving the processed LEIE file.");
    } else if (inspection.fileCount > 0) {
      setStatus("File Loaded", "LEIE source files loaded and ready for processing.");
    }
  } catch (error) {
    if (requestId !== state.leieScanRequestId) {
      return;
    }
    state.leieInspection = null;
    state.leieInspectionError = error.message || "Unknown error while scanning LEIE source.";
    state.leieLastScannedInput = "";
    elements.sourceFileCount.textContent = "Unable to scan selected LEIE source.";
    elements.listDateSourceValue.textContent = inputDir;
    setStatus("Failed", error.message);
  }

  syncLeieUiState();
  updatePreviews();
}

async function inspectSourceFolder() {
  if (state.mainTab === "leie" || isExcelPath(readValue("input-dir"))) {
    await inspectLeieSourceFolder();
    return;
  }

  const inputDir = readValue("input-dir");
  if (!inputDir) {
    state.sourceInspection = null;
    state.sourceListDate = "";
    elements.sourceFileCount.textContent = "No source folder selected.";
    elements.listDateSourceValue.textContent = "Default ListDate will appear after you choose a source folder.";
    if (!state.listDateTouched) {
      setDateParts("0000-00-00 00:00:00");
    }
    updatePreviews();
    return;
  }

  try {
    const inspection = await window.ccrs.inspectSource(inputDir);
    applySourceInspection(inspection);
  } catch (error) {
    setStatus("Failed", error.message);
  }
}

function applyFieldErrors(fieldErrors = {}) {
  setStaticHelperState(elements.ssnHelp, $("ssn-value"), fieldErrors.ssnValue);
  setStaticHelperState(elements.archiveNameHelp, $("archive-basename"), fieldErrors.archiveBasename);
  setStaticHelperState(elements.fileCountHelp, $("file-count"), fieldErrors.fileCount);
  setStaticHelperState(elements.referralsPerFileHelp, $("referrals-per-file"), fieldErrors.referralsPerFile);
  setStaticHelperState(elements.dobHelp, $("override-dob"), fieldErrors.DOB);
  setStaticHelperState(elements.referralDateHelp, $("override-referral-date"), fieldErrors.ReferralDate);
  setStaticHelperState(elements.referralDateTimeHelp, $("override-referral-date-time"), fieldErrors.ReferralDateTime);
  setStaticHelperState(
    elements.referralExpirationDateHelp,
    $("override-referral-expiration-date"),
    fieldErrors.ReferralExpirationDate
  );
  setStaticHelperState(
    elements.referralLastUpdateDateHelp,
    $("override-referral-last-update-date"),
    fieldErrors.ReferralLastUpdateDate
  );
  setPreviewHelperState(elements.referralPreview, $("referral-code"), fieldErrors.referralReplacementCode);
  setPreviewHelperState(elements.icnPreview, $("icn-custom-value"), fieldErrors.icnValue);
  setPreviewHelperState(elements.stationIdPreview, $("override-station-id"), fieldErrors.StationID);
  setPreviewHelperState(
    elements.paymentAuthorityCodePreview,
    $("override-payment-authority-code"),
    fieldErrors.PaymentAuthorityCode
  );

  for (const row of document.querySelectorAll(".upload-target")) {
    const serverName = row.dataset.target || "target";
    const userError = fieldErrors[`upload:${serverName}:user_name`] || "";
    const pathError = fieldErrors[`upload:${serverName}:remote_directory`] || "";
    const userHelp = row.querySelector(".upload-user-help");
    const pathHelp = row.querySelector(".upload-path-help");
    const userInput = row.querySelector(".upload-user");
    const pathInput = row.querySelector(".upload-path");

    if (userHelp && !userHelp.dataset.defaultText) {
      userHelp.dataset.defaultText = userHelp.textContent;
    }
    if (pathHelp && !pathHelp.dataset.defaultText) {
      pathHelp.dataset.defaultText = pathHelp.textContent;
    }

    setStaticHelperState(userHelp, userInput, userError);
    setStaticHelperState(pathHelp, pathInput, pathError);
  }
}

async function testUploadTarget(row) {
  const serverName = row.dataset.target;
  const userName = row.querySelector(".upload-user").value;
  const remoteDirectory = row.querySelector(".upload-path").value.trim();
  const button = row.querySelector(".upload-test-connection");

  button.disabled = true;
  setUploadTargetStatus(row, "Testing connection...", "working");
  setStatus("Working", `Testing upload connection for ${serverName}...`);

  try {
    const result = await window.ccrs.testUploadTarget({
      server_name: serverName,
      user_name: userName,
      remote_directory: remoteDirectory,
    });
    setUploadTargetStatus(row, result.message, "success");
    setStatus("Completed", result.message);
  } catch (error) {
    setUploadTargetStatus(row, error.message, "error");
    setStatus("Failed", error.message);
  } finally {
    button.disabled = false;
  }
}

async function updatePreviews() {
  if (!state.info) {
    return null;
  }

  if (state.mainTab === "leie") {
    const outputBaseName = sanitizeLeieFileNameInput(readValue("replacement-code"));
    if (readValue("replacement-code") !== outputBaseName) {
      elements.replacementCode.value = outputBaseName;
    }
    state.leieOutputFileName = outputBaseName;
    elements.outputJsonPreview.textContent = outputBaseName
      ? `Preview: ${outputBaseName}.xlsx`
      : "Preview: original source file name will be used with .xlsx";
    elements.archivePreview.textContent = "Preview: not used for LEIE";
    return { fieldErrors: {} };
  }

  try {
    const preview = await window.ccrs.getPreview({
      replacementCode: readValue("replacement-code"),
      archiveBasename: readValue("archive-basename"),
      archiveNamingOptions: collectArchiveNamingOptions(),
      referralReplacementCode: readValue("referral-code"),
      icnSettings: collectIcnSettings(),
      ssnValue: readValue("ssn-value"),
      identityOptions: {
        randomizeSsn: readChecked("randomize-ssn"),
        randomizeDob: readChecked("randomize-dob"),
        randomizeStationId: readChecked("randomize-station-id"),
        matchSuffixLength: Number(readValue("match-suffix-length")),
      },
      optionalOverrides: collectOptionalOverrides(),
      fileCount: Number(readValue("file-count") || 0),
      referralsPerFile: Number(readValue("referrals-per-file") || 0),
      upload: collectUploadSettings(),
    });

    elements.outputJsonPreview.textContent = formatJsonPreviewList(
      preview.replacementCode,
      getPreviewFileCount()
    );
    elements.archivePreview.textContent = `Preview: ${preview.archiveBasename}.gz`;
    elements.referralPreview.textContent = preview.referralNumber
      ? `Preview: ${preview.referralNumber}`
      : "Preview: default referral numbers from source files";
    elements.icnPreview.textContent = preview.icnPreview || "Preview: TEST + 13 generated digits";
    elements.stationIdPreview.textContent = preview.optionalOverrides.StationID
      ? `Preview: ${preview.optionalOverrides.StationID}`
      : "Preview: no Station ID override";
    updateStationIdMatch();
    elements.paymentAuthorityCodePreview.textContent = preview.optionalOverrides.PaymentAuthorityCode
      ? `Preview: ${preview.optionalOverrides.PaymentAuthorityCode}`
      : "Preview: no Payment Authority Code override";
    applyFieldErrors(preview.fieldErrors || {});
    return preview;
  } catch (error) {
    updateStationIdMatch();
    elements.referralPreview.textContent = error.message;
    elements.referralPreview.classList.add("is-error");
    return null;
  }
}

async function validateCurrentForm() {
  if (state.mainTab === "leie") {
    if (hasLeieBlockingIssues()) {
      setStatus("Failed", "Resolve LEIE duplicate or validation issues before saving.");
      return false;
    }
    return true;
  }

  const preview = await updatePreviews();
  const fieldErrors = preview?.fieldErrors || {};
  if (Object.keys(fieldErrors).length > 0) {
    setStatus("Failed", "Please fix the highlighted fields before running.");
    return false;
  }
  return true;
}

function updateTemplateSummary() {
  const fileCount = Math.max(Number(readValue("file-count") || 1), 1);
  const referralsPerFile = Math.max(Number(readValue("referrals-per-file") || 1), 1);
  const totalReferrals = fileCount * referralsPerFile;
  const fileLabel = `${fileCount} JSON file${fileCount === 1 ? "" : "s"}`;
  const referralLabel = `${referralsPerFile} referral${referralsPerFile === 1 ? "" : "s"} per file`;
  const totalLabel = `${totalReferrals} total referral${totalReferrals === 1 ? "" : "s"}`;
  elements.templateSummaryPill.textContent = `Generation setup: ${fileLabel} | ${referralLabel} | ${totalLabel}`;
  elements.generatorFileCountDisplay.textContent = String(fileCount);
  elements.generatorReferralsPerFileDisplay.textContent = String(referralsPerFile);
  elements.generatorTotalReferralsDisplay.textContent = String(totalReferrals);
}

function updateLiveListDate() {
  if (state.listDateTouched) {
    return;
  }
  setDateParts(nowAsListDate());
}

function startLiveListDateClock() {
  if (state.liveListDateTimer) {
    clearInterval(state.liveListDateTimer);
  }
  updateLiveListDate();
  state.liveListDateTimer = setInterval(updateLiveListDate, 1000);
}

function syncWorkflowText() {
  const isReferral = state.mainTab === "referral";
  const isLeie = state.mainTab === "leie";
  const isGenerate = state.subTab === "generate" && isReferral;
  const isOther = state.mainTab === "other";

  elements.heroTitle.textContent = "CCRS File Processing";
  elements.heroSubtitle.textContent = "Use the tabs below to work with referral files and related CCRS processing workflows.";
  elements.mainTabCopy.textContent = isReferral
    ? "Choose source files, apply targeted JSON updates, and export clean output in one pass."
    : isLeie
      ? "Process LEIE Excel files, detect duplicates, save clean output, and upload."
    : "Future CCRS file types will appear here.";
  elements.workflowTitle.textContent = isGenerate
    ? "CCRS Referral Generation"
    : isReferral
      ? "CCRS Referral Processing"
      : isLeie
        ? "LEIE Data Processing"
        : "Other CCRS File Processing";
  elements.workflowSubtitle.textContent = isGenerate
    ? "Create fresh referral JSON files, then process and package them."
    : isReferral
      ? "Choose source files, apply targeted JSON updates, and export clean output in one pass."
      : isLeie
        ? "Choose an Excel file or folder, scan for duplicate rows, and resolve duplicates before saving."
        : "This area is reserved for future CCRS workflow implementations.";
  elements.sourceTitle.textContent = isGenerate ? "Template Output" : "Source";
  elements.sourceSubtitle.textContent = isGenerate
    ? "Generator mode creates fresh files directly, so no source folder is required."
    : isLeie
      ? "Pick an incoming LEIE Excel file or a folder containing LEIE Excel files."
      : "Pick the folder that contains the incoming JSON files.";
  elements.outputSubtitle.textContent = isGenerate
    ? "Choose where the generated referral JSON files should be saved and how the final output should be kept."
    : isLeie
      ? "Choose where the processed LEIE Excel file should be saved."
      : "Choose where the processed JSON files should be saved and how the final output should be kept.";
  elements.outputNameLabel.textContent = isLeie
    ? "Output File Name"
    : "Name for the processed JSON files";
  elements.outputNameHelp.textContent = isLeie
    ? "Leave blank to keep original .xlsx file names. Do not include extension; the app saves as .xlsx automatically."
    : "Leave blank to keep original JSON names.";
  elements.outputJsonPreview.classList.toggle("hidden", false);
  elements.inputDir.placeholder = isLeie
    ? "Choose a LEIE Excel file (.xlsx, .xls, .xlsm, .xlsb) or a source folder"
    : "Choose the folder that contains source JSON files";
  elements.outputDir.placeholder = isLeie
    ? "Choose where processed .xlsx files should be written"
    : "Choose where JSON and .gz files should be written";
  elements.uploadSubtitle.textContent = "Optionally upload the final .gz file to one or more saved environment profiles.";
  elements.uploadEnabledLabel.textContent = "Upload the .gz file after processing";

  elements.subtabRow.classList.toggle("hidden", !isReferral);
  elements.generatorCard.classList.toggle("hidden", !isGenerate);
  elements.workflowCard.classList.toggle("hidden", isOther);
  elements.futureCard.classList.toggle("hidden", !isOther);
  elements.sourceCard.classList.toggle("hidden", isGenerate || isOther);
  elements.referralDetailsCard.classList.toggle("hidden", isOther || isLeie);
  elements.leieDuplicateCard.classList.toggle("hidden", !isLeie);
  elements.outputCard.classList.toggle("hidden", isOther);
  elements.archiveNamingCard?.classList.toggle("hidden", isLeie);
  elements.outputRetentionCard?.classList.toggle("hidden", isLeie);
  elements.uploadCard.classList.toggle("hidden", isOther);
  elements.runCard.classList.toggle("hidden", isOther);
  elements.runProcess.classList.toggle("hidden", isGenerate || isOther);
  elements.runGenerate.classList.toggle("hidden", !isGenerate || isOther);
  elements.templateSummaryPill.classList.toggle("hidden", !isGenerate || isOther);
  elements.runProcess.textContent = isLeie ? "Save Processed File" : "Run Processing";
  elements.leieGuideBanner?.classList.toggle("hidden", !isLeie);
  elements.leieUploadValidationCard?.classList.toggle("hidden", !isLeie);

  if (isGenerate) {
    applyGeneratorDefaults();
  }

  if (isLeie) {
    elements.replacementCode.placeholder = "Leave blank to keep original .xlsx file names";
    elements.replacementCode.value = state.leieOutputFileName || elements.replacementCode.value;
    state.sourceInspection = null;
    state.sourceListDate = "";
  } else {
    elements.replacementCode.placeholder = "Leave blank to keep original JSON names";
  }

  syncLeieUiState();
  syncLeieValidationSql();
  updatePreviews();
}

function setupTabs() {
  for (const button of document.querySelectorAll("[data-main-tab]")) {
    button.addEventListener("click", () => {
      state.mainTab = button.dataset.mainTab;
      if (state.mainTab !== "referral") {
        state.subTab = "edit";
      }
      syncTabState();
      syncWorkflowText();
      inspectSourceFolder();
      scheduleUiSettingsSave();
    });
  }

  for (const button of document.querySelectorAll("[data-sub-tab]")) {
    button.addEventListener("click", () => {
      state.subTab = button.dataset.subTab;
      syncTabState();
      syncWorkflowText();
      scheduleUiSettingsSave();
    });
  }
}

function toggleOptionalFields() {
  state.optionalFieldsVisible = !state.optionalFieldsVisible;
  syncOptionalFieldsVisibility();
}

function wireDateControls() {
  for (const field of document.querySelectorAll(".date-field")) {
    const partKey = field.dataset.datePart;
    const input = field.querySelector("input");
    input.addEventListener("input", () => {
      markDateTouched();
      const part = DATE_PARTS.find((entry) => entry.key === partKey);
      input.value = normalizeDigits(input.value, part.width);
    });
    input.addEventListener("blur", () => {
      const part = DATE_PARTS.find((entry) => entry.key === partKey);
      let value = Number(normalizeDigits(input.value, part.width) || part.min);
      if (Number.isNaN(value) || value < part.min) {
        value = part.min;
      }
      if (value > part.max) {
        value = part.max;
      }
      input.value = String(value).padStart(part.width, "0");
    });
    for (const stepButton of field.querySelectorAll(".date-step")) {
      stepButton.addEventListener("click", () => {
        adjustDatePart(partKey, Number(stepButton.dataset.step));
      });
    }
  }
}

async function refreshInfo() {
  const info = await window.ccrs.getInfo();
  applyInfo(info);
  updatePreviews();
}

async function pickDirectory(targetId) {
  let selected = "";
  if (targetId === "input-dir" && state.mainTab === "leie") {
    selected = await window.ccrs.pickFile([
      { name: "Excel Files", extensions: ["xlsx", "xls", "xlsm", "xlsb"] },
      { name: "All Files", extensions: ["*"] },
    ]);
  } else {
    selected = await window.ccrs.pickDirectory();
  }
  if (!selected) {
    return;
  }

  $(targetId).value = selected;
  if (targetId === "input-dir") {
    if (state.mainTab === "leie") {
      state.leieInspection = null;
      state.leieLastScannedInput = "";
    }
    if (state.mainTab === "leie" || isExcelPath(selected)) {
      await inspectLeieSourceFolder({ force: true });
    } else {
      await inspectSourceFolder();
    }
  }
  scheduleUiSettingsSave();
}

async function importUploadSource() {
  const sourcePath = await window.ccrs.pickFile([{ name: "Upload Config", extensions: ["ini", "json"] }]);
  if (!sourcePath) {
    return;
  }

  setBusy(true);
  setUploadReadyState("importing");
  setStatus("Importing", "Reading upload configuration...");

  try {
    const result = await window.ccrs.importUploadSource(sourcePath);
    applyInfo(result.info);
    setUploadReadyState("ready");
    const summaryText = formatUploadProfileSummary(result.importResult?.profile_summary || result.info?.uploadProfileSummary);
    setStatus(
      "Idle",
      summaryText
        ? `Upload configuration imported successfully. ${summaryText} ready for use.`
        : "Upload configuration imported successfully."
    );
  } catch (error) {
    setUploadReadyState("failed");
    setStatus("Failed", error.message);
  } finally {
    setBusy(false);
  }
}

async function runProcess() {
  if (state.mainTab === "leie") {
    await runLeieProcess();
    return;
  }

  if (!(await validateCurrentForm())) {
    return;
  }
  if (!state.listDateTouched) {
    setDateParts(nowAsListDate());
  }
  await runJob("process", { ...sharedPayload(), inputDir: readValue("input-dir") }, "Processing");
}

async function runLeieProcess() {
  if (!(await validateCurrentForm())) {
    return;
  }

  const payload = {
    inputDir: readValue("input-dir"),
    outputDir: readValue("output-dir"),
    outputFileName: sanitizeLeieFileNameInput(readValue("replacement-code")),
    duplicateKey: "full-row",
    duplicateHandling: state.leieDuplicateHandling,
    upload: collectUploadSettings(),
  };

  setBusy(true);
  setStatus("Processing", "Processing LEIE files and preparing output...");
  try {
    const result = await window.ccrs.runJob("process-leie", payload);
    if (payload.upload.enabled && payload.upload.targets.length > 0) {
      setStatus("Upload Complete", result.message || "LEIE upload completed.");
    } else {
      setStatus("Ready to Save", result.message || "LEIE file saved.");
    }
  } catch (error) {
    setStatus("Failed", error.message);
  } finally {
    setBusy(false);
  }
}

function nowAsListDate() {
  const now = new Date();
  const parts = [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return `${parts[0]}-${parts[1]}-${parts[2]} ${parts[3]}:${parts[4]}:${parts[5]}`;
}

async function runGenerate() {
  if (!(await validateCurrentForm())) {
    return;
  }
  if (!state.listDateTouched) {
    setDateParts(nowAsListDate());
  }
  const payload = {
    ...sharedPayload(),
    fileCount: Number(readValue("file-count")),
    referralsPerFile: Number(readValue("referrals-per-file")),
  };
  await runJob("generate", payload, "Generating");
}

async function runJob(command, payload, label) {
  setBusy(true);
  setStatus(label, `${label} files with the standalone JavaScript backend...`);

  try {
    const result = await window.ccrs.runJob(command, payload);
    setStatus("Completed", result.message || `${label} completed.`);
  } catch (error) {
    setStatus("Failed", error.message);
  } finally {
    setBusy(false);
    resumeLiveListDate(true);
  }
}

function setupEventHandlers() {
  setupTabs();
  wireDateControls();

  for (const button of document.querySelectorAll("[data-theme]")) {
    button.addEventListener("click", () => {
      setTheme(button.dataset.theme);
      scheduleUiSettingsSave();
    });
  }

  for (const button of document.querySelectorAll("[data-pick]")) {
    button.addEventListener("click", () => pickDirectory(button.dataset.pick));
  }

  for (const id of [
    "output-dir",
    "replacement-code",
    "archive-basename",
    "archive-append-network",
    "archive-append-referral-date-time",
    "referral-code",
    "icn-custom-value",
    "ssn-value",
    "match-suffix-length",
    "override-station-id",
    "override-payment-authority-code",
    "override-referral-period",
    "override-network",
    "override-dob",
    "override-seoc-key",
    "override-seoc-id",
    "override-referral-category",
    "override-referral-date",
    "override-referral-date-time",
    "override-referral-expiration-date",
    "override-referral-last-update-date",
    "override-referral-consult-id",
    "file-count",
    "referrals-per-file",
  ]) {
    $(id).addEventListener("input", () => {
      if (id === "replacement-code" && state.mainTab === "leie") {
        $(id).value = sanitizeLeieFileNameInput($(id).value);
      }
      if (id === "referral-code") {
        $(id).value = sanitizeReferralNumberInput($(id).value);
      }
      if (id === "icn-custom-value") {
        $(id).value = sanitizeIcnInput($(id).value);
      }
      if (id === "override-station-id") {
        $(id).value = sanitizeStationIdInput($(id).value);
        renderStationOptions(getStationOptions());
        setStationMenuOpen(true);
      }
      if (id === "override-payment-authority-code") {
        const input = $(id);
        input.value = sanitizePaymentAuthorityCodeInput(input.value, input.dataset.lastValidValue || "");
        input.dataset.lastValidValue = input.value;
      }
      if (id === "file-count" || id === "referrals-per-file") {
        updateTemplateSummary();
      }
      updatePreviews();
      scheduleUiSettingsSave();
    });
  }

  elements.leieActionAuto.addEventListener("change", () => {
    if (elements.leieActionAuto.checked) {
      state.leieDuplicateHandling = "auto-remove";
      syncLeieUiState();
      scheduleUiSettingsSave();
    }
  });
  elements.leieActionManual.addEventListener("change", () => {
    if (elements.leieActionManual.checked) {
      state.leieDuplicateHandling = "manual";
      syncLeieUiState();
      scheduleUiSettingsSave();
    }
  });
  elements.leieRescan.addEventListener("click", async () => {
    await inspectLeieSourceFolder({ force: true });
    scheduleUiSettingsSave();
  });
  elements.leieCancelProcess.addEventListener("click", () => {
    $("input-dir").value = "";
    state.leieInspection = null;
    syncLeieUiState();
    inspectSourceFolder();
    scheduleUiSettingsSave();
  });

  elements.overrideStationId.addEventListener("focus", () => {
    renderStationOptions(getStationOptions());
    setStationMenuOpen(true);
  });
  elements.overrideStationId.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setStationMenuOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      renderStationOptions(getStationOptions());
      setStationMenuOpen(true);
    }
  });
  elements.overrideStationId.addEventListener("blur", () => {
    window.setTimeout(() => setStationMenuOpen(false), 120);
  });
  elements.stationIdToggle.addEventListener("click", () => {
    renderStationOptions(getStationOptions());
    setStationMenuOpen(!elements.stationIdCombobox.classList.contains("is-open"));
    elements.overrideStationId.focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!elements.stationIdCombobox.contains(event.target)) {
      setStationMenuOpen(false);
    }
  });

  elements.overrideNetwork.addEventListener("change", () => {
    updatePreviews();
    scheduleUiSettingsSave();
  });
  for (const id of ["randomize-ssn", "randomize-dob", "randomize-station-id"]) {
    $(id).addEventListener("change", () => {
      syncIdentityControls();
      updateStationIdMatch();
      updatePreviews();
      scheduleUiSettingsSave();
    });
  }
  elements.overrideSeocKey.addEventListener("change", () => {
    syncSeocPair("key");
    updatePreviews();
    scheduleUiSettingsSave();
  });
  elements.overrideSeocId.addEventListener("change", () => {
    syncSeocPair("id");
    updatePreviews();
    scheduleUiSettingsSave();
  });
  for (const input of document.querySelectorAll('input[name="icn-mode"]')) {
    input.addEventListener("change", () => {
      syncIcnFieldState();
      updatePreviews();
      scheduleUiSettingsSave();
    });
  }
  elements.uploadEnabled.addEventListener("change", () => {
    syncUploadTargetState();
    updatePreviews();
    scheduleUiSettingsSave();
  });

  elements.inputDir.addEventListener("change", async () => {
    if (state.mainTab === "leie") {
      state.leieInspection = null;
      state.leieLastScannedInput = "";
    }
    if (state.mainTab === "leie" || isExcelPath(readValue("input-dir"))) {
      await inspectLeieSourceFolder();
    } else {
      await inspectSourceFolder();
    }
    scheduleUiSettingsSave();
  });
  elements.toggleOptionalFields.addEventListener("click", () => {
    toggleOptionalFields();
    scheduleUiSettingsSave();
  });
  elements.clearOutput.addEventListener("change", scheduleUiSettingsSave);
  elements.keepExistingFiles.addEventListener("change", scheduleUiSettingsSave);
  elements.keepProcessedJson.addEventListener("change", scheduleUiSettingsSave);
  elements.runProcess.addEventListener("click", runProcess);
  elements.runGenerate.addEventListener("click", runGenerate);
  elements.importUploadSource.addEventListener("click", importUploadSource);
  elements.openUserGuide.addEventListener("click", () => {
    if (state.info?.docs?.userGuidePath) {
      window.ccrs.openPath(state.info.docs.userGuidePath);
    }
  });
  elements.openLeieValidationGuide?.addEventListener("click", () => {
    if (state.info?.docs?.leieValidationGuidePath) {
      window.ccrs.openPath(state.info.docs.leieValidationGuidePath);
    }
  });
  elements.leieValidationBatchId?.addEventListener("input", () => {
    syncLeieValidationSql();
    scheduleUiSettingsSave();
  });
  elements.copyLeieValidationSql?.addEventListener("click", copyLeieValidationSql);
  elements.releaseAnnouncementAccept.addEventListener("click", acknowledgeReleaseAnnouncement);
  elements.releaseAnnouncementPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("click", async (event) => {
    const target = event.target?.closest?.("a.external-link");
    if (!target) {
      return;
    }
    event.preventDefault();
    const href = String(target.getAttribute("href") || "").trim();
    if (!href) {
      return;
    }

    if (typeof window.ccrs.openExternal === "function") {
      await window.ccrs.openExternal(href);
      return;
    }

    window.open(href, "_blank", "noopener");
  });

  window.ccrs.onBackendEvent((event) => {
    if (event.type !== "progress") {
      return;
    }

    if (event.state === "file-loaded") {
      setStatus("File Loaded", "LEIE source file loaded.");
      return;
    }

    if (event.state === "duplicates-found") {
      setStatus("Duplicates Found", "Duplicates detected. Choose how to resolve them.");
      return;
    }

    if (event.state === "ready-to-save") {
      setStatus("Ready to Save", "Processed LEIE file is ready.");
      return;
    }

    if (event.state === "upload-complete") {
      setStatus("Upload Complete", "LEIE upload completed.");
      return;
    }

    if (event.state === "uploading") {
      const targetText = event.uploadTarget ? ` to ${event.uploadTarget}` : "";
      setStatus("Uploading", `Uploading ${event.filename}${targetText}...`);
      return;
    }

    if (event.state === "error") {
      setStatus("Failed", `Error while handling ${event.filename}.`);
      return;
    }

    setStatus("Working", `Handling ${event.filename} (${event.current}/${event.total})`);
  });
}

function cacheElements() {
  Object.assign(elements, {
    appVersionBadge: $("app-version-badge"),
    archivePreview: $("archive-preview"),
    archiveNameHelp: $("archive-name-help"),
    clearOutput: $("clear-output"),
    generatorCard: $("generator-card"),
    generatorFileCountDisplay: $("generator-file-count-display"),
    generatorReferralsPerFileDisplay: $("generator-referrals-per-file-display"),
    generatorTotalReferralsDisplay: $("generator-total-referrals-display"),
    fileCount: $("file-count"),
    futureCard: $("future-card"),
    heroSubtitle: $("hero-subtitle"),
    heroTitle: $("hero-title"),
    importUploadSource: $("import-upload-source"),
    inputDir: $("input-dir"),
    icnCustomValue: $("icn-custom-value"),
    icnPreview: $("icn-preview"),
    keepExistingFiles: $("keep-existing-files"),
    keepProcessedJson: $("keep-processed-json"),
    listDateSourceValue: $("list-date-source-value"),
    mainTabCopy: $("main-tab-copy"),
    openUserGuide: $("open-user-guide"),
    optionalFields: $("optional-fields"),
    outputJsonPreview: $("output-json-preview"),
    outputNameHelp: $("output-name-help"),
    outputNameLabel: $("output-name-label"),
    replacementCode: $("replacement-code"),
    outputDir: $("output-dir"),
    outputSubtitle: $("output-subtitle"),
    overrideDob: $("override-dob"),
    overrideSeocKey: $("override-seoc-key"),
    overrideSeocId: $("override-seoc-id"),
    overrideNetwork: $("override-network"),
    overrideReferralCategory: $("override-referral-category"),
    overrideReferralConsultId: $("override-referral-consult-id"),
    overrideReferralDate: $("override-referral-date"),
    overrideReferralDateTime: $("override-referral-date-time"),
    overrideReferralExpirationDate: $("override-referral-expiration-date"),
    overrideReferralLastUpdateDate: $("override-referral-last-update-date"),
    overrideReferralPeriod: $("override-referral-period"),
    overrideStationId: $("override-station-id"),
    ssnHelp: $("ssn-help"),
    fileCountHelp: $("file-count-help"),
    referralsPerFileHelp: $("referrals-per-file-help"),
    dobHelp: $("dob-help"),
    referralDateHelp: $("referral-date-help"),
    referralDateTimeHelp: $("referral-date-time-help"),
    referralExpirationDateHelp: $("referral-expiration-date-help"),
    referralLastUpdateDateHelp: $("referral-last-update-date-help"),
    paymentAuthorityCodePreview: $("payment-authority-code-preview"),
    referralCode: $("referral-code"),
    referralPreview: $("referral-preview"),
    referralDetailsCard: $("referral-details-card"),
    referralsPerFile: $("referrals-per-file"),
    runCard: $("run-card"),
    runGenerate: $("run-generate"),
    runProcess: $("run-process"),
    sourceCard: $("source-card"),
    sourceFileCount: $("source-file-count"),
    sourceSubtitle: $("source-subtitle"),
    sourceTitle: $("source-title"),
    stationIdPreview: $("station-id-preview"),
    stationIdCombobox: $("station-id-combobox"),
    stationIdMatch: $("station-id-match"),
    stationIdMenu: $("station-id-menu"),
    stationIdToggle: $("station-id-toggle"),
    statusBadge: $("status-badge"),
    statusMessage: $("status-message"),
    subtabRow: $("subtab-row"),
    templateSummaryPill: $("template-summary-pill"),
    leieActionAuto: $("leie-action-auto"),
    leieActionHelp: $("leie-action-help"),
    leieActionManual: $("leie-action-manual"),
    leieCancelProcess: $("leie-cancel-process"),
    leieDuplicateActions: $("leie-duplicate-actions"),
    leieDuplicateCard: $("leie-duplicate-card"),
    leieDuplicateResult: $("leie-duplicate-result"),
    leieDuplicateSummary: $("leie-duplicate-summary"),
    leieDuplicateTableBody: $("leie-duplicate-table-body"),
    leieDuplicateTableWrap: $("leie-duplicate-table-wrap"),
    leieRescan: $("leie-rescan"),
    toggleOptionalFields: $("toggle-optional-fields"),
    uploadEnabled: $("upload-enabled"),
    uploadEnabledLabel: $("upload-enabled-label"),
    uploadCard: $("upload-card"),
    uploadSubtitle: $("upload-subtitle"),
    uploadReadyPill: $("upload-ready-pill"),
    uploadTargets: $("upload-targets"),
    workflowCard: $("workflow-card"),
    workflowSubtitle: $("workflow-subtitle"),
    workflowTitle: $("workflow-title"),
    outputCard: $("output-card"),
    archiveNamingCard: document.querySelector(".archive-naming-card"),
    outputRetentionCard: $("output-retention-card"),
    releaseAnnouncementAccept: $("release-announcement-accept"),
    releaseAnnouncementList: $("release-announcement-list"),
    releaseAnnouncementOverlay: $("release-announcement-overlay"),
    releaseAnnouncementPanel: $("release-announcement-panel"),
    releaseAnnouncementTitle: $("release-announcement-title"),
    releaseAnnouncementVersion: $("release-announcement-version"),
    openLeieValidationGuide: $("open-leie-validation-guide"),
    leieGuideBanner: $("leie-guide-banner"),
    leieUploadValidationCard: $("leie-upload-validation-card"),
    leieValidationBatchId: $("leie-validation-batch-id"),
    leieValidationSql: $("leie-validation-sql"),
    copyLeieValidationSql: $("copy-leie-validation-sql"),
    leieValidationCopyStatus: $("leie-validation-copy-status"),
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  captureStaticHelperDefaults();
  setTheme("light");
  startLiveListDateClock();
  syncIcnFieldState();
  setupEventHandlers();
  syncWorkflowText();
  try {
    await refreshInfo();
    await applyUiSettings(state.info?.uiSettings || {});
  } finally {
    syncReleaseAnnouncement();
    syncIcnFieldState();
  }
});
