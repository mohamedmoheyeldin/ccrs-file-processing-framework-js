const DATE_PARTS = [
  { key: "year", width: 4, min: 0, max: 9999 },
  { key: "month", width: 2, min: 0, max: 12 },
  { key: "day", width: 2, min: 0, max: 31 },
  { key: "hour", width: 2, min: 0, max: 23 },
  { key: "minute", width: 2, min: 0, max: 59 },
  { key: "second", width: 2, min: 0, max: 59 },
];
const PAYMENT_AUTHORITY_CODE_MAX = 99999;
const STATION_RESULT_LIMIT = 60;
const SEOC_RESULT_LIMIT = 60;
let referralUploadTargetNames = new Set(["DEV", "PPD", "SQA"]);
const ACTIVE_STATUS_PATTERN = /working|processing|generating|uploading|importing|scanning|validating|packaging|archive|cancelling|testing|preparing/i;
const { buildLeieValidationSql, highlightSql } = window.ccrsLeieSql;
const {
  LEIE_DEFAULT_UPLOAD_DIRECTORY,
  REFERRAL_DEFAULT_UPLOAD_DIRECTORY,
  resolveUploadDirectoryForWorkflow,
} = window.ccrsUploadDefaults;

const state = {
  info: null,
  busy: false,
  activityActive: false,
  statusLabel: "Ready",
  progressCurrent: 0,
  progressTotal: 0,
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
  jobCancellable: false,
  cancelRequested: false,
  previewTimer: null,
  previewRequestId: 0,
  selectedStationIds: [],
  selectedSeocKeys: [],
  selectedSituationalSeocKeys: [],
  seocBySelectorKey: new Map(),
  seocSearchIndex: [],
  stationById: new Map(),
  stationSearchIndex: [],
  stationSelectableCount: 0,
  stationRenderFrame: null,
  lastSavedUiSettingsSignature: "",
  previewCacheSignature: "",
  previewCacheResult: null,
  currentPhase: "idle",
  lastRun: null,
};

const elements = {};
const STATIC_HELPER_IDS = [
  "outputDirHelp",
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
  const normalizedLabel = String(label || "Ready").trim();
  state.statusLabel = normalizedLabel;
  state.activityActive = state.busy || ACTIVE_STATUS_PATTERN.test(normalizedLabel);
  elements.statusBadge.textContent = normalizedLabel;
  elements.statusMessage.textContent = String(message || "The app is ready.").trim();

  const badgeClass = normalizedLabel.toLowerCase();
  elements.statusBadge.className = "status-badge";
  if (badgeClass.includes("failed") || badgeClass.includes("warning")) {
    elements.statusBadge.classList.add("failed");
  } else if (badgeClass.includes("complete") || badgeClass.includes("ready to save") || badgeClass.includes("uploaded")) {
    elements.statusBadge.classList.add("completed");
  } else if (state.activityActive) {
    elements.statusBadge.classList.add("working");
  } else {
    elements.statusBadge.classList.add("idle");
  }
  window.ccrsJobUi.syncWorkflowProgress(normalizedLabel, state.currentPhase);
  setJobProgress(state.progressCurrent, state.progressTotal);
}

function setJobProgress(current = 0, total = 0) {
  state.progressCurrent = Number(current) || 0;
  state.progressTotal = Number(total) || 0;
  window.ccrsJobUi.updateProgress({
    progressElement: elements.jobProgress,
    progressWrap: elements.jobProgressWrap,
    progressLabel: elements.jobProgressLabel,
    progressValue: elements.jobProgressValue,
    active: state.activityActive,
    current: state.progressCurrent,
    total: state.progressTotal,
  });
}

function setBusy(busy, cancellable = false) {
  state.busy = busy;
  state.jobCancellable = Boolean(busy && cancellable);
  if (!busy) {
    state.cancelRequested = false;
    state.currentPhase = "idle";
  }
  state.activityActive = busy || ACTIVE_STATUS_PATTERN.test(state.statusLabel);
  window.ccrsJobUi.updateBusyControls({
    busy,
    cancellable: state.jobCancellable,
    cancelRequested: state.cancelRequested,
    cancelButton: elements.cancelJob,
  });
  setJobProgress(0, 0);
  if (!busy) {
    syncIdentityControls();
    window.ccrsJobUi.syncWorkflowProgress(state.statusLabel, state.currentPhase);
  }
}

async function cancelActiveJob() {
  if (!state.jobCancellable || state.cancelRequested) return;
  state.cancelRequested = true;
  elements.cancelJob.disabled = true;
  setStatus("Cancelling", "Stopping the current operation safely...");
  const result = await window.ccrs.cancelJob();
  if (!result?.cancelled) {
    state.cancelRequested = false;
    elements.cancelJob.disabled = false;
    setStatus("Working", "The current operation is already finishing.");
  }
}

function setReleaseAnnouncementOpen(isOpen) {
  state.releaseAnnouncementOpen = Boolean(isOpen);
  elements.releaseAnnouncementOverlay?.classList.toggle("hidden", !state.releaseAnnouncementOpen);
  document.body.classList.toggle("modal-open", state.releaseAnnouncementOpen);
  if (state.releaseAnnouncementOpen) {
    window.requestAnimationFrame(() => {
      elements.releaseAnnouncementAccept?.focus({ preventScroll: true });
    });
  }
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

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function isExcelPath(value) {
  return /\.(xlsx|xls|xlsm|xlsb)$/i.test(String(value || "").trim());
}

function syncLeieValidationSql() {
  if (!elements.leieValidationSql || !elements.leieValidationBatchId) {
    return;
  }
  const sqlText = buildLeieValidationSql(elements.leieValidationBatchId.value);
  elements.leieValidationSql.dataset.rawSql = sqlText;
  elements.leieValidationSql.innerHTML = `<code>${highlightSql(sqlText)}</code>`;
}

async function copyLeieValidationSql() {
  if (!elements.leieValidationSql) {
    return;
  }

  const sqlText = elements.leieValidationSql.dataset.rawSql || elements.leieValidationSql.textContent;
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
    const copyField = document.createElement("textarea");
    copyField.value = sqlText;
    copyField.setAttribute("readonly", "");
    copyField.className = "clipboard-copy-field";
    document.body.appendChild(copyField);
    copyField.select();
    copied = document.execCommand("copy");
    copyField.remove();
  }

  elements.leieValidationCopyStatus.textContent = copied
    ? "SQL copied. Run it in ccrsdb for the selected environment."
    : "Unable to copy automatically. Select the SQL and copy it manually.";
  elements.leieValidationCopyStatus.classList.toggle("is-success", copied);
  elements.leieValidationCopyStatus.classList.toggle("is-error", !copied);
}

function getStationOptions() {
  return Array.isArray(state.info?.stations) ? state.info.stations : [];
}

function getSeocOptions() {
  return Array.isArray(state.info?.seocOptions) ? state.info.seocOptions : [];
}

function getSeocVisibleName(option = {}) {
  const name = String(option.name || "").trim();
  if (name) return name;
  return String(option.displayName || "")
    .replace(/\s+-\s+\d+\s*$/, "")
    .trim();
}

