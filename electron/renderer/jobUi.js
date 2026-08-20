(function exposeJobUi(globalObject) {
  function syncWorkflowProgress(statusLabel = "Idle") {
    const normalized = String(statusLabel).toLowerCase();
    let activeStep = normalized.includes("upload") || normalized.includes("uploaded") ? 4
      : normalized.includes("process") || normalized.includes("generat") || normalized.includes("working") ? 3
        : normalized.includes("valid") || normalized.includes("duplicate") ? 2
          : normalized.includes("config") ? 1
            : 0;
    if (normalized.includes("complete") || normalized.includes("ready to save")) activeStep = 4;
    const steps = [...document.querySelectorAll("[data-workflow-step]")];
    steps.forEach((step, index) => {
      step.classList.toggle("is-complete", index < activeStep || normalized.includes("complete"));
      step.classList.toggle("is-active", index === activeStep && !normalized.includes("complete"));
    });
  }

  function updateProgress(progressElement, busy, current = 0, total = 0) {
    if (!progressElement) return;
    const hasProgress = Number(total) > 0;
    progressElement.classList.toggle("hidden", !busy);
    progressElement.max = hasProgress ? Number(total) : 100;
    progressElement.value = hasProgress ? Math.min(Number(current || 0), Number(total)) : 0;
  }

  function updateBusyControls({ busy, cancellable, cancelRequested, cancelButton }) {
    for (const element of document.querySelectorAll("button, input, select")) {
      if (element.dataset.allowWhileBusy === "true") continue;
      element.disabled = busy;
    }
    cancelButton?.classList.toggle("hidden", !cancellable);
    if (cancelButton) cancelButton.disabled = !cancellable || cancelRequested;
  }

  globalObject.ccrsJobUi = { syncWorkflowProgress, updateBusyControls, updateProgress };
})(window);
