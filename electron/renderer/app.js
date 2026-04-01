const DATE_PARTS = [
  { key: "year", width: 4, min: 0, max: 9999 },
  { key: "month", width: 2, min: 0, max: 12 },
  { key: "day", width: 2, min: 0, max: 31 },
  { key: "hour", width: 2, min: 0, max: 23 },
  { key: "minute", width: 2, min: 0, max: 59 },
  { key: "second", width: 2, min: 0, max: 59 },
];
const PAYMENT_AUTHORITY_CODE_MAX = 99999;

const state = {
  info: null,
  busy: false,
  theme: "light",
  mainTab: "referral",
  subTab: "edit",
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
      announcement?.shouldShow &&
      state.acknowledgedReleaseKey !== announcement.releaseKey
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

function getStationOptions() {
  return Array.isArray(state.info?.stationOptions) ? state.info.stationOptions : [];
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
    emptyState.textContent = "No matching station found. Keep typing to use a custom Station ID.";
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

  const stationId = readValue("override-station-id");
  if (!stationId) {
    elements.stationIdMatch.classList.remove("is-success", "is-error");
    elements.stationIdMatch.textContent = `Loaded ${getStationOptions().length.toLocaleString()} Station IDs. Choose a station_key from the dropdown or type a custom Station ID.`;
    return;
  }

  const match = findStationOption(stationId);
  if (match) {
    elements.stationIdMatch.classList.add("is-success");
    elements.stationIdMatch.classList.remove("is-error");
    elements.stationIdMatch.textContent = `Matched station: ${match.stationKey} | ${match.stationName}`;
    return;
  }

  elements.stationIdMatch.classList.remove("is-success", "is-error");
  elements.stationIdMatch.textContent = "Custom Station ID entered. The field still accepts manual values.";
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
    StationID: readValue("override-station-id"),
    PaymentAuthorityCode: readValue("override-payment-authority-code"),
    ReferralPeriod: readValue("override-referral-period"),
    Network: readValue("override-network"),
    DOB: readValue("override-dob"),
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
    icnMode: getSelectedIcnMode(),
    icnCustomValue: readValue("icn-custom-value"),
    overrideStationId: readValue("override-station-id"),
    overridePaymentAuthorityCode: readValue("override-payment-authority-code"),
    overrideReferralPeriod: readValue("override-referral-period"),
    overrideNetwork: readValue("override-network"),
    overrideDob: readValue("override-dob"),
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
  state.mainTab = settings.mainTab === "other" ? "other" : "referral";
  state.subTab = settings.subTab === "generate" ? "generate" : "edit";
  state.acknowledgedReleaseKey = String(settings.acknowledgedReleaseKey || "").trim();
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
    "override-referral-category": settings.overrideReferralCategory,
    "override-referral-date": settings.overrideReferralDate,
    "override-referral-date-time": settings.overrideReferralDateTime,
    "override-referral-expiration-date": settings.overrideReferralExpirationDate,
    "override-referral-last-update-date": settings.overrideReferralLastUpdateDate,
    "override-referral-consult-id": settings.overrideReferralConsultId,
    "file-count": settings.fileCount,
    "referrals-per-file": settings.referralsPerFile,
  };

  for (const [id, value] of Object.entries(valueMap)) {
    if ($(id) && value !== undefined && value !== null) {
      $(id).value = String(value);
    }
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

  syncIcnFieldState();
  updateTemplateSummary();
  syncWorkflowText();
  renderStationOptions(getStationOptions());
  applyUploadTargetSettings(settings.uploadTargets || {});

  if (readValue("input-dir")) {
    await inspectSourceFolder();
  } else {
    updatePreviews();
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
      updatePreviews();
      scheduleUiSettingsSave();
    });
    testButton.addEventListener("click", () => testUploadTarget(wrapper));

    elements.uploadTargets.appendChild(wrapper);
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
  setValueIfEmpty("override-dob", defaults.DOB);
  setValueIfEmpty("override-referral-category", defaults.ReferralCategory);
  setValueIfEmpty("override-referral-date", defaults.ReferralDate);
  setValueIfEmpty("override-referral-date-time", defaults.ReferralDateTime);
  setValueIfEmpty("override-referral-expiration-date", defaults.ReferralExpirationDate);
  setValueIfEmpty("override-referral-last-update-date", defaults.ReferralLastUpdateDate);
  setValueIfEmpty("override-referral-consult-id", defaults.ReferralConsultId);
}