function getSeocSelectorConfig(situational = false) {
  return situational
    ? {
        selectedKey: "selectedSituationalSeocKeys",
        combobox: elements.situationalSeocCombobox,
        input: elements.situationalSeocSearch,
        toggle: elements.situationalSeocToggle,
        menu: elements.situationalSeocMenu,
        selected: elements.selectedSituationalSeocs,
        match: elements.situationalSeocMatch,
        useAll: elements.useAllSituationalSeocs,
        label: "Situational SEOC",
      }
    : {
        selectedKey: "selectedSeocKeys",
        combobox: elements.seocCombobox,
        input: elements.seocSearch,
        toggle: elements.seocToggle,
        menu: elements.seocMenu,
        selected: elements.selectedSeocs,
        match: elements.seocMatch,
        useAll: elements.useAllSeocs,
        label: "SEOC",
      };
}

function setSeocMenuOpen(config, open) {
  config.combobox?.classList.toggle("is-open", Boolean(open));
  config.menu?.classList.toggle("hidden", !open);
  config.input?.setAttribute("aria-expanded", String(Boolean(open)));
}

function renderSelectedSeocs(config) {
  config.selected.innerHTML = "";
  for (const selectorKey of state[config.selectedKey]) {
    const option = state.seocBySelectorKey.get(selectorKey);
    if (!option) continue;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "selected-station-chip";
    chip.dataset.seocSelectorKey = selectorKey;
    const visibleName = getSeocVisibleName(option);
    chip.textContent = `${visibleName} ×`;
    chip.title = `Remove ${visibleName}`;
    config.selected.append(chip);
  }
  if (config.useAll.checked) {
    config.match.textContent = `All ${getSeocOptions().length.toLocaleString()} available ${config.label} values will be used.`;
  } else if (state[config.selectedKey].length > 0) {
    config.match.textContent = `${state[config.selectedKey].length.toLocaleString()} ${config.label} value${state[config.selectedKey].length === 1 ? "" : "s"} selected.`;
  } else {
    config.match.textContent = `Automatic mode ${config.label === "SEOC" ? "keeps source SEOC values" : "leaves Situational SEOC values unchanged"}.`;
  }
  config.input.disabled = config.useAll.checked;
  config.toggle.disabled = config.useAll.checked;
}

function renderSeocMenu(config) {
  const query = config.input.value.trim().toLowerCase();
  const matches = state.seocSearchIndex.filter((entry) => !query || entry.searchText.includes(query));
  config.menu.innerHTML = "";
  for (const entry of matches.slice(0, SEOC_RESULT_LIMIT)) {
    const option = entry.option;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `combo-option${state[config.selectedKey].includes(option.selectorKey) ? " is-selected" : ""}`;
    button.dataset.seocSelectorKey = option.selectorKey;
    const title = document.createElement("span");
    title.className = "combo-option-title";
    title.textContent = getSeocVisibleName(option);
    button.append(title);
    config.menu.append(button);
  }
  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "combo-empty";
    empty.textContent = "No matching SEOC values.";
    config.menu.append(empty);
  } else if (matches.length > SEOC_RESULT_LIMIT) {
    const summary = document.createElement("div");
    summary.className = "combo-result-summary";
    summary.textContent = `Showing ${SEOC_RESULT_LIMIT} of ${matches.length.toLocaleString()} matches. Keep typing to narrow the list.`;
    config.menu.append(summary);
  }
}

function syncIdentityControls() {
  $("ssn-value").disabled = readChecked("randomize-ssn");
  $("override-dob").disabled = readChecked("randomize-dob");
  elements.overrideStationId.disabled = readChecked("randomize-station-id");
  elements.stationIdToggle.disabled = readChecked("randomize-station-id");
}

function renderSelectedStations() {
  if (!elements.selectedStations) return;
  elements.selectedStations.innerHTML = "";
  for (const stationId of state.selectedStationIds) {
    const station = findStationOption(stationId);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "selected-station-chip";
    chip.textContent = `${stationId} — ${station?.station_name || "Selected station"} ×`;
    chip.title = `Remove Station ID ${stationId}`;
    chip.addEventListener("click", () => {
      state.selectedStationIds = state.selectedStationIds.filter((value) => value !== stationId);
      renderSelectedStations();
      scheduleStationOptionsRender();
      updateStationIdMatch();
      schedulePreviewUpdate();
      scheduleUiSettingsSave();
    });
    elements.selectedStations.appendChild(chip);
  }
}

function findStationOption(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return state.stationById.get(normalized) || null;
}

function scheduleStationOptionsRender() {
  if (state.stationRenderFrame !== null) {
    window.cancelAnimationFrame(state.stationRenderFrame);
  }
  state.stationRenderFrame = window.requestAnimationFrame(() => {
    state.stationRenderFrame = null;
    renderStationOptions();
  });
}

function renderStationOptions() {
  if (!elements.stationIdMenu) {
    return;
  }
  const normalizedQuery = readValue("override-station-id").toLowerCase();
  const fragment = document.createDocumentFragment();
  const matchingEntries = normalizedQuery
    ? state.stationSearchIndex.filter((entry) => entry.searchText.includes(normalizedQuery))
    : state.stationSearchIndex;
  const filteredOptions = matchingEntries.slice(0, STATION_RESULT_LIMIT).map((entry) => entry.option);

  if (filteredOptions.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "combo-empty";
    emptyState.textContent = "No matching station found. Search by station key, ID, VISN, name, or parent station ID.";
    fragment.appendChild(emptyState);
  }

  for (const option of filteredOptions) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "combo-option";
    element.setAttribute("role", "option");
    element.dataset.stationId = option.station_id || "";
    const isSelected = state.selectedStationIds.includes(option.station_id);
    element.setAttribute("aria-selected", String(isSelected));
    element.classList.toggle("is-selected", isSelected);
    element.disabled = !option.station_id;
    element.title = option.station_id
      ? `${option.station_id} - ${option.station_name || "Unnamed station"}`
      : "This source row has no station_id and cannot be selected.";
    const title = document.createElement("span");
    title.className = "combo-option-title";
    title.textContent = option.station_name || "Unnamed station";
    element.appendChild(title);
    const details = document.createElement("span");
    details.className = "station-option-fields";
    for (const [label, value] of [
      ["station_key", option.station_key],
      ["station_id", option.station_id],
      ["visn_id", option.visn_id],
      ["station_name", option.station_name],
      ["parent_station_id", option.parent_station_id],
    ]) {
      const field = document.createElement("span");
      field.className = "station-option-field";
      const fieldLabel = document.createElement("strong");
      fieldLabel.textContent = `${label}:`;
      field.append(fieldLabel, document.createTextNode(` ${value || "—"}`));
      details.appendChild(field);
    }
    element.appendChild(details);
    fragment.appendChild(element);
  }

  if (matchingEntries.length > STATION_RESULT_LIMIT) {
    const resultSummary = document.createElement("div");
    resultSummary.className = "combo-result-summary";
    resultSummary.textContent = normalizedQuery
      ? `Showing the first ${STATION_RESULT_LIMIT} of ${matchingEntries.length.toLocaleString()} matches. Keep typing to narrow the list.`
      : `Showing ${STATION_RESULT_LIMIT} of ${matchingEntries.length.toLocaleString()} stations. Type to search the complete catalog.`;
    fragment.appendChild(resultSummary);
  }

  elements.stationIdMenu.replaceChildren(fragment);
}

