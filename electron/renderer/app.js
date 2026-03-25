const state = {
  info: null,
  busy: false,
};

const activityLog = document.getElementById("activity-log");
const statusBadge = document.getElementById("status-badge");
const statusMessage = document.getElementById("status-message");

function addLogLine(message) {
  const line = document.createElement("p");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  activityLog.prepend(line);
}

function setStatus(label, message) {
  statusBadge.textContent = label;
  statusMessage.textContent = message;
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
  return document.getElementById(id).value.trim();
}

function readChecked(id) {
  return document.getElementById(id).checked;
}

function sharedPayload() {
  return {
    outputDir: readValue("output-dir"),
    replacementCode: readValue("replacement-code"),
    archiveBasename: readValue("archive-basename"),
    referralReplacementCode: readValue("referral-code"),
    ssnValue: readValue("ssn-value"),
    listDateOverride: readValue("list-date-override"),
    clearOutput: readChecked("clear-output"),
    keepProcessedJson: readChecked("keep-processed-json"),
    optionalOverrides: {
      StationID: readValue("override-station-id"),
      PaymentAuthorityCode: readValue("override-payment-authority-code"),
      ReferralPeriod: readValue("override-referral-period"),
      Network: readValue("override-network"),
    },
    upload: collectUploadSettings(),
  };
}

function collectUploadSettings() {
  const enabled = readChecked("upload-enabled");
  const targets = [];

  for (const row of document.querySelectorAll(".upload-target")) {
    const targetName = row.dataset.target;
    const useTarget = row.querySelector(".upload-enabled").checked;
    if (!useTarget) {
      continue;
    }

    targets.push({
      server_name: targetName,
      user_name: row.querySelector(".upload-user").value,
      remote_directory: row.querySelector(".upload-path").value.trim(),
    });
  }

  return { enabled, targets };
}

function applyInfo(info) {
  state.info = info;
  document.getElementById("runtime-root").textContent = info.runtimeRoot || "Unavailable";
  const profileSource = info.profileSource?.path
    ? `${info.profileSource.kind}: ${info.profileSource.path}`
    : "Not configured";
  document.getElementById("upload-source").textContent = profileSource;

  const templateSelect = document.getElementById("template-option");
  templateSelect.innerHTML = "";
  for (const option of info.templateOptions || []) {
    const item = document.createElement("option");
    item.value = option;
    item.textContent = option;
    templateSelect.appendChild(item);
  }

  renderUploadTargets(info.uploadTargets || []);
}

function renderUploadTargets(targets) {
  const container = document.getElementById("upload-targets");
  container.innerHTML = "";

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
          <strong>${target.name}</strong>
          <p class="upload-target-meta">${target.serverDisplay || "No server found yet"}</p>
        </div>
        <label class="checkbox"><input class="upload-enabled" type="checkbox" /> Use</label>
      </div>
      <div class="form-grid">
        <label>
          <span>User</span>
          <select class="upload-user">${userOptions}</select>
        </label>
        <label>
          <span>Remote Directory</span>
          <input class="upload-path" type="text" value="${target.defaultRemoteDirectory || "/CCRA_Uploads"}" />
        </label>
      </div>
    `;

    container.appendChild(wrapper);
  }
}

async function refreshInfo() {
  const info = await window.ccrs.getInfo();
  applyInfo(info);
}

async function pickDirectory(targetId) {
  const selected = await window.ccrs.pickDirectory();
  if (selected) {
    document.getElementById(targetId).value = selected;
  }
}

async function importUploadSource() {
  const sourcePath = await window.ccrs.pickFile([
    { name: "Upload Config", extensions: ["ini", "json"] },
  ]);

  if (!sourcePath) {
    return;
  }

  setBusy(true);
  setStatus("Importing", "Reading upload configuration...");
  addLogLine(`Importing upload profiles from ${sourcePath}`);

  try {
    const result = await window.ccrs.importUploadSource(sourcePath);
    applyInfo(result.info);
    setStatus("Ready", "Upload profiles imported.");
    addLogLine("Upload profiles imported successfully.");
  } catch (error) {
    setStatus("Failed", error.message);
    addLogLine(`Import failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function runProcess() {
  const payload = {
    ...sharedPayload(),
    inputDir: readValue("input-dir"),
  };
  await runJob("process", payload, "Processing");
}

async function runGenerate() {
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
  setStatus(label, `${label} files with the preserved backend logic...`);
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

function setupTabs() {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      const selected = tab.dataset.tab;

      for (const currentTab of document.querySelectorAll(".tab")) {
        currentTab.classList.toggle("is-active", currentTab === tab);
      }

      for (const panel of document.querySelectorAll(".tab-panel")) {
        panel.classList.toggle("is-active", panel.dataset.panel === selected);
      }
    });
  }
}

function setupEventHandlers() {
  setupTabs();

  for (const button of document.querySelectorAll("[data-pick]")) {
    button.addEventListener("click", () => pickDirectory(button.dataset.pick));
  }

  document.getElementById("run-process").addEventListener("click", runProcess);
  document.getElementById("run-generate").addEventListener("click", runGenerate);
  document.getElementById("import-upload-source").addEventListener("click", importUploadSource);
  document.getElementById("open-runtime-root").addEventListener("click", () => {
    if (state.info?.runtimeRoot) {
      window.ccrs.openPath(state.info.runtimeRoot);
    }
  });
  document.getElementById("clear-activity").addEventListener("click", () => {
    activityLog.innerHTML = "";
  });

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
      return;
    }

    addLogLine(`Processed ${event.filename} (${event.current}/${event.total}).`);
    setStatus("Working", `Handling ${event.filename} (${event.current}/${event.total})`);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupEventHandlers();
  await refreshInfo();
  addLogLine("Electron UI ready.");
});
