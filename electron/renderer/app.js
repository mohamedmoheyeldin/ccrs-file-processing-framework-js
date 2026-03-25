const DATE_PARTS = [
  { key: "year", width: 4, min: 0, max: 9999 },
  { key: "month", width: 2, min: 0, max: 12 },
  { key: "day", width: 2, min: 0, max: 31 },
  { key: "hour", width: 2, min: 0, max: 23 },
  { key: "minute", width: 2, min: 0, max: 59 },
  { key: "second", width: 2, min: 0, max: 59 },
];

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
};

const elements = {};

function $(id) {
  return document.getElementById(id);
}

function addLogLine(message) {
  const line = document.createElement("p");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elements.activityLog.prepend(line);
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
    if (element.id === "clear-activity") {
      continue;
    }
    element.disabled = busy;
  }
}

function readValue(id) {
  return $(id).value.trim();
}

function readChecked(id) {
  return $(id).checked;
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
  if (!state.listDateTouched) {
    return "";
  }
  const values = {};
  for (const part of DATE_PARTS) {
    values[part.key] = normalizeDigits(readValue(`list-date-${part.key}`), part.width).padStart(part.width, "0");
  }
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function markDateTouched() {
  state.listDateTouched = true;
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

function sharedPayload() {
  return {
    outputDir: readValue("output-dir"),
    replacementCode: readValue("replacement-code"),
    archiveBasename: readValue("archive-basename"),
    referralReplacementCode: readValue("referral-code"),
    ssnValue: readValue("ssn-value"),
    listDateOverride: getListDateOverride(),
    clearOutput: readChecked("clear-output"),
    keepProcessedJson: readChecked("keep-processed-json"),
    optionalOverrides: collectOptionalOverrides(),
    upload: collectUploadSettings(),
  };
}

function buildUploadSourceCopy() {
  if (!state.info?.profileSource?.path) {
    return "Upload profile source: no credentials file has been imported yet.";
  }
  return `Upload profile source: ${state.info.profileSource.kind} (${state.info.profileSource.path}). Edit this config directly to update hosts, users, or passwords.`;
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
        <div>
          <strong>${target.name} Server: ${target.serverDisplay || "No server found yet"}</strong>
          <p>Choose the account and remote destination for ${target.name}.</p>
        </div>
        <label class="checkbox-chip">
          <input class="upload-enabled" type="checkbox" />
          <span>Upload to ${target.name}</span>
        </label>
      </div>
      <div class="form-grid two-col">
        <label class="field-block">
          <span>User</span>
          <select class="upload-user">${userOptions}</select>
        </label>
        <label class="field-block">
          <span>Remote Directory</span>
          <input class="upload-path" type="text" value="${target.defaultRemoteDirectory || "/CCRA_Uploads"}" />
        </label>
      </div>
    `;

    elements.uploadTargets.appendChild(wrapper);
  }
}

function getSelectedTemplateMetadata() {
  if (!state.info?.templateMetadata?.length) {
    return null;
  }

  const selected = readValue("template-option");
  return state.info.templateMetadata.find((item) => item.name === selected) || null;
}

function syncGeneratorModeInputs() {
  const fileCount = Math.max(Number(readValue("file-count") || 1), 1);
  const referralsPerFile = Math.max(Number(readValue("referrals-per-file") || 1), 1);

  elements.fileModeSingle.checked = fileCount <= 1;
  elements.fileModeMultiple.checked = fileCount > 1;
  elements.referralModeSingle.checked = referralsPerFile <= 1;
  elements.referralModeMultiple.checked = referralsPerFile > 1;
}

function updateTemplateMeta() {
  const metadata = getSelectedTemplateMetadata();
  if (!metadata) {
    elements.templateMeta.textContent = "Template details will appear here.";
    return;
  }

  const details = [
    `${metadata.referralCount || 0} bundled referral${metadata.referralCount === 1 ? "" : "s"}`,
  ];
  if (metadata.network) {
    details.push(`Network ${metadata.network}`);
  }
  if (metadata.category) {
    details.push(`Category ${metadata.category}`);
  }

  elements.templateMeta.textContent = details.join(" | ");
}

function applyInfo(info) {
  state.info = info;
  elements.uploadProfileSource.textContent = buildUploadSourceCopy();
  elements.uploadReadyPill.textContent = info.profileSource?.path ? "Credentials ready from config file" : "Waiting for imported upload profiles";

  elements.templateOption.innerHTML = "";
  for (const option of info.templateOptions || []) {
    const item = document.createElement("option");
    item.value = option;
    item.textContent = option;
    elements.templateOption.appendChild(item);
  }

  renderUploadTargets(info.uploadTargets || []);
  updateTemplateMeta();
  syncGeneratorModeInputs();
  updateTemplateSummary();
}

function applySourceInspection(inspection) {
  state.sourceInspection = inspection;
  const fileCount = Number(inspection?.fileCount || 0);
  elements.sourceFileCount.textContent = fileCount
    ? `${fileCount} source JSON file${fileCount === 1 ? "" : "s"} selected.`
    : "No JSON files were found in the selected folder.";

  state.sourceListDate = inspection?.firstListDate || "";
  elements.listDateSourceValue.textContent = state.sourceListDate
    ? `Source ListDate: ${state.sourceListDate}`
    : "No source ListDate found yet.";

  if (!state.listDateTouched && state.sourceListDate) {
    setDateParts(state.sourceListDate);
  }

  const defaults = inspection?.defaults || {};
  if (!readValue("referral-code") && defaults.ReferralNumber) {
    elements.referralCode.value = defaults.ReferralNumber;
  }
  if (!readValue("override-network") && defaults.Network) {
    elements.overrideNetwork.value = defaults.Network;
  }
  if (!readValue("override-referral-period") && defaults.ReferralPeriod) {
    elements.overrideReferralPeriod.value = defaults.ReferralPeriod;
  }
  if (!readValue("override-dob") && defaults.DOB) {
    elements.overrideDob.value = defaults.DOB;
  }
  if (!readValue("override-referral-category") && defaults.ReferralCategory) {
    elements.overrideReferralCategory.value = defaults.ReferralCategory;
  }
  if (!readValue("override-referral-date") && defaults.ReferralDate) {
    elements.overrideReferralDate.value = defaults.ReferralDate;
  }
  if (!readValue("override-referral-date-time") && defaults.ReferralDateTime) {
    elements.overrideReferralDateTime.value = defaults.ReferralDateTime;
  }
  if (!readValue("override-referral-expiration-date") && defaults.ReferralExpirationDate) {
    elements.overrideReferralExpirationDate.value = defaults.ReferralExpirationDate;
  }
  if (!readValue("override-referral-last-update-date") && defaults.ReferralLastUpdateDate) {
    elements.overrideReferralLastUpdateDate.value = defaults.ReferralLastUpdateDate;
  }
  if (!readValue("override-referral-consult-id") && defaults.ReferralConsultId) {
    elements.overrideReferralConsultId.value = defaults.ReferralConsultId;
  }

  updatePreviews();
  updateSummary();
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
    updateSummary();
    updatePreviews();
    return;
  }

  try {
    const inspection = await window.ccrs.inspectSource(inputDir);
    applySourceInspection(inspection);
  } catch (error) {
    addLogLine(`Could not inspect source folder: ${error.message}`);
  }
}

async function updatePreviews() {
  if (!state.info) {
    return;
  }

  try {
    const preview = await window.ccrs.getPreview({
      replacementCode: readValue("replacement-code"),
      archiveBasename: readValue("archive-basename"),
      referralReplacementCode: readValue("referral-code"),
      optionalOverrides: collectOptionalOverrides(),
    });

    elements.outputJsonPreview.textContent = preview.replacementCode
      ? `Preview: ${preview.replacementCode}.json`
      : "Preview: original JSON names will be used";
    elements.archivePreview.textContent = `Preview: ${preview.archiveBasename}.gz`;
    elements.referralPreview.textContent = preview.referralNumber
      ? `Preview: ${preview.referralNumber}`
      : "Preview: default referral numbers from source files";
    elements.stationIdPreview.textContent = preview.optionalOverrides.StationID
      ? `Preview: ${preview.optionalOverrides.StationID}`
      : "Preview: no Station ID override";
    elements.paymentAuthorityCodePreview.textContent = preview.optionalOverrides.PaymentAuthorityCode
      ? `Preview: ${preview.optionalOverrides.PaymentAuthorityCode}`
      : "Preview: no Payment Authority Code override";
  } catch (error) {
    elements.referralPreview.textContent = error.message;
  }
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
  updateTemplateMeta();
  syncGeneratorModeInputs();
}

function updateSummary() {
  const inspection = state.sourceInspection;
  const fileCount = Number(inspection?.fileCount || 0);
  const sourceLabel = state.subTab === "generate"
    ? `Generator source: ${Math.max(Number(readValue("file-count") || 1), 1)} generated file(s), ${Math.max(Number(readValue("file-count") || 1), 1) * Math.max(Number(readValue("referrals-per-file") || 1), 1)} total referral(s)`
    : fileCount
      ? `Source files: ${fileCount} JSON file${fileCount === 1 ? "" : "s"} selected`
      : "Source files: none selected";

  const replacementCode = readValue("replacement-code");
  const archiveBasename = readValue("archive-basename") || state.info?.constants?.defaultArchiveBasename || "processed_files";
  const selectedTargets = collectUploadSettings().targets.map((target) => target.server_name);

  elements.summarySource.textContent = sourceLabel;
  elements.summaryOutput.textContent = replacementCode
    ? `Output JSON: ${replacementCode}.json`
    : "Output JSON: original JSON names";
  elements.summaryArchive.textContent = `Archive: ${archiveBasename.replace(/\.(gz|json)$/i, "")}.gz`;
  elements.summaryRetention.textContent = readChecked("keep-processed-json")
    ? "JSON retention: keep formatted JSON files"
    : "JSON retention: remove JSON files after creating the archive";
  elements.summaryUpload.textContent = readChecked("upload-enabled")
    ? selectedTargets.length
      ? `Upload: enabled for ${selectedTargets.join(", ")}`
      : "Upload: enabled but no environment selected yet"
    : "Upload: disabled";
}

function syncWorkflowText() {
  const isReferral = state.mainTab === "referral";
  const isGenerate = state.subTab === "generate" && isReferral;

  elements.heroTitle.textContent = isReferral ? "CCRS File Processing" : "Other CCRS File Processing";
  elements.heroSubtitle.textContent = isReferral
    ? "Use the tabs below to work with referral files and related CCRS processing workflows."
    : "Use the existing-file editor to process non-referral CCRS JSON payloads with the same standalone JavaScript engine.";
  elements.mainTabCopy.textContent = isReferral
    ? "Choose source files, apply targeted JSON updates, and export clean output in one pass."
    : "Use the shared editor workflow for additional CCRS JSON file types without leaving the desktop app.";
  elements.workflowTitle.textContent = isGenerate
    ? "CCRS Referral Generation"
    : isReferral
      ? "CCRS Referral Processing"
      : "CCRS Existing File Processing";
  elements.workflowSubtitle.textContent = isGenerate
    ? "Create fresh referral JSON files from bundled templates, then process and package them."
    : "Choose source files, apply targeted JSON updates, and export clean output in one pass.";
  elements.sourceTitle.textContent = isGenerate ? "Template Output" : "Source";
  elements.sourceSubtitle.textContent = isGenerate
    ? "Generator mode creates fresh files from bundled examples, so no source folder is required."
    : "Pick the folder that contains the incoming JSON files.";
  elements.outputSubtitle.textContent = isGenerate
    ? "Choose where the generated referral JSON files should be saved and how the final output should be kept."
    : "Choose where the processed JSON files should be saved and how the final output should be kept.";

  elements.subtabRow.classList.toggle("hidden", !isReferral);
  elements.generatorCard.classList.toggle("hidden", !isGenerate);
  elements.sourceCard.classList.toggle("hidden", isGenerate);
  elements.runProcess.classList.toggle("hidden", isGenerate);
  elements.runGenerate.classList.toggle("hidden", !isGenerate);
  elements.templateSummaryPill.classList.toggle("hidden", !isGenerate);
  updateSummary();
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

function setupGeneratorControls() {
  elements.fileModeSingle.addEventListener("change", () => {
    if (!elements.fileModeSingle.checked) {
      return;
    }
    elements.fileCount.value = "1";
    updateTemplateSummary();
    updateSummary();
  });

  elements.fileModeMultiple.addEventListener("change", () => {
    if (!elements.fileModeMultiple.checked) {
      return;
    }
    if (Math.max(Number(readValue("file-count") || 1), 1) < 2) {
      elements.fileCount.value = "2";
    }
    updateTemplateSummary();
    updateSummary();
  });

  elements.referralModeSingle.addEventListener("change", () => {
    if (!elements.referralModeSingle.checked) {
      return;
    }
    elements.referralsPerFile.value = "1";
    updateTemplateSummary();
    updateSummary();
  });

  elements.referralModeMultiple.addEventListener("change", () => {
    if (!elements.referralModeMultiple.checked) {
      return;
    }
    if (Math.max(Number(readValue("referrals-per-file") || 1), 1) < 2) {
      elements.referralsPerFile.value = "2";
    }
    updateTemplateSummary();
    updateSummary();
  });
}

function toggleOptionalFields() {
  state.optionalFieldsVisible = !state.optionalFieldsVisible;
  elements.optionalFields.classList.toggle("hidden", !state.optionalFieldsVisible);
  elements.toggleOptionalFields.textContent = state.optionalFieldsVisible ? "Hide Optional Fields" : "Show Optional Fields";
}

function wireDateControls() {
  for (const field of document.querySelectorAll(".date-field")) {
    const partKey = field.dataset.datePart;
    const input = field.querySelector("input");
    input.addEventListener("input", () => {
      markDateTouched();
      const part = DATE_PARTS.find((entry) => entry.key === partKey);
      input.value = normalizeDigits(input.value, part.width);
      updateSummary();
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
      updateSummary();
    });
    for (const stepButton of field.querySelectorAll(".date-step")) {
      stepButton.addEventListener("click", () => {
        adjustDatePart(partKey, Number(stepButton.dataset.step));
        updateSummary();
      });
    }
  }
}

async function refreshInfo() {
  const info = await window.ccrs.getInfo();
  applyInfo(info);
  updateSummary();
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
  updateSummary();
}

async function importUploadSource() {
  const sourcePath = await window.ccrs.pickFile([{ name: "Upload Config", extensions: ["ini", "json"] }]);
  if (!sourcePath) {
    return;
  }

  setBusy(true);
  setStatus("Importing", "Reading upload configuration...");
  addLogLine(`Importing upload profiles from ${sourcePath}`);

  try {
    const result = await window.ccrs.importUploadSource(sourcePath);
    applyInfo(result.info);
    setStatus("Completed", "Upload profiles imported.");
    addLogLine("Upload profiles imported successfully.");
  } catch (error) {
    setStatus("Failed", error.message);
    addLogLine(`Import failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function runProcess() {
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
  const generatedListDate = nowAsListDate();
  state.listDateTouched = true;
  setDateParts(generatedListDate);
  const payload = {
    ...sharedPayload(),
    templateOption: readValue("template-option"),
    fileCount: Number(readValue("file-count")),
    referralsPerFile: Number(readValue("referrals-per-file")),
  };
  await runJob("generate", payload, "Generating");
}

async function runJob(command, payload, label) {
  setBusy(true);
  setStatus(label, `${label} files with the standalone JavaScript backend...`);
  addLogLine(`${label} started.`);

  try {
    const result = await window.ccrs.runJob(command, payload);
    setStatus("Completed", result.message || `${label} completed.`);
    addLogLine(result.message || `${label} completed.`);
  } catch (error) {
    setStatus("Failed", error.message);
    addLogLine(`${label} failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

function setupEventHandlers() {
  setupTabs();
  setupGeneratorControls();
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
      if (id === "file-count" || id === "referrals-per-file") {
        updateTemplateSummary();
      }
      updateSummary();
      updatePreviews();
    });
  }

  elements.inputDir.addEventListener("change", inspectSourceFolder);
  elements.inputDir.addEventListener("blur", inspectSourceFolder);
  elements.keepProcessedJson.addEventListener("change", updateSummary);
  elements.clearOutput.addEventListener("change", updateSummary);
  elements.keepExistingFiles.addEventListener("change", updateSummary);
  elements.uploadEnabled.addEventListener("change", updateSummary);
  elements.templateOption.addEventListener("change", updateTemplateSummary);
  elements.templateOption.addEventListener("change", updateSummary);
  elements.toggleOptionalFields.addEventListener("click", toggleOptionalFields);
  elements.runProcess.addEventListener("click", runProcess);
  elements.runGenerate.addEventListener("click", runGenerate);
  elements.importUploadSource.addEventListener("click", importUploadSource);
  elements.openUserGuide.addEventListener("click", () => {
    if (state.info?.docs?.userGuidePath) {
      window.ccrs.openPath(state.info.docs.userGuidePath);
    }
  });
  elements.clearActivity.addEventListener("click", () => {
    elements.activityLog.innerHTML = "";
  });

  elements.uploadTargets.addEventListener("change", updateSummary);
  elements.uploadTargets.addEventListener("input", updateSummary);

  window.ccrs.onBackendEvent((event) => {
    if (event.type !== "progress") {
      return;
    }

    if (event.state === "uploading") {
      const targetText = event.uploadTarget ? ` to ${event.uploadTarget}` : "";
      addLogLine(`Uploading ${event.filename}${targetText} (${event.current}/${event.total}).`);
      setStatus("Uploading", `Uploading ${event.filename}${targetText}...`);
      return;
    }

    if (event.state === "error") {
      addLogLine(`Error while handling ${event.filename} (${event.current}/${event.total}).`);
      setStatus("Failed", `Error while handling ${event.filename}.`);
      return;
    }

    addLogLine(`Processed ${event.filename} (${event.current}/${event.total}).`);
    setStatus("Working", `Handling ${event.filename} (${event.current}/${event.total})`);
  });
}

function cacheElements() {
  Object.assign(elements, {
    activityLog: $("activity-log"),
    archivePreview: $("archive-preview"),
    clearActivity: $("clear-activity"),
    clearOutput: $("clear-output"),
    generatorCard: $("generator-card"),
    generatorFileCountDisplay: $("generator-file-count-display"),
    generatorReferralsPerFileDisplay: $("generator-referrals-per-file-display"),
    generatorTotalReferralsDisplay: $("generator-total-referrals-display"),
    fileCount: $("file-count"),
    fileModeMultiple: $("file-mode-multiple"),
    fileModeSingle: $("file-mode-single"),
    heroSubtitle: $("hero-subtitle"),
    heroTitle: $("hero-title"),
    importUploadSource: $("import-upload-source"),
    inputDir: $("input-dir"),
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
    paymentAuthorityCodePreview: $("payment-authority-code-preview"),
    referralCode: $("referral-code"),
    referralModeMultiple: $("referral-mode-multiple"),
    referralModeSingle: $("referral-mode-single"),
    referralPreview: $("referral-preview"),
    referralsPerFile: $("referrals-per-file"),
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
    summaryArchive: $("summary-archive"),
    summaryOutput: $("summary-output"),
    summaryRetention: $("summary-retention"),
    summarySource: $("summary-source"),
    summaryUpload: $("summary-upload"),
    templateOption: $("template-option"),
    templateMeta: $("template-meta"),
    templateSummaryPill: $("template-summary-pill"),
    toggleOptionalFields: $("toggle-optional-fields"),
    uploadEnabled: $("upload-enabled"),
    uploadProfileSource: $("upload-profile-source"),
    uploadReadyPill: $("upload-ready-pill"),
    uploadTargets: $("upload-targets"),
    workflowSubtitle: $("workflow-subtitle"),
    workflowTitle: $("workflow-title"),
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  setTheme("light");
  setDateParts("0000-00-00 00:00:00");
  setupEventHandlers();
  syncWorkflowText();
  await refreshInfo();
  updateSummary();
  addLogLine("Electron UI ready.");
});