function setStationMenuOpen(isOpen) {
  if (!elements.stationIdCombobox || !elements.stationIdMenu) {
    return;
  }

  elements.stationIdCombobox.classList.toggle("is-open", Boolean(isOpen));
  elements.stationIdMenu.classList.toggle("hidden", !isOpen);
  elements.overrideStationId.setAttribute("aria-expanded", String(Boolean(isOpen)));
}

function updateStationIdMatch() {
  if (!elements.stationIdMatch) {
    return;
  }

  if (readChecked("randomize-station-id")) {
    elements.stationIdMatch.classList.add("is-success");
    elements.stationIdMatch.classList.remove("is-error");
    elements.stationIdMatch.textContent = `Random selection will use the ${state.stationSelectableCount.toLocaleString()} rows that have a station_id.`;
    return;
  }

  if (state.selectedStationIds.length > 0) {
    elements.stationIdMatch.classList.add("is-success");
    elements.stationIdMatch.classList.remove("is-error");
    elements.stationIdMatch.textContent = `${state.selectedStationIds.length.toLocaleString()} station${state.selectedStationIds.length === 1 ? "" : "s"} selected. Referrals will be assigned randomly from this selected set.`;
    return;
  }

  const stationId = readValue("override-station-id");
  if (!stationId) {
    elements.stationIdMatch.classList.remove("is-success", "is-error");
    elements.stationIdMatch.textContent = `Loaded all ${getStationOptions().length.toLocaleString()} station rows. Selection is optional; search any of the five displayed fields.`;
    return;
  }

  const match = findStationOption(stationId);
  if (match) {
    elements.stationIdMatch.classList.add("is-success");
    elements.stationIdMatch.classList.remove("is-error");
    elements.stationIdMatch.textContent = `Selected: station_key ${match.station_key} | station_id ${match.station_id} | VISN ${match.visn_id || "—"} | ${match.station_name || "Unnamed station"} | parent ${match.parent_station_id || "—"}`;
    return;
  }

  elements.stationIdMatch.classList.remove("is-success");
  elements.stationIdMatch.classList.add("is-error");
  elements.stationIdMatch.textContent = "Search results are shown above. Choose a station to apply its station_id, or clear this optional field.";
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
  let normalized = String(value || "").trim();
  const prefixOptions = getReferralPrefixOptions();
  const prefixes = [prefixOptions.customReferralPrefix, "VAiFAMS", "iFAMS", "VA"]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  for (const prefix of prefixes) {
    if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  return (normalized.match(/[A-Za-z0-9]/g) || []).join("");
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
    button.setAttribute("aria-pressed", String(button.dataset.theme === state.theme));
  }
}

function syncTabState() {
  for (const current of document.querySelectorAll("[data-main-tab]")) {
    current.classList.toggle("is-active", current.dataset.mainTab === state.mainTab);
    current.setAttribute("aria-selected", String(current.dataset.mainTab === state.mainTab));
  }
  for (const current of document.querySelectorAll("[data-sub-tab]")) {
    current.classList.toggle("is-active", current.dataset.subTab === state.subTab);
    current.setAttribute("aria-selected", String(current.dataset.subTab === state.subTab));
  }
}

function syncOptionalFieldsVisibility() {
  elements.optionalFields.classList.toggle("hidden", !state.optionalFieldsVisible);
  elements.toggleOptionalFields.textContent = state.optionalFieldsVisible ? "Hide Additional Fields" : "Show Additional Fields";
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
    StationID: "",
    PaymentAuthorityCode: readValue("override-payment-authority-code"),
    ReferralPeriod: readValue("override-referral-period"),
    Network: readValue("override-network"),
    DOB: readChecked("randomize-dob") ? "" : readValue("override-dob"),
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
    if (!isUploadTargetAvailableForWorkflow(row.dataset.target)) {
      continue;
    }
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

function isUploadTargetAvailableForWorkflow(targetName) {
  if (state.mainTab !== "referral") {
    return true;
  }
  return referralUploadTargetNames.has(String(targetName || "").trim().toUpperCase());
}

function collectIcnSettings() {
  return {
    mode: getSelectedIcnMode(),
    value: readValue("icn-custom-value"),
  };
}

function collectArchiveNamingOptions() {
  return {
    mode: document.querySelector('input[name="archive-naming-mode"]:checked')?.value || "referral-number",
    customPattern: readValue("archive-custom-pattern"),
    customText: readValue("archive-custom-text"),
  };
}

function syncArchiveNamingState() {
  const isCustom = collectArchiveNamingOptions().mode === "custom";
  elements.archiveCustomFields?.classList.toggle("hidden", !isCustom);
}

function syncReferralPrefixState() {
  const { referralPrefixMode, customReferralPrefix } = getReferralPrefixOptions();
  const isCustom = referralPrefixMode === "custom";
  elements.customReferralPrefixRow?.classList.toggle("hidden", !isCustom);
  const prefix = referralPrefixMode === "ifams"
    ? "iFAMS"
    : isCustom
      ? customReferralPrefix || "your custom prefix"
      : referralPrefixMode === "mixed"
        ? "VAiFAMS"
        : "VA";
  if (elements.referralCode) {
    elements.referralCode.placeholder = `Enter the part after ${prefix}`;
  }
  if (elements.referralPrefixHelp) {
    elements.referralPrefixHelp.textContent = `${prefix} will be added automatically. Enter the starting number or body once.`;
  }
}

function getReferralPrefixMode() {
  return document.querySelector('input[name="referral-prefix-mode"]:checked')?.value || "va";
}

function getReferralPrefixOptions() {
  const referralPrefixMode = getReferralPrefixMode();
  const customReferralPrefix = readValue("custom-referral-prefix");
  return {
    referralPrefixMode,
    customReferralPrefix,
    referralPrefix: referralPrefixMode === "ifams" ? "iFAMS" : "VA",
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
      selectedStationIds: readChecked("randomize-station-id") ? [] : [...state.selectedStationIds],
      selectedSeocKeys: [...state.selectedSeocKeys],
      useAllSeocs: readChecked("use-all-seocs"),
      selectedSituationalSeocKeys: [...state.selectedSituationalSeocKeys],
      useAllSituationalSeocs: readChecked("use-all-situational-seocs"),
      ...getReferralPrefixOptions(),
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
    useIfamsFilenamePrefix: readChecked("use-ifams-filename-prefix"),
    archiveNamingMode: collectArchiveNamingOptions().mode,
    archiveCustomPattern: readValue("archive-custom-pattern"),
    archiveCustomText: readValue("archive-custom-text"),
    referralPrefixMode: getReferralPrefixMode(),
    customReferralPrefix: readValue("custom-referral-prefix"),
    referralCode: readValue("referral-code"),
    ssnValue: readValue("ssn-value"),
    randomizeSsn: readChecked("randomize-ssn"),
    randomizeDob: readChecked("randomize-dob"),
    randomizeStationId: readChecked("randomize-station-id"),
    matchSuffixLength: readValue("match-suffix-length"),
    icnMode: getSelectedIcnMode(),
    icnCustomValue: readValue("icn-custom-value"),
    selectedStationIds: [...state.selectedStationIds],
    selectedSeocKeys: [...state.selectedSeocKeys],
    useAllSeocs: readChecked("use-all-seocs"),
    selectedSituationalSeocKeys: [...state.selectedSituationalSeocKeys],
    useAllSituationalSeocs: readChecked("use-all-situational-seocs"),
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
    leieDuplicateKey: state.leieDuplicateKey,
    leieDuplicateHandling: state.leieDuplicateHandling,
    leieOutputFileName: state.mainTab === "leie" ? readValue("replacement-code") : state.leieOutputFileName,
    leieValidationBatchId: readValue("leie-validation-batch-id"),
  };
}

function scheduleUiSettingsSave() {
  clearTimeout(state.uiSettingsSaveTimer);
  state.uiSettingsSaveTimer = window.setTimeout(async () => {
    const settings = collectUiSettings();
    const signature = JSON.stringify(settings);
    if (signature === state.lastSavedUiSettingsSignature) return;
    try {
      await window.ccrs.saveUiSettings(settings);
      state.lastSavedUiSettingsSignature = signature;
    } catch (error) {
      console.error("Unable to save UI settings.", error);
    }
  }, 450);
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
    if (row.querySelector(".upload-path")) {
      row.querySelector(".upload-path").value = resolveUploadDirectoryForWorkflow(
        targetSettings.remoteDirectory,
        state.mainTab,
        row.dataset.referralDefaultDirectory
      );
    }
  }
}

