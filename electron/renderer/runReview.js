(function exposeRunReview(globalObject) {
  let pendingResolver = null;

  function buildItems(command, payload, sourceInspection) {
    const uploads = (payload.upload?.enabled ? payload.upload.targets : []) || [];
    const total = command === "generate"
      ? Number(payload.fileCount || 0) * Number(payload.referralsPerFile || 0)
      : Number(sourceInspection?.fileCount || 0);
    const stations = payload.identityOptions?.randomizeStationId
      ? "Random from all approved stations"
      : (payload.identityOptions?.selectedStationIds || []).join(", ") || "Keep source station values";
    return [
      ["Workflow", command === "generate" ? "Generate Referral Files" : command === "process-leie" ? "Process LEIE Data" : "Process Referral Files"],
      ["Source", payload.inputDir || (command === "generate" ? "Built-in referral templates" : "Not selected")],
      ["Output", payload.outputDir || "Not selected"],
      [command === "generate" ? "Total referrals" : "Source files", total.toLocaleString()],
      ["Output behavior", payload.clearOutput ? "Delete output folder contents after staging succeeds" : "Keep existing files; stop on any name collision"],
      ["Archive", command === "process-leie" ? payload.outputFileName || "Generated workbook name" : `${payload.archiveBasename || "referrals"}_YYYYMMDD_HHMMSS.gz`],
      ["Stations", command === "process-leie" ? "Not applicable" : stations],
      ["Upload destinations", uploads.length ? uploads.map((item) => `${item.server_name}: ${item.remote_directory}`).join("; ") : "Local output only"],
    ];
  }

  function confirm({ command, payload, sourceInspection, elements }) {
    elements.summary.innerHTML = "";
    for (const [label, value] of buildItems(command, payload, sourceInspection)) {
      const item = document.createElement("div");
      item.className = "pre-run-summary-item";
      const strong = document.createElement("strong");
      strong.textContent = label;
      const span = document.createElement("span");
      span.textContent = value;
      item.append(strong, span);
      elements.summary.appendChild(item);
    }
    const needsProd = Boolean(payload.upload?.enabled && payload.upload.targets?.some((target) => String(target.server_name).toUpperCase() === "PROD"));
    elements.prodWrap.classList.toggle("hidden", !needsProd);
    elements.prodInput.value = "";
    elements.confirmButton.disabled = needsProd;
    elements.overlay.classList.remove("hidden");
    document.body.classList.add("modal-open");
    return new Promise((resolve) => {
      pendingResolver = resolve;
      window.requestAnimationFrame(() => (needsProd ? elements.prodInput : elements.confirmButton).focus());
    });
  }

  function close(elements, confirmed) {
    elements.overlay.classList.add("hidden");
    document.body.classList.remove("modal-open");
    const resolve = pendingResolver;
    pendingResolver = null;
    resolve?.(Boolean(confirmed));
  }

  globalObject.ccrsRunReview = { buildItems, close, confirm };
})(window);