function applyInfo(info) {
  state.info = info;
  state.acknowledgedReleaseKey = String(info.uiSettings?.acknowledgedReleaseKey || state.acknowledgedReleaseKey || "").trim();
  renderStationOptions(info.stationOptions || []);
  elements.appVersionBadge.textContent = info.appVersionLabel || "";
  elements.appVersionBadge.classList.toggle("hidden", !info.appVersionLabel);
  document.title = info.appVersionLabel
    ? `CCRS File Processing Framework | ${info.appVersionLabel}`
    : "CCRS File Processing Framework";
  setUploadReadyState("idle");
  renderUploadTargets(info.uploadTargets || []);
  applyGeneratorDefaults();
  applyUploadTargetSettings(info.uiSettings?.uploadTargets || {});
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

async function inspectSourceFolder() {
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

  try {
    const preview = await window.ccrs.getPreview({
      replacementCode: readValue("replacement-code"),
      archiveBasename: readValue("archive-basename"),
      archiveNamingOptions: collectArchiveNamingOptions(),
      referralReplacementCode: readValue("referral-code"),
      icnSettings: collectIcnSettings(),
      ssnValue: readValue("ssn-value"),
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
  const isGenerate = state.subTab === "generate" && isReferral;
  const isOther = state.mainTab === "other";

  elements.heroTitle.textContent = "CCRS File Processing";
  elements.heroSubtitle.textContent = "Use the tabs below to work with referral files and related CCRS processing workflows.";
  elements.mainTabCopy.textContent = isReferral
    ? "Choose source files, apply targeted JSON updates, and export clean output in one pass."
    : "Future CCRS file types will appear here.";
  elements.workflowTitle.textContent = isGenerate
    ? "CCRS Referral Generation"
    : isReferral
      ? "CCRS Referral Processing"
      : "Other CCRS File Processing";
  elements.workflowSubtitle.textContent = isGenerate
    ? "Create fresh referral JSON files, then process and package them."
    : isReferral
      ? "Choose source files, apply targeted JSON updates, and export clean output in one pass."
      : "This area is reserved for future CCRS workflow implementations.";
  elements.sourceTitle.textContent = isGenerate ? "Template Output" : "Source";
  elements.sourceSubtitle.textContent = isGenerate
    ? "Generator mode creates fresh files directly, so no source folder is required."
    : "Pick the folder that contains the incoming JSON files.";
  elements.outputSubtitle.textContent = isGenerate
    ? "Choose where the generated referral JSON files should be saved and how the final output should be kept."
    : "Choose where the processed JSON files should be saved and how the final output should be kept.";

  elements.subtabRow.classList.toggle("hidden", !isReferral);
  elements.generatorCard.classList.toggle("hidden", !isGenerate);
  elements.workflowCard.classList.toggle("hidden", false);
  elements.futureCard.classList.toggle("hidden", true);
  elements.sourceCard.classList.toggle("hidden", isGenerate || isOther);
  elements.referralDetailsCard.classList.toggle("hidden", isOther);
  elements.outputCard.classList.toggle("hidden", isOther);
  elements.uploadCard.classList.toggle("hidden", isOther);
  elements.runCard.classList.toggle("hidden", isOther);
  elements.runProcess.classList.toggle("hidden", isGenerate || isOther);
  elements.runGenerate.classList.toggle("hidden", !isGenerate || isOther);
  elements.templateSummaryPill.classList.toggle("hidden", !isGenerate || isOther);

  if (isGenerate) {
    applyGeneratorDefaults();
  }
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
  const selected = await window.ccrs.pickDirectory();
  if (!selected) {
    return;
  }

  $(targetId).value = selected;
  if (targetId === "input-dir") {
    await inspectSourceFolder();
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
  if (!(await validateCurrentForm())) {
    return;
  }
  if (!state.listDateTouched) {
    setDateParts(nowAsListDate());
  }
  await runJob("process", { ...sharedPayload(), inputDir: readValue("input-dir") }, "Processing");
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
    "override-station-id",
    "override-payment-authority-code",
    "override-referral-period",
    "override-network",
    "override-dob",
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
  for (const input of document.querySelectorAll('input[name="icn-mode"]')) {
    input.addEventListener("change", () => {
      syncIcnFieldState();
      updatePreviews();
      scheduleUiSettingsSave();
    });
  }
  elements.uploadEnabled.addEventListener("change", () => {
    updatePreviews();
    scheduleUiSettingsSave();
  });

  elements.inputDir.addEventListener("change", async () => {
    await inspectSourceFolder();
    scheduleUiSettingsSave();
  });
  elements.inputDir.addEventListener("blur", async () => {
    await inspectSourceFolder();
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
  elements.releaseAnnouncementAccept.addEventListener("click", acknowledgeReleaseAnnouncement);
  elements.releaseAnnouncementPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  window.ccrs.onBackendEvent((event) => {
    if (event.type !== "progress") {
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
    outputSubtitle: $("output-subtitle"),
    overrideDob: $("override-dob"),
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
    toggleOptionalFields: $("toggle-optional-fields"),
    uploadEnabled: $("upload-enabled"),
    uploadCard: $("upload-card"),
    uploadReadyPill: $("upload-ready-pill"),
    uploadTargets: $("upload-targets"),
    workflowCard: $("workflow-card"),
    workflowSubtitle: $("workflow-subtitle"),
    workflowTitle: $("workflow-title"),
    outputCard: $("output-card"),
    releaseAnnouncementAccept: $("release-announcement-accept"),
    releaseAnnouncementList: $("release-announcement-list"),
    releaseAnnouncementOverlay: $("release-announcement-overlay"),
    releaseAnnouncementPanel: $("release-announcement-panel"),
    releaseAnnouncementTitle: $("release-announcement-title"),
    releaseAnnouncementVersion: $("release-announcement-version"),
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
  await refreshInfo();
  await applyUiSettings(state.info?.uiSettings || {});
  syncIcnFieldState();
});
