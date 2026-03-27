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
};

const elements = {};
const STATIC_HELPER_IDS = [
  "ssnHelp",
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

function readValue(id) {
  return $(id).value.trim();
}

function readChecked(id) {
  return $(id).checked;
}

function sanitizeStationIdInput(value) {
  return ((String(value || "").match(/[A-Za-z0-9]/g) || []).join("")).slice(0, 5);
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

function sharedPayload() {
  return {
    outputDir: readValue("output-dir"),
    replacementCode: readValue("replacement-code"),
    archiveBasename: readValue("archive-basename"),
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
    });
    pathInput.addEventListener("input", () => {
      setUploadTargetStatus(wrapper);
      updatePreviews();
    });
    enabledInput.addEventListener("change", () => {
      setUploadTargetStatus(wrapper);
      updatePreviews();
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
  elements.appVersionBadge.textContent = info.appVersionLabel || "";
  elements.appVersionBadge.classList.toggle("hidden", !info.appVersionLabel);
  document.title = info.appVersionLabel
    ? `CCRS File Processing Framework | ${info.appVersionLabel}`
    : "CCRS File Processing Framework";
  setUploadReadyState("idle");
  renderUploadTargets(info.uploadTargets || []);
  applyGeneratorDefaults();
  updateTemplateSummary();
  updatePreviews();
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
    elements.paymentAuthorityCodePreview.textContent = preview.optionalOverrides.PaymentAuthorityCode
      ? `Preview: ${preview.optionalOverrides.PaymentAuthorityCode}`
      : "Preview: no Payment Authority Code override";
    applyFieldErrors(preview.fieldErrors || {});
    return preview;
  } catch (error) {
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
      for (const current of document.querySelectorAll("[data-main-tab]")) {
        current.classList.toggle("is-active", current === button);
      }
      if (state.mainTab !== "referral") {
        state.subTab = "edit";
      }
      for (const current of document.querySelectorAll("[data-sub-tab]")) {
        current.classList.toggle("is-active", current.dataset.subTab === state.subTab);
      }
      syncWorkflowText();
    });
  }

  for (const button of document.querySelectorAll("[data-sub-tab]")) {
    button.addEventListener("click", () => {
      state.subTab = button.dataset.subTab;
      for (const current of document.querySelectorAll("[data-sub-tab]")) {
        current.classList.toggle("is-active", current === button);
      }
      syncWorkflowText();
    });
  }
}

function toggleOptionalFields() {
  state.optionalFieldsVisible = !state.optionalFieldsVisible;
  elements.optionalFields.classList.toggle("hidden", !state.optionalFieldsVisible);
  elements.toggleOptionalFields.textContent = state.optionalFieldsVisible ? "Hide Optional Fields" : "Show Optional Fields";
  elements.toggleOptionalFields.classList.toggle("is-active", state.optionalFieldsVisible);
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
    button.addEventListener("click", () => setTheme(button.dataset.theme));
  }

  for (const button of document.querySelectorAll("[data-pick]")) {
    button.addEventListener("click", () => pickDirectory(button.dataset.pick));
  }

  for (const id of [
    "output-dir",
    "replacement-code",
    "archive-basename",
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
    });
  }

  elements.overrideNetwork.addEventListener("change", () => {
    updatePreviews();
  });
  for (const input of document.querySelectorAll('input[name="icn-mode"]')) {
    input.addEventListener("change", () => {
      syncIcnFieldState();
      updatePreviews();
    });
  }
  elements.uploadEnabled.addEventListener("change", () => {
    updatePreviews();
  });

  elements.inputDir.addEventListener("change", inspectSourceFolder);
  elements.inputDir.addEventListener("blur", inspectSourceFolder);
  elements.toggleOptionalFields.addEventListener("click", toggleOptionalFields);
  elements.runProcess.addEventListener("click", runProcess);
  elements.runGenerate.addEventListener("click", runGenerate);
  elements.importUploadSource.addEventListener("click", importUploadSource);
  elements.openUserGuide.addEventListener("click", () => {
    if (state.info?.docs?.userGuidePath) {
      window.ccrs.openPath(state.info.docs.userGuidePath);
    }
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
  syncIcnFieldState();
});