function syncWorkflowUploadDirectories() {
  for (const row of document.querySelectorAll(".upload-target")) {
    const pathInput = row.querySelector(".upload-path");
    const pathHelp = row.querySelector(".upload-path-help");
    if (!pathInput) {
      continue;
    }

    pathInput.value = resolveUploadDirectoryForWorkflow(
      pathInput.value,
      state.mainTab,
      row.dataset.referralDefaultDirectory
    );
    if (pathHelp) {
      pathHelp.textContent = state.mainTab === "leie"
        ? `LEIE Data uploads default to ${LEIE_DEFAULT_UPLOAD_DIRECTORY}. This is separate from the CCRS Referral default ${REFERRAL_DEFAULT_UPLOAD_DIRECTORY}.`
        : `CCRS Referral uploads default to ${REFERRAL_DEFAULT_UPLOAD_DIRECTORY}. This is separate from the LEIE Data default ${LEIE_DEFAULT_UPLOAD_DIRECTORY}.`;
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
    "archive-custom-pattern": settings.archiveCustomPattern,
    "archive-custom-text": settings.archiveCustomText,
    "referral-code": settings.referralCode,
    "ssn-value": settings.ssnValue,
    "icn-custom-value": settings.icnCustomValue,
    "override-payment-authority-code": settings.overridePaymentAuthorityCode,
    "override-referral-period": settings.overrideReferralPeriod,
    "override-network": settings.overrideNetwork,
    "override-dob": settings.overrideDob,
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
  $("use-ifams-filename-prefix").checked = Boolean(settings.useIfamsFilenamePrefix);
  const archiveNamingMode = ["referral-number", "network", "referral-date-time", "prefix", "custom"].includes(settings.archiveNamingMode)
    ? settings.archiveNamingMode
    : "referral-number";
  const archiveModeInput = document.querySelector(`input[name="archive-naming-mode"][value="${archiveNamingMode}"]`);
  if (archiveModeInput) archiveModeInput.checked = true;
  const referralPrefixMode = ["va", "ifams", "mixed", "custom"].includes(settings.referralPrefixMode)
    ? settings.referralPrefixMode
    : settings.useIfamsReferralPrefix
      ? "ifams"
      : "va";
  const referralPrefixInput = document.querySelector(`input[name="referral-prefix-mode"][value="${referralPrefixMode}"]`);
  if (referralPrefixInput) referralPrefixInput.checked = true;
  $("custom-referral-prefix").value = settings.customReferralPrefix || "";
  $("clear-output").checked = Boolean(settings.clearOutput);
  $("keep-existing-files").checked = !Boolean(settings.clearOutput);
  $("keep-processed-json").checked = settings.keepProcessedJson !== false;
  $("upload-enabled").checked = Boolean(settings.uploadEnabled);
  $("randomize-ssn").checked = settings.randomizeSsn !== false;
  $("randomize-dob").checked = settings.randomizeDob !== false;
  $("randomize-station-id").checked = Boolean(settings.randomizeStationId);
  state.selectedStationIds = [...new Set(
    (Array.isArray(settings.selectedStationIds)
      ? settings.selectedStationIds
      : [settings.overrideStationId])
      .map((value) => String(value || "").trim().toUpperCase())
      .filter((value) => findStationOption(value))
  )];
  state.selectedSeocKeys = [...new Set(
    (Array.isArray(settings.selectedSeocKeys) ? settings.selectedSeocKeys : [])
      .map((value) => String(value || ""))
      .filter((value) => state.seocBySelectorKey.has(value))
  )];
  state.selectedSituationalSeocKeys = [...new Set(
    (Array.isArray(settings.selectedSituationalSeocKeys) ? settings.selectedSituationalSeocKeys : [])
      .map((value) => String(value || ""))
      .filter((value) => state.seocBySelectorKey.has(value))
  )];
  elements.useAllSeocs.checked = Boolean(settings.useAllSeocs);
  elements.useAllSituationalSeocs.checked = Boolean(settings.useAllSituationalSeocs);

  syncIcnFieldState();
  syncReferralPrefixState();
  syncArchiveNamingState();
  syncIdentityControls();
  syncLeieValidationSql();
  updateTemplateSummary();
  syncWorkflowText();
  $("leie-action-auto").checked = state.leieDuplicateHandling === "auto-remove";
  $("leie-action-manual").checked = state.leieDuplicateHandling !== "auto-remove";
  renderSelectedStations();
  renderSelectedSeocs(getSeocSelectorConfig(false));
  renderSelectedSeocs(getSeocSelectorConfig(true));
  applyUploadTargetSettings(settings.uploadTargets || {});
  syncUploadTargetState();
  state.lastSavedUiSettingsSignature = JSON.stringify(collectUiSettings());

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
    wrapper.dataset.referralDefaultDirectory = target.defaultRemoteDirectory || REFERRAL_DEFAULT_UPLOAD_DIRECTORY;
    const defaultRemoteDirectory = resolveUploadDirectoryForWorkflow(
      "",
      state.mainTab,
      wrapper.dataset.referralDefaultDirectory
    );

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
          <input class="upload-path" type="text" value="${defaultRemoteDirectory}" />
          <small class="helper-text upload-path-help">CCRS Referral uploads default to ${REFERRAL_DEFAULT_UPLOAD_DIRECTORY}.</small>
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

    const available = isUploadTargetAvailableForWorkflow(row.dataset.target);
    row.classList.toggle("hidden", !available);
    row.setAttribute("aria-hidden", String(!available));
    targetToggle.disabled = !available || !uploadEnabled;
    const targetActive = available && uploadEnabled && targetToggle.checked;

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

  input.disabled = mode === "test-dynamic" || mode === "referral-match";
  input.value = sanitizeIcnInput(input.value, mode);

  if (mode === "test-custom-suffix") {
    input.placeholder = `Enter up to ${suffixLength} letters or numbers after ${testPrefix}`;
    return;
  }

  if (mode === "custom-full") {
    input.placeholder = `Enter up to ${totalLength} letters or numbers`;
    return;
  }

  if (mode === "referral-match") {
    input.value = "";
    input.placeholder = "Generated from each Referral Number";
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
  referralUploadTargetNames = new Set(info.workflowPolicy?.referralUploadTargets || ["DEV", "PPD", "SQA"]);
  state.stationById = new Map();
  state.stationSelectableCount = 0;
  state.stationSearchIndex = (info.stations || []).map((option) => {
    const stationId = String(option.station_id || "").trim().toUpperCase();
    if (stationId && !state.stationById.has(stationId)) {
      state.stationById.set(stationId, option);
    }
    if (stationId) state.stationSelectableCount += 1;
    return {
      option,
      searchText: [
        option.station_key,
        option.station_id,
        option.visn_id,
        option.station_name,
        option.parent_station_id,
      ].filter(Boolean).join(" ").toLowerCase(),
    };
  });
  state.seocBySelectorKey = new Map();
  state.seocSearchIndex = (info.seocOptions || []).map((option) => {
    state.seocBySelectorKey.set(option.selectorKey, option);
    return {
      option,
      searchText: [option.displayName, option.name, option.seocNumber, option.seocKey, option.seocId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });
  state.acknowledgedReleaseKey = String(
    info.releaseAnnouncement?.acknowledgedReleaseKey || state.acknowledgedReleaseKey || ""
  ).trim();
  elements.appVersionBadge.textContent = info.appVersionLabel || "";
  elements.appVersionBadge.classList.toggle("hidden", !info.appVersionLabel);
  document.title = info.appVersionLabel
    ? `CCRS File Processing Framework | ${info.appVersionLabel}`
    : "CCRS File Processing Framework";
  setUploadReadyState("idle");
  state.leieOutputFileName = String(info.uiSettings?.leieOutputFileName || state.leieOutputFileName || "").trim();
  renderUploadTargets(info.uploadTargets || []);
  const limits = info.constants?.processingLimits || {};
  if (limits.maxGeneratedFiles) elements.fileCount.max = String(limits.maxGeneratedFiles);
  if (limits.maxReferralsPerFile) elements.referralsPerFile.max = String(limits.maxReferralsPerFile);
  if (limits.maxGeneratedFiles) {
    elements.fileCountHelp.dataset.defaultText = `Maximum ${Number(limits.maxGeneratedFiles).toLocaleString()} files per run.`;
    elements.fileCountHelp.textContent = elements.fileCountHelp.dataset.defaultText;
  }
  if (limits.maxReferralsPerFile) {
    elements.referralsPerFileHelp.dataset.defaultText = `Maximum ${Number(limits.maxReferralsPerFile).toLocaleString()} referrals per file.`;
    elements.referralsPerFileHelp.textContent = elements.referralsPerFileHelp.dataset.defaultText;
  }
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
    ? `${fileCount} source JSON file${fileCount === 1 ? "" : "s"} selected (${formatBytes(inspection.totalSourceBytes)}).`
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
  const sourceChanged = inputDir !== state.leieLastScannedInput;
  if (!force && !sourceChanged) {
    return;
  }

  const requestId = state.leieScanRequestId + 1;
  state.leieScanRequestId = requestId;

  state.leieInspectionError = "";
  // Reflect user selection immediately so the UI never looks stale while inspection runs.
  setStatus("Scanning LEIE", "Reading the selected Excel data and checking every row for exact duplicates...");
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
    if (sourceChanged || !readValue("replacement-code")) {
      state.leieOutputFileName = inspection.outputNameSuggestion || "";
      elements.replacementCode.value = state.leieOutputFileName;
    }

    elements.sourceFileCount.textContent = inspection.fileCount
      ? `${inspection.fileCount} source Excel file${inspection.fileCount === 1 ? "" : "s"} selected: ${inspection.totalRowCount.toLocaleString()} rows, ${formatBytes(inspection.totalSourceBytes)}.`
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
      setStatus("Source Ready", `${inspection.fileCount} LEIE file${inspection.fileCount === 1 ? " is" : "s are"} loaded with ${inspection.totalRowCount.toLocaleString()} rows and no duplicates. Select Save Processed File when ready.`);
    } else {
      setStatus("Ready", "No Excel files were found. Choose a supported LEIE workbook or another folder.");
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

  setStatus("Scanning Referral Files", "Reading the selected folder and checking the available JSON files...");
  try {
    const inspection = await window.ccrs.inspectSource(inputDir);
    applySourceInspection(inspection);
    setStatus(
      inspection.fileCount > 0 ? "Source Ready" : "Ready",
      inspection.fileCount > 0
        ? `${inspection.fileCount} Referral JSON file${inspection.fileCount === 1 ? " is" : "s are"} ready. Review the settings, then select Run Processing.`
        : "No Referral JSON files were found. Choose another source folder."
    );
  } catch (error) {
    setStatus("Failed", error.message);
  }
}

function applyFieldErrors(fieldErrors = {}) {
  setStaticHelperState(elements.outputDirHelp, $("output-dir"), fieldErrors.outputDir);
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
  const referralError = fieldErrors.referralPrefix || fieldErrors.referralReplacementCode;
  setPreviewHelperState(
    elements.referralPreview,
    fieldErrors.referralPrefix ? $("custom-referral-prefix") : $("referral-code"),
    referralError
  );
  setInputValidity($("referral-code"), Boolean(fieldErrors.referralReplacementCode));
  setInputValidity($("custom-referral-prefix"), Boolean(fieldErrors.referralPrefix));
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
  setStatus("Testing Connection", `Connecting to ${serverName} and confirming access to ${remoteDirectory || "the selected remote directory"}...`);

  try {
    const result = await window.ccrs.testUploadTarget({
      server_name: serverName,
      user_name: userName,
      remote_directory: remoteDirectory,
    });
    setUploadTargetStatus(row, result.message, "success");
    setStatus("Connection Ready", `${result.message} This target is ready for the next upload.`);
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

  const previewPayload = {
    inputDir: readValue("input-dir"),
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
      selectedStationIds: readChecked("randomize-station-id") ? [] : [...state.selectedStationIds],
      selectedSeocKeys: [...state.selectedSeocKeys],
      useAllSeocs: readChecked("use-all-seocs"),
      selectedSituationalSeocKeys: [...state.selectedSituationalSeocKeys],
      useAllSituationalSeocs: readChecked("use-all-situational-seocs"),
      ...getReferralPrefixOptions(),
      matchSuffixLength: Number(readValue("match-suffix-length")),
    },
    optionalOverrides: collectOptionalOverrides(),
    fileCount: Number(readValue("file-count") || 0),
    referralsPerFile: Number(readValue("referrals-per-file") || 0),
    upload: collectUploadSettings(),
  };
  const previewSignature = JSON.stringify(previewPayload);
  const requestId = state.previewRequestId + 1;
  try {
    let preview = state.previewCacheSignature === previewSignature
      ? state.previewCacheResult
      : null;
    if (!preview) {
      state.previewRequestId = requestId;
      preview = await window.ccrs.getPreview(previewPayload);
      if (requestId !== state.previewRequestId) return preview;
      state.previewCacheSignature = previewSignature;
      state.previewCacheResult = preview;
    }

    elements.outputJsonPreview.textContent = formatJsonPreviewList(
      preview.replacementCode,
      getPreviewFileCount()
    );
    elements.archivePreview.textContent = `${preview.outputFileNames.json} · ${preview.outputFileNames.gzip}`;
    elements.referralPreview.textContent = preview.referralNumber
      ? `Preview: ${preview.referralNumber}`
      : "Preview: default referral numbers from source files";
    elements.icnPreview.textContent = preview.icnPreview || "Preview: TEST + 13 generated digits";
    elements.stationIdPreview.textContent = readChecked("randomize-station-id")
      ? "Preview: randomized from all reference stations"
      : state.selectedStationIds.length > 0
        ? `Preview: randomized from ${state.selectedStationIds.join(", ")}`
        : "Preview: no Station ID override";
    updateStationIdMatch();
    elements.paymentAuthorityCodePreview.textContent = preview.optionalOverrides.PaymentAuthorityCode
      ? `Preview: ${preview.optionalOverrides.PaymentAuthorityCode}`
      : "Preview: no Payment Authority Code override";
    applyFieldErrors(preview.fieldErrors || {});
    return preview;
  } catch (error) {
    if (requestId !== state.previewRequestId) return null;
    updateStationIdMatch();
    elements.referralPreview.textContent = error.message;
    elements.referralPreview.classList.add("is-error");
    return null;
  }
}

function schedulePreviewUpdate() {
  window.clearTimeout(state.previewTimer);
  state.previewTimer = window.setTimeout(() => updatePreviews(), 110);
}

function showResultActions(run) {
  state.lastRun = run || null;
  const hasRun = Boolean(run?.outputDir || run?.archivePath || run?.manifestPath);
  elements.resultActions?.classList.toggle("hidden", !hasRun);
  elements.openOutputFolder.disabled = !run?.outputDir;
  elements.openBatchManifest.disabled = !run?.manifestPath;
  elements.copyArchivePath.disabled = !run?.archivePath;
  elements.retryFailedUploads.classList.toggle("hidden", !run?.retryable && run?.status !== "upload-failed");
}

function buildReviewItems(command, payload) {
  return window.ccrsRunReview.buildItems(command, payload, state.sourceInspection);
}

function confirmPreRun(command, payload) {
  return window.ccrsRunReview.confirm({ command, payload, sourceInspection: state.sourceInspection, elements: { overlay: elements.preRunOverlay, summary: elements.preRunSummary, prodWrap: elements.prodConfirmWrap, prodInput: elements.prodConfirmInput, confirmButton: elements.preRunConfirm } });
}

function closePreRun(confirmed) {
  window.ccrsRunReview.close({ overlay: elements.preRunOverlay }, confirmed);
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
    ? "Defaults to the original source file name. You can enter a different base name; the app saves as .xlsx automatically."
    : "Leave blank to keep original JSON names.";
  elements.outputJsonPreview.classList.toggle("hidden", false);
  elements.inputDir.placeholder = isLeie
    ? "Choose a LEIE Excel file (.xlsx, .xls, .xlsm, .xlsb) or a source folder"
    : "Choose the folder that contains source JSON files";
  elements.outputDir.placeholder = isLeie
    ? "Choose where processed .xlsx files should be written"
    : "Choose where JSON and .gz files should be written";
  elements.uploadSubtitle.textContent = isLeie
    ? "Optionally upload the processed LEIE .xlsx file to one or more saved environment profiles."
    : "Optionally upload the final .gz file to the DEV, PPD, or SQA Server. PROD is not available for Referral Files.";
  elements.uploadEnabledLabel.textContent = isLeie
    ? "Upload the .xlsx file after processing"
    : "Upload the .gz file after processing";
  syncWorkflowUploadDirectories();
  syncUploadTargetState();

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
    elements.replacementCode.placeholder = "Original source file name";
    elements.replacementCode.value = state.leieOutputFileName || elements.replacementCode.value;
    state.sourceInspection = null;
    state.sourceListDate = "";
  } else {
    elements.replacementCode.placeholder = "Leave blank to keep original JSON names";
  }

  syncLeieUiState();
  syncLeieValidationSql();
  updatePreviews();
  if (!state.busy) {
    if (isGenerate) {
      setStatus("Ready", "Ready to generate Referral Files. Choose an output folder and generation options, then select Generate Files.");
    } else if (isReferral) {
      setStatus("Ready", "Ready to process Referral Files. Choose the source and output folders, review the settings, then select Run Processing.");
    } else if (isLeie) {
      setStatus("Ready", "Ready for LEIE Data. Choose an Excel file or folder to scan, resolve any duplicate issues, then save the processed file.");
    }
  }
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
  setStatus("Importing", "Reading the selected upload configuration and preparing the available server accounts...");

  try {
    const result = await window.ccrs.importUploadSource(sourcePath);
    applyInfo(result.info);
    setUploadReadyState("ready");
    const summaryText = formatUploadProfileSummary(result.importResult?.profile_summary || result.info?.uploadProfileSummary);
    setStatus(
      "Configuration Ready",
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

async function exportDiagnostics() {
  const outputDir = await window.ccrs.pickDirectory();
  if (!outputDir) return;
  setBusy(true);
  setStatus("Preparing Diagnostics", "Collecting non-sensitive application details and writing the diagnostic report...");
  try {
    const result = await window.ccrs.exportDiagnostics(outputDir);
    setStatus("Completed", `${result.message} The report does not include credentials or source-file contents.`);
  } catch (error) {
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

  if (!(await confirmPreRun("process-leie", payload))) return;

  setBusy(true, true);
  setStatus("Processing LEIE", "Loading the selected workbook, checking duplicate handling, and preparing the processed output...");
  try {
    const result = await window.ccrs.runJob("process-leie", payload);
    if (payload.upload.enabled && payload.upload.targets.length > 0) {
      setStatus("Upload Complete", result.message || "LEIE upload completed.");
    } else {
      setStatus("Ready to Save", result.message || "LEIE file saved.");
    }
    if (result.outputDir || result.archivePath || result.manifestPath) showResultActions(result.run || result);
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
  if (!(await confirmPreRun(command, payload))) {
    setStatus("Ready", "The run was not started. Review or change the settings when ready.");
    return;
  }
  setBusy(true, true);
  setStatus(
    label,
    command === "generate"
      ? `Creating ${Number(payload.fileCount || 0).toLocaleString()} JSON file${Number(payload.fileCount || 0) === 1 ? "" : "s"} with ${Number(payload.referralsPerFile || 0).toLocaleString()} referral${Number(payload.referralsPerFile || 0) === 1 ? "" : "s"} per file...`
      : "Reading the Referral Files, applying the selected changes, and preparing the final archive..."
  );

  try {
    const result = await window.ccrs.runJob(command, payload);
    setStatus(result.retryable ? "Upload Warning" : "Completed", result.message || `${label} completed.`);
    const run = { ...(result.run || {}), archivePath: result.archivePath, manifestPath: result.manifestPath, outputDir: result.outputDir, retryable: result.retryable };
    showResultActions(run);
  } catch (error) {
    setStatus("Failed", error.message);
  } finally {
    setBusy(false);
    resumeLiveListDate(true);
  }
}

async function retryFailedUploads() {
  if (!state.lastRun?.runId) return;
  setBusy(true, true);
  state.currentPhase = "upload";
  setStatus("Retrying Uploads", "Using the existing archive to retry only the failed destinations...");
  try {
    const result = await window.ccrs.runJob("retry-upload", { runId: state.lastRun.runId });
    const run = { ...(result.run || state.lastRun), archivePath: result.archivePath, manifestPath: result.manifestPath, outputDir: result.outputDir, retryable: result.retryable };
    showResultActions(run);
    setStatus(result.retryable ? "Upload Warning" : "Upload Complete", result.message);
  } catch (error) {
    setStatus("Failed", error.message);
  } finally {
    setBusy(false);
    state.currentPhase = "idle";
  }
}

function wireSeocSelector(config) {
  const refresh = () => {
    renderSelectedSeocs(config);
    renderSeocMenu(config);
    schedulePreviewUpdate();
    scheduleUiSettingsSave();
  };
  config.input.addEventListener("input", () => {
    renderSeocMenu(config);
    setSeocMenuOpen(config, true);
  });
  config.input.addEventListener("focus", () => {
    renderSeocMenu(config);
    setSeocMenuOpen(config, true);
  });
  config.input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSeocMenuOpen(config, false);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      renderSeocMenu(config);
      setSeocMenuOpen(config, true);
    }
  });
  config.input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (!config.combobox.contains(document.activeElement)) setSeocMenuOpen(config, false);
    }, 120);
  });
  config.toggle.addEventListener("click", () => {
    renderSeocMenu(config);
    setSeocMenuOpen(config, !config.combobox.classList.contains("is-open"));
    config.input.focus();
  });
  config.menu.addEventListener("click", (event) => {
    const selectorKey = event.target.closest("[data-seoc-selector-key]")?.dataset.seocSelectorKey;
    if (!selectorKey) return;
    state[config.selectedKey] = state[config.selectedKey].includes(selectorKey)
      ? state[config.selectedKey].filter((value) => value !== selectorKey)
      : [...state[config.selectedKey], selectorKey];
    config.input.value = "";
    refresh();
    setSeocMenuOpen(config, true);
  });
  config.selected.addEventListener("click", (event) => {
    const selectorKey = event.target.closest("[data-seoc-selector-key]")?.dataset.seocSelectorKey;
    if (!selectorKey) return;
    state[config.selectedKey] = state[config.selectedKey].filter((value) => value !== selectorKey);
    refresh();
  });
  config.useAll.addEventListener("change", refresh);
}

function setupEventHandlers() {
  setupTabs();
  wireDateControls();
  elements.cancelJob?.addEventListener("click", cancelActiveJob);
  elements.exportDiagnostics?.addEventListener("click", exportDiagnostics);
  elements.preRunCancel?.addEventListener("click", () => closePreRun(false));
  elements.preRunConfirm?.addEventListener("click", () => closePreRun(true));
  elements.prodConfirmInput?.addEventListener("input", () => {
    elements.preRunConfirm.disabled = elements.prodConfirmInput.value.trim().toUpperCase() !== "PROD";
  });
  elements.openOutputFolder?.addEventListener("click", () => state.lastRun?.outputDir && window.ccrs.openPath(state.lastRun.outputDir));
  elements.openBatchManifest?.addEventListener("click", () => state.lastRun?.manifestPath && window.ccrs.openPath(state.lastRun.manifestPath));
  elements.copyArchivePath?.addEventListener("click", () => {
    if (!state.lastRun?.archivePath) return;
    window.ccrs.copyText(state.lastRun.archivePath);
    setStatus("Copied", "The archive path was copied to the clipboard.");
  });
  elements.retryFailedUploads?.addEventListener("click", retryFailedUploads);
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
    "use-ifams-filename-prefix",
    "archive-custom-pattern",
    "archive-custom-text",
    "referral-code",
    "referral-prefix-va",
    "referral-prefix-ifams",
    "referral-prefix-mixed",
    "referral-prefix-custom",
    "custom-referral-prefix",
    "icn-custom-value",
    "ssn-value",
    "match-suffix-length",
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
      if (id === "replacement-code" && state.mainTab === "leie") {
        $(id).value = sanitizeLeieFileNameInput($(id).value);
      }
      if (id === "referral-code") {
        $(id).value = sanitizeReferralNumberInput($(id).value);
      }
      if (id.startsWith("referral-prefix-") || id === "custom-referral-prefix") {
        if (id === "custom-referral-prefix") {
          $(id).value = (String($(id).value || "").match(/[A-Za-z0-9_]/g) || []).join("");
        }
        syncReferralPrefixState();
      }
      if (id === "icn-custom-value") {
        $(id).value = sanitizeIcnInput($(id).value);
      }
      if (id === "override-station-id") {
        scheduleStationOptionsRender();
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
      schedulePreviewUpdate();
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
    scheduleStationOptionsRender();
    setStationMenuOpen(true);
  });
  elements.overrideStationId.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setStationMenuOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      scheduleStationOptionsRender();
      setStationMenuOpen(true);
    }
  });
  elements.overrideStationId.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (!elements.stationIdCombobox.contains(document.activeElement)) {
        setStationMenuOpen(false);
      }
    }, 120);
  });
  elements.stationIdToggle.addEventListener("click", () => {
    scheduleStationOptionsRender();
    setStationMenuOpen(!elements.stationIdCombobox.classList.contains("is-open"));
    elements.overrideStationId.focus();
  });
  elements.stationIdMenu.addEventListener("click", (event) => {
    const stationOption = event.target.closest("[data-station-id]");
    const stationId = stationOption?.dataset.stationId;
    if (!stationId || stationOption.disabled) return;
    if (state.selectedStationIds.includes(stationId)) {
      state.selectedStationIds = state.selectedStationIds.filter((value) => value !== stationId);
    } else {
      state.selectedStationIds.push(stationId);
    }
    elements.overrideStationId.value = "";
    renderSelectedStations();
    scheduleStationOptionsRender();
    setStationMenuOpen(true);
    updateStationIdMatch();
    schedulePreviewUpdate();
    scheduleUiSettingsSave();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!elements.stationIdCombobox.contains(event.target)) {
      setStationMenuOpen(false);
    }
    for (const config of [getSeocSelectorConfig(false), getSeocSelectorConfig(true)]) {
      if (!config.combobox.contains(event.target)) setSeocMenuOpen(config, false);
    }
  });
  wireSeocSelector(getSeocSelectorConfig(false));
  wireSeocSelector(getSeocSelectorConfig(true));

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
  for (const input of document.querySelectorAll('input[name="archive-naming-mode"]')) {
    input.addEventListener("change", () => {
      syncArchiveNamingState();
      updatePreviews();
      scheduleUiSettingsSave();
    });
  }
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
    state.currentPhase = event.phase || state.currentPhase || "processing";
    setJobProgress(event.current, event.total);

    if (event.state === "preflight-complete") {
      setStatus("Preflight Complete", event.message || "The source, output, and business settings passed validation.");
      return;
    }

    if (event.state === "file-loaded") {
      setStatus("Validating LEIE", `${event.filename} loaded. Step 1 of 3 is complete; checking duplicate handling next.`);
      return;
    }

    if (event.state === "duplicates-found") {
      setStatus("Duplicates Found", "Duplicate rows were detected. Choose automatic removal or resolve them manually before saving.");
      return;
    }

    if (event.state === "ready-to-save") {
      setStatus("Ready to Save", `${event.filename} was processed successfully and is ready in the selected output folder.`);
      return;
    }

    if (event.state === "upload-complete") {
      setStatus("Upload Complete", `${event.filename} was uploaded to every selected server successfully.`);
      return;
    }

    const uploadRow = [...document.querySelectorAll(".upload-target")]
      .find((row) => row.dataset.target === event.uploadTarget);

    if (event.state === "upload-target-complete") {
      setUploadTargetStatus(uploadRow, `Upload complete (${event.current}/${event.total}).`, "success");
      const nextMessage = event.current < event.total ? " Moving to the next server." : "";
      setStatus("Uploaded", `${event.filename} uploaded to ${event.uploadTarget} (${event.current} of ${event.total} servers complete).${nextMessage}`);
      return;
    }

    if (event.state === "upload-target-error") {
      setUploadTargetStatus(uploadRow, event.detail || "Upload failed.", "error");
      const nextMessage = event.current < event.total ? " Moving to the next server." : "";
      setStatus("Upload Warning", `Upload to ${event.uploadTarget} failed: ${event.detail || "No additional details were returned."}${nextMessage}`);
      return;
    }

    if (event.state === "uploading") {
      const targetText = event.uploadTarget ? ` to ${event.uploadTarget}` : "";
      setUploadTargetStatus(uploadRow, `Uploading ${event.filename}...`, "working");
      setStatus("Uploading", `Uploading ${event.filename}${targetText} — server ${event.current} of ${event.total}. Keep the app open until verification finishes.`);
      return;
    }

    if (event.state === "packaging") {
      setJobProgress(0, 0);
      setStatus("Packaging", "All Referral Files were processed. Creating the final timestamped gzip archive...");
      return;
    }

    if (event.state === "archive-created") {
      setStatus("Archive Ready", `${event.filename} was created successfully. Finishing cleanup${state.busy ? " and any selected uploads" : ""}...`);
      return;
    }

    if (event.state === "processing") {
      setStatus("Processing LEIE", "Step 2 of 3: removing approved duplicates and writing the processed workbook...");
      return;
    }

    if (event.state === "processed") {
      setStatus("Processing", `Processed ${event.filename} — ${event.current} of ${event.total} files complete.`);
      return;
    }

    if (event.state === "error") {
      setStatus("Batch Stopped", `Could not process ${event.filename}: ${event.detail || "validation failed"}. No incomplete archive will be uploaded.`);
      return;
    }

    setStatus("Working", `Handling ${event.filename} — ${event.current} of ${event.total} complete.`);
  });
}

