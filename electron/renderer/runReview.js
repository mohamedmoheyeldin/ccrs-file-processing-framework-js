(function exposeRunReview(globalObject) {
  let pendingResolver = null;

  function buildItems(command, payload, sourceInspection) {
    const uploads = (payload.upload?.enabled ? payload.upload.targets : []) || [];
    const total = command === "generate"
      ? Number(payload.fileCount || 0) * Number(payload.referralsPerFile || 0)
      : Number(sourceInspection?.fileCount || 0);
    const stations = payload.identityOptions?.randomizeStationId
      ? "Random from all approved stations"
      : (payload.identityOptions?.selectedStationIds || []).join(", ") || "Mix approved station values";
    const referralPrefixMode = payload.identityOptions?.referralPrefixMode || "va";
    const referralPrefix = referralPrefixMode === "ifams"
      ? "iFAMS for every referral"
      : referralPrefixMode === "mixed"
        ? "Alternate VA and iFAMS"
        : referralPrefixMode === "custom"
          ? `${payload.identityOptions?.customReferralPrefix || "Custom"} for every referral`
          : "VA for every referral";
    const items = [
      ["Workflow", command === "generate" ? "Generate Referral Files" : command === "process-leie" ? "Process LEIE Data" : "Process Referral Files"],
      ["Source", payload.inputDir || (command === "generate" ? "Built-in referral templates" : "Not selected")],
      ["Output", payload.outputDir || "Not selected"],
      [command === "generate" ? "Total referrals" : "Source files", total.toLocaleString()],
      ["Output behavior", "Overwrite matching filenames after validation; preserve unrelated files"],
      ["Archive", command === "process-leie" ? payload.outputFileName || "Generated workbook name" : (document.querySelector("#archive-preview")?.textContent || "Gzip and selected JSON outputs")],
      ["Referral prefix", command === "process-leie" ? "Not applicable" : referralPrefix],
      ["Stations", command === "process-leie" ? "Not applicable" : stations],
      ["Upload destinations", uploads.length ? uploads.map((item) => `${item.server_name}: ${item.remote_directory}`).join("; ") : "Local output only"],
    ];
    const situationalSeocCount = payload.identityOptions?.useAllSituationalSeocs
      ? "All Situational values"
      : (payload.identityOptions?.selectedSituationalSeocKeys || []).length;
    if (situationalSeocCount) {
      items.push([
        "Situational SEOC caution",
        `${situationalSeocCount} selected. Most referrals use regular SEOC only; confirm this Situational choice is required.`,
      ]);
    }
    const networkValues = payload.identityOptions?.selectedNetworks || [];
    items.push([
      "Network plan",
      networkValues.length === 1
        ? `${networkValues[0]} will be used for every referral.`
        : networkValues.length > 1
          ? `${networkValues.join(", ")} will be mixed across referrals.`
          : "Keep each referral's source Network automatically.",
    ]);
    return items;
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