function cacheElements() {
  Object.assign(elements, {
    appVersionBadge: $("app-version-badge"),
    exportDiagnostics: $("export-diagnostics"),
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
    outputDirHelp: $("output-dir-help"),
    outputSubtitle: $("output-subtitle"),
    overrideDob: $("override-dob"),
    seocCombobox: $("seoc-combobox"),
    seocSearch: $("seoc-search"),
    seocToggle: $("seoc-toggle"),
    seocMenu: $("seoc-menu"),
    selectedSeocs: $("selected-seocs"),
    seocMatch: $("seoc-match"),
    useAllSeocs: $("use-all-seocs"),
    situationalSeocCombobox: $("situational-seoc-combobox"),
    situationalSeocSearch: $("situational-seoc-search"),
    situationalSeocToggle: $("situational-seoc-toggle"),
    situationalSeocMenu: $("situational-seoc-menu"),
    selectedSituationalSeocs: $("selected-situational-seocs"),
    situationalSeocMatch: $("situational-seoc-match"),
    useAllSituationalSeocs: $("use-all-situational-seocs"),
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
    customReferralPrefix: $("custom-referral-prefix"),
    customReferralPrefixRow: $("custom-referral-prefix-row"),
    referralPrefixHelp: $("referral-prefix-help"),
    referralPreview: $("referral-preview"),
    referralDetailsCard: $("referral-details-card"),
    referralsPerFile: $("referrals-per-file"),
    runCard: $("run-card"),
    runGenerate: $("run-generate"),
    runProcess: $("run-process"),
    cancelJob: $("cancel-job"),
    jobProgress: $("job-progress"),
    jobProgressWrap: $("job-progress-wrap"),
    jobProgressLabel: $("job-progress-label"),
    jobProgressValue: $("job-progress-value"),
    resultActions: $("result-actions"),
    openOutputFolder: $("open-output-folder"),
    openBatchManifest: $("open-batch-manifest"),
    copyArchivePath: $("copy-archive-path"),
    retryFailedUploads: $("retry-failed-uploads"),
    sourceCard: $("source-card"),
    sourceFileCount: $("source-file-count"),
    sourceSubtitle: $("source-subtitle"),
    sourceTitle: $("source-title"),
    stationIdPreview: $("station-id-preview"),
    stationIdCombobox: $("station-id-combobox"),
    stationIdMatch: $("station-id-match"),
    stationIdMenu: $("station-id-menu"),
    selectedStations: $("selected-stations"),
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
    archiveCustomFields: $("archive-custom-fields"),
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
    preRunOverlay: $("pre-run-overlay"),
    preRunPanel: $("pre-run-panel"),
    preRunSummary: $("pre-run-summary"),
    preRunCancel: $("pre-run-cancel"),
    preRunConfirm: $("pre-run-confirm"),
    prodConfirmWrap: $("prod-confirm-wrap"),
    prodConfirmInput: $("prod-confirm-input"),
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  captureStaticHelperDefaults();
  setTheme("light");
  startLiveListDateClock();
  syncIcnFieldState();
  syncArchiveNamingState();
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
