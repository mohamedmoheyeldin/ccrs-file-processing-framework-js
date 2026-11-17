import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVE_STATUS_PATTERN,
  ARCHIVE_CUSTOM_VALUES,
  DATE_PARTS,
  DEFAULT_FORM,
  NETWORK_VALUES,
  REFERRAL_DATE_FIELDS,
  buildCatalogs,
  buildReviewItems,
  currentReferralDates,
  formFromSettings,
  formatBytes,
  formatJsonPreviewList,
  formatListDate,
  formatUploadProfileSummary,
  getIcnConstants,
  isExcelPath,
  keepCharacters,
  needsProdConfirmation,
  normalizeDigits,
  nowAsListDate,
  parseListDate,
  plural,
  sanitizeIcnInput,
  sanitizeLeieFileNameInput,
  sanitizeReferralNumberInput,
  cleanErrorMessage,
} from "./logic";

const { LEIE_DEFAULT_UPLOAD_DIRECTORY, REFERRAL_DEFAULT_UPLOAD_DIRECTORY, resolveUploadDirectoryForWorkflow } =
  window.ccrsUploadDefaults;

const READY_MESSAGES = {
  generate: "Ready to generate Referral Files. Choose an output folder and generation options, then select Generate Files.",
  referral: "Ready to process Referral Files. Choose the source and output folders, review the settings, then select Run Processing.",
  leie: "Ready for LEIE Data. Choose an Excel file or folder to scan, resolve any duplicate issues, then save the processed file.",
};

const EMPTY_SOURCE = {
  fileCountText: "No source folder selected.",
  detailText: "Choose a source folder to begin scanning files.",
};

function setIfEmpty(form, key, value) {
  if (value && !String(form[key] || "").trim()) form[key] = String(value);
}

/** Fills generator defaults and, when requested, the current referral dates. */
function withGeneratorDefaults(form, info) {
  const next = { ...form };
  const defaults = info?.generatorDefaults || {};
  setIfEmpty(next, "overrideReferralPeriod", defaults.ReferralPeriod);
  setIfEmpty(next, "overrideReferralCategory", defaults.ReferralCategory);
  if (next.mainTab === "referral" && next.subTab === "generate" && next.useCurrentReferralDates) {
    Object.assign(next, currentReferralDates(next.overrideReferralPeriod));
  }
  setIfEmpty(next, "overrideReferralConsultId", defaults.ReferralConsultId);
  return next;
}

/** Merges saved per-target upload settings with the targets the backend currently knows about. */
function buildUploadTargets(info, savedTargets = {}, mainTab) {
  const result = {};
  for (const target of info?.uploadTargets || []) {
    const saved = savedTargets[target.name] || {};
    const users = target.users || [];
    const referralDefault = target.defaultRemoteDirectory || REFERRAL_DEFAULT_UPLOAD_DIRECTORY;
    result[target.name] = {
      enabled: Boolean(saved.enabled),
      userName: users.includes(saved.userName) ? saved.userName : users[0] || "",
      remoteDirectory: resolveUploadDirectoryForWorkflow(saved.remoteDirectory || "", mainTab, referralDefault),
    };
  }
  return result;
}

function resolveUploadDirectories(uploadTargets, info, mainTab) {
  const result = {};
  for (const target of info?.uploadTargets || []) {
    const current = uploadTargets[target.name];
    if (!current) continue;
    result[target.name] = {
      ...current,
      remoteDirectory: resolveUploadDirectoryForWorkflow(
        current.remoteDirectory,
        mainTab,
        target.defaultRemoteDirectory || REFERRAL_DEFAULT_UPLOAD_DIRECTORY
      ),
    };
  }
  return result;
}

export function useController() {
  const [form, setFormState] = useState(DEFAULT_FORM);
  const [info, setInfo] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusyState] = useState(false);
  const [cancellable, setCancellable] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [status, setStatusState] = useState({ label: "Ready", message: READY_MESSAGES.referral });
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [phase, setPhase] = useState("idle");
  const [sourceInspection, setSourceInspection] = useState(null);
  const [sourceSummary, setSourceSummary] = useState(EMPTY_SOURCE);
  const [leie, setLeie] = useState({ inspection: null, error: "", scanning: false });
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [listDate, setListDate] = useState(() => parseListDate(nowAsListDate()));
  const [uploadStatus, setUploadStatus] = useState({});
  const [uploadResults, setUploadResultsState] = useState([]);
  const [uploadImportState, setUploadImportState] = useState("idle");
  const [lastRun, setLastRun] = useState(null);
  const [manifestPending, setManifestPending] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  // "announce" is the one-time notice after an update; "view" is opened from the header link.
  const [releaseMode, setReleaseMode] = useState("announce");
  const [preRun, setPreRun] = useState(null);
  const [sqlCopy, setSqlCopy] = useState({ tone: "neutral", message: "Copy this SQL and run it in SQL Server for the selected environment." });
  const [stationQuery, setStationQuery] = useState("");

  // Mutable mirrors so async flows always read the latest values.
  const formRef = useRef(form);
  const infoRef = useRef(info);
  const busyRef = useRef(false);
  const phaseRef = useRef("idle");
  const listDateRef = useRef(listDate);
  const listDateTouchedRef = useRef(false);
  const sourceInspectionRef = useRef(null);
  const leieRef = useRef({ inspection: null, error: "", lastScannedInput: "", requestId: 0 });
  const previewCacheRef = useRef({ signature: "", result: null, requestId: 0 });
  const lastSavedSignatureRef = useRef("");
  const acknowledgedReleaseKeyRef = useRef("");
  const lastRunRef = useRef(null);
  const uploadResultsRef = useRef([]);
  const preRunResolverRef = useRef(null);
  const archivePreviewRef = useRef("");

  formRef.current = form;
  infoRef.current = info;
  listDateRef.current = listDate;

  const catalogs = useMemo(() => buildCatalogs(info), [info]);
  const catalogsRef = useRef(catalogs);
  catalogsRef.current = catalogs;

  const referralUploadTargets = useMemo(
    () => new Set(info?.workflowPolicy?.referralUploadTargets || ["SQA", "DEV", "PPD"]),
    [info]
  );
  const isTargetAvailable = useCallback(
    (targetName, mainTab = formRef.current.mainTab) =>
      mainTab !== "referral" || referralUploadTargets.has(String(targetName || "").trim().toUpperCase()),
    [referralUploadTargets]
  );

  const setForm = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(formRef.current) : { ...formRef.current, ...updater };
    formRef.current = next;
    setFormState(next);
  }, []);

  const setStatus = useCallback((label, message) => {
    setStatusState({
      label: String(label || "Ready").trim(),
      message: cleanErrorMessage(message) || "The app is ready.",
    });
  }, []);

  /** Per-server upload results for the current run: [{ serverName, status, message, ... }]. */
  const setUploadResults = useCallback((results) => {
    const next = Array.isArray(results) ? results : [];
    uploadResultsRef.current = next;
    setUploadResultsState(next);
  }, []);

  const updateLiveUploadResult = useCallback((serverName, patch) => {
    if (!serverName) return;
    const results = [...uploadResultsRef.current];
    const index = results.findIndex((item) => item.serverName === serverName && (item.status === "pending" || item.status === "uploading"));
    if (index >= 0) results[index] = { ...results[index], ...patch };
    else results.push({ serverName, ...patch });
    setUploadResults(results);
  }, [setUploadResults]);

  const setJobPhase = useCallback((value) => {
    phaseRef.current = value;
    setPhase(value);
  }, []);

  const setBusy = useCallback((value, canCancel = false) => {
    busyRef.current = value;
    setBusyState(value);
    setCancellable(Boolean(value && canCancel));
    if (!value) {
      setCancelRequested(false);
      setJobPhase("idle");
    }
    setProgress({ current: 0, total: 0 });
  }, [setJobPhase]);

  const activityActive = busy || ACTIVE_STATUS_PATTERN.test(status.label);

  // ---------------------------------------------------------------------------------------------
  // Payload builders
  // ---------------------------------------------------------------------------------------------

  const collectUploadSettings = useCallback((current = formRef.current) => {
    const targets = [];
    for (const target of infoRef.current?.uploadTargets || []) {
      if (!isTargetAvailable(target.name, current.mainTab)) continue;
      const settings = current.uploadTargets[target.name];
      if (!settings?.enabled) continue;
      targets.push({
        server_name: target.name,
        user_name: settings.userName,
        remote_directory: String(settings.remoteDirectory || "").trim(),
      });
    }
    return { enabled: Boolean(current.uploadEnabled), targets };
  }, [isTargetAvailable]);

  const collectOptionalOverrides = useCallback((current = formRef.current) => {
    const rawValues = {
      ReferralPeriod: current.overrideReferralPeriod.trim(),
      DOB: current.randomizeDob ? "" : current.overrideDob.trim(),
      ReferralCategory: current.overrideReferralCategory.trim(),
      ReferralDate: current.overrideReferralDate.trim(),
      ReferralDateTime: current.overrideReferralDateTime.trim(),
      ReferralExpirationDate: current.overrideReferralExpirationDate.trim(),
      ReferralLastUpdateDate: current.overrideReferralLastUpdateDate.trim(),
      ReferralConsultId: current.overrideReferralConsultId.trim(),
    };
    if (current.subTab === "generate" && current.useCurrentReferralDates) {
      for (const key of Object.values(REFERRAL_DATE_FIELDS)) delete rawValues[key];
    }
    return Object.fromEntries(Object.entries(rawValues).filter(([, value]) => value));
  }, []);

  const collectArchiveNamingOptions = (current) => ({
    mode: current.archiveNamingMode,
    customValues: ARCHIVE_CUSTOM_VALUES.map((entry) => entry.value).filter((value) => current.archiveCustomValues.includes(value)),
    customText: current.archiveCustomText.trim(),
    masterFileName: current.masterFileName.trim(),
  });

  const collectIdentityOptions = (current) => ({
    randomizeSsn: current.randomizeSsn,
    randomizeDob: current.randomizeDob,
    selectedPaymentCodes: [...current.selectedPaymentCodes],
    useAllPaymentCodes: current.useAllPaymentCodes,
    randomizeStationId: current.randomizeStationId,
    selectedStationIds: current.randomizeStationId ? [] : [...current.selectedStationIds],
    selectedNetworks: current.useAllNetworks ? [...NETWORK_VALUES] : [...current.selectedNetworks],
    selectedSeocKeys: [...current.selectedSeocKeys],
    useAllSeocs: current.useAllSeocs,
    selectedSituationalSeocKeys: [...current.selectedSituationalSeocKeys],
    useAllSituationalSeocs: current.useAllSituationalSeocs,
    referralPrefixMode: current.referralPrefixMode,
    customReferralPrefix: current.customReferralPrefix.trim(),
    referralPrefix: current.referralPrefixMode === "ifams" ? "iFAMS" : "VA",
    matchSuffixLength: Number(current.matchSuffixLength),
  });

  const sharedPayload = useCallback((current = formRef.current) => ({
    outputDir: current.outputDir.trim(),
    replacementCode: current.replacementCode.trim(),
    archiveBasename: current.archiveBasename.trim(),
    archiveNamingOptions: collectArchiveNamingOptions(current),
    referralReplacementCode: current.referralCode.trim(),
    icnSettings: { mode: current.icnMode, value: current.icnCustomValue.trim() },
    ssnValue: current.ssnValue.trim(),
    identityOptions: collectIdentityOptions(current),
    listDateOverride: listDateTouchedRef.current ? formatListDate(listDateRef.current) : nowAsListDate(),
    clearOutput: current.clearOutput,
    keepMasterJson: current.keepMasterJson,
    keepProcessedJson: current.keepProcessedJson,
    optionalOverrides: collectOptionalOverrides(current),
    upload: collectUploadSettings(current),
  }), [collectOptionalOverrides, collectUploadSettings]);

  const previewPayload = useMemo(() => ({
    inputDir: form.inputDir.trim(),
    outputDir: form.outputDir.trim(),
    replacementCode: form.replacementCode.trim(),
    archiveBasename: form.archiveBasename.trim(),
    archiveNamingOptions: collectArchiveNamingOptions(form),
    referralReplacementCode: form.referralCode.trim(),
    icnSettings: { mode: form.icnMode, value: form.icnCustomValue.trim() },
    ssnValue: form.ssnValue.trim(),
    identityOptions: collectIdentityOptions(form),
    optionalOverrides: collectOptionalOverrides(form),
    fileCount: Number(form.fileCount || 0),
    referralsPerFile: Number(form.referralsPerFile || 0),
    upload: collectUploadSettings(form),
  }), [form, collectOptionalOverrides, collectUploadSettings]);
  const previewSignature = JSON.stringify(previewPayload);
  const previewPayloadRef = useRef(previewPayload);
  previewPayloadRef.current = previewPayload;

  const collectUiSettings = useCallback((current = formRef.current) => ({
    theme: current.theme,
    mainTab: current.mainTab,
    subTab: current.subTab,
    optionalFieldsVisible: current.optionalFieldsVisible,
    acknowledgedReleaseKey: acknowledgedReleaseKeyRef.current,
    inputDir: current.inputDir.trim(),
    outputDir: current.outputDir.trim(),
    replacementCode: current.replacementCode.trim(),
    archiveBasename: current.archiveBasename.trim(),
    archiveAppendNetwork: current.archiveAppendNetwork,
    archiveAppendReferralDateTime: current.archiveAppendReferralDateTime,
    useIfamsFilenamePrefix: current.useIfamsFilenamePrefix,
    archiveNamingMode: current.archiveNamingMode,
    archiveCustomValues: collectArchiveNamingOptions(current).customValues,
    archiveCustomText: current.archiveCustomText.trim(),
    masterFileName: current.masterFileName.trim(),
    referralPrefixMode: current.referralPrefixMode,
    customReferralPrefix: current.customReferralPrefix.trim(),
    referralCode: current.referralCode.trim(),
    ssnValue: current.ssnValue.trim(),
    randomizeSsn: current.randomizeSsn,
    randomizeDob: current.randomizeDob,
    randomizeStationId: current.randomizeStationId,
    matchSuffixLength: current.matchSuffixLength,
    icnMode: current.icnMode,
    icnCustomValue: current.icnCustomValue.trim(),
    selectedStationIds: [...current.selectedStationIds],
    selectedNetworks: [...current.selectedNetworks],
    useAllNetworks: current.useAllNetworks,
    selectedSeocKeys: [...current.selectedSeocKeys],
    useAllSeocs: current.useAllSeocs,
    selectedSituationalSeocKeys: [...current.selectedSituationalSeocKeys],
    useAllSituationalSeocs: current.useAllSituationalSeocs,
    selectedPaymentCodes: [...current.selectedPaymentCodes],
    useAllPaymentCodes: current.useAllPaymentCodes,
    overrideReferralPeriod: current.overrideReferralPeriod.trim(),
    overrideDob: current.overrideDob.trim(),
    overrideReferralCategory: current.overrideReferralCategory.trim(),
    useCurrentReferralDates: current.useCurrentReferralDates,
    overrideReferralDate: current.overrideReferralDate.trim(),
    overrideReferralDateTime: current.overrideReferralDateTime.trim(),
    overrideReferralExpirationDate: current.overrideReferralExpirationDate.trim(),
    overrideReferralLastUpdateDate: current.overrideReferralLastUpdateDate.trim(),
    overrideReferralConsultId: current.overrideReferralConsultId.trim(),
    fileCount: current.fileCount,
    referralsPerFile: current.referralsPerFile,
    clearOutput: current.clearOutput,
    keepMasterJson: current.keepMasterJson,
    keepProcessedJson: current.keepProcessedJson,
    uploadEnabled: current.uploadEnabled,
    uploadTargets: Object.fromEntries(
      Object.entries(current.uploadTargets).map(([name, target]) => [
        name,
        { enabled: Boolean(target.enabled), userName: target.userName || "", remoteDirectory: String(target.remoteDirectory || "").trim() },
      ])
    ),
    leieDuplicateKey: current.leieDuplicateKey,
    leieDuplicateHandling: current.leieDuplicateHandling,
    leieOutputFileName: current.leieOutputFileName,
    leieValidationBatchId: current.leieValidationBatchId.trim(),
  }), []);

  // ---------------------------------------------------------------------------------------------
  // Previews and validation
  // ---------------------------------------------------------------------------------------------

  const refreshPreview = useCallback(async () => {
    if (!infoRef.current) return null;
    if (formRef.current.mainTab === "leie") return { fieldErrors: {} };
    const payload = previewPayloadRef.current;
    const signature = JSON.stringify(payload);
    const cache = previewCacheRef.current;
    if (cache.signature === signature && cache.result) {
      setPreview(cache.result);
      setPreviewError("");
      return cache.result;
    }
    const requestId = cache.requestId + 1;
    cache.requestId = requestId;
    try {
      const result = await window.ccrs.getPreview(payload);
      if (requestId !== previewCacheRef.current.requestId) return result;
      previewCacheRef.current.signature = signature;
      previewCacheRef.current.result = result;
      setPreview(result);
      setPreviewError("");
      return result;
    } catch (error) {
      if (requestId !== previewCacheRef.current.requestId) return null;
      setPreviewError(cleanErrorMessage(error.message) || "Unable to build the preview.");
      return null;
    }
  }, []);

  useEffect(() => {
    if (!ready || form.mainTab === "leie") return undefined;
    const timer = window.setTimeout(() => refreshPreview(), 110);
    return () => window.clearTimeout(timer);
  }, [ready, form.mainTab, previewSignature, refreshPreview]);

  // Persist UI settings shortly after any change.
  const settingsSignature = ready ? JSON.stringify(collectUiSettings(form)) : "";
  useEffect(() => {
    if (!ready || settingsSignature === lastSavedSignatureRef.current) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        await window.ccrs.saveUiSettings(JSON.parse(settingsSignature));
        lastSavedSignatureRef.current = settingsSignature;
      } catch (error) {
        console.error("Unable to save UI settings.", error);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [ready, settingsSignature]);

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", form.theme === "dark");
    document.body.classList.toggle("theme-dark", form.theme === "dark");
  }, [form.theme]);

  // Live ListDate clock: keeps showing the current time until the user edits a segment.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!listDateTouchedRef.current) setListDate(parseListDate(nowAsListDate()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------------------------------------
  // Source inspection
  // ---------------------------------------------------------------------------------------------

  const hasLeieBlockingIssues = useCallback((current = formRef.current) => {
    if (current.mainTab !== "leie") return false;
    const inspection = leieRef.current.inspection;
    if (!inspection || !inspection.fileCount) return true;
    if ((inspection.validationErrors || []).length > 0) return true;
    return Boolean(inspection.hasDuplicates && current.leieDuplicateHandling !== "auto-remove");
  }, []);

  const updateLeie = useCallback((patch) => {
    Object.assign(leieRef.current, patch);
    setLeie({ inspection: leieRef.current.inspection, error: leieRef.current.error, scanning: Boolean(leieRef.current.scanning) });
  }, []);

  const inspectLeieSource = useCallback(async ({ force = false } = {}) => {
    const inputDir = formRef.current.inputDir.trim();
    if (!inputDir) {
      updateLeie({ inspection: null, error: "", lastScannedInput: "", scanning: false });
      setSourceSummary({
        fileCountText: "No LEIE source file or folder selected.",
        detailText: "Select an Excel file or folder to scan for LEIE data.",
      });
      return;
    }
    const sourceChanged = inputDir !== leieRef.current.lastScannedInput;
    if (!force && !sourceChanged) return;

    const requestId = leieRef.current.requestId + 1;
    leieRef.current.requestId = requestId;
    updateLeie({ error: "", scanning: true });
    setStatus("Scanning LEIE", "Reading the selected Excel data and checking every row for exact duplicates...");
    setSourceSummary({ fileCountText: "Scanning selected LEIE source...", detailText: inputDir });

    try {
      const inspection = await window.ccrs.inspectLeieSource(inputDir, "full-row");
      if (requestId !== leieRef.current.requestId) return;
      updateLeie({ inspection, error: "", lastScannedInput: inputDir, scanning: false });
      if (sourceChanged || !formRef.current.leieOutputFileName) {
        setForm((current) => ({ ...current, leieOutputFileName: inspection.outputNameSuggestion || "" }));
      }
      let detailText = "No Excel files detected yet.";
      if (inspection.excelFiles?.length) {
        const names = inspection.excelFiles.slice(0, 3).map((file) => file.name).join(", ");
        const more = inspection.excelFiles.length > 3 ? ` +${inspection.excelFiles.length - 3} more` : "";
        detailText = `Detected Excel files: ${names}${more}`;
      }
      setSourceSummary({
        fileCountText: inspection.fileCount
          ? `${inspection.fileCount} source Excel ${plural(inspection.fileCount, "file")} selected: ${inspection.totalRowCount.toLocaleString()} rows, ${formatBytes(inspection.totalSourceBytes)}.`
          : "No Excel files were found in the selected source path.",
        detailText,
      });

      if (inspection.validationErrors.length > 0) {
        const first = inspection.validationErrors[0];
        setStatus("Failed", `${first.fileName}: ${first.message}`);
      } else if (inspection.hasDuplicates) {
        setStatus("Duplicates Found", "Resolve duplicates before saving the processed LEIE file.");
      } else if (inspection.fileCount > 0) {
        setStatus("Source Ready", `${inspection.fileCount} LEIE ${inspection.fileCount === 1 ? "file is" : "files are"} loaded with ${inspection.totalRowCount.toLocaleString()} rows and no duplicates. Select Save Processed File when ready.`);
      } else {
        setStatus("Ready", "No Excel files were found. Choose a supported LEIE workbook or another folder.");
      }
    } catch (error) {
      if (requestId !== leieRef.current.requestId) return;
      updateLeie({
        inspection: null,
        error: cleanErrorMessage(error.message) || "Unknown error while scanning LEIE source.",
        lastScannedInput: "",
        scanning: false,
      });
      setSourceSummary({ fileCountText: "Unable to scan selected LEIE source.", detailText: inputDir });
      setStatus("Failed", error.message);
    }
  }, [setForm, setStatus, updateLeie]);

  const inspectSource = useCallback(async (options) => {
    const current = formRef.current;
    const inputDir = current.inputDir.trim();
    if (current.mainTab === "leie" || isExcelPath(inputDir)) {
      await inspectLeieSource(options);
      return;
    }
    if (!inputDir) {
      sourceInspectionRef.current = null;
      setSourceInspection(null);
      setSourceSummary({
        fileCountText: "No source folder selected.",
        detailText: "Default ListDate will appear after you choose a source folder.",
      });
      return;
    }

    setStatus("Scanning Referral Files", "Reading the selected folder and checking the available JSON files...");
    try {
      const inspection = await window.ccrs.inspectSource(inputDir);
      sourceInspectionRef.current = inspection;
      setSourceInspection(inspection);
      const fileCount = Number(inspection?.fileCount || 0);
      setSourceSummary({
        fileCountText: fileCount
          ? `${fileCount} source JSON ${plural(fileCount, "file")} selected (${formatBytes(inspection.totalSourceBytes)}).`
          : "No JSON files were found in the selected folder.",
        detailText: inspection?.firstListDate || "No source ListDate found yet.",
      });
      const defaults = inspection?.defaults || {};
      setForm((previous) => {
        const next = { ...previous };
        setIfEmpty(next, "overrideReferralPeriod", defaults.ReferralPeriod);
        setIfEmpty(next, "overrideDob", defaults.DOB);
        setIfEmpty(next, "overrideReferralCategory", defaults.ReferralCategory);
        setIfEmpty(next, "overrideReferralDate", defaults.ReferralDate);
        setIfEmpty(next, "overrideReferralDateTime", defaults.ReferralDateTime);
        setIfEmpty(next, "overrideReferralExpirationDate", defaults.ReferralExpirationDate);
        setIfEmpty(next, "overrideReferralLastUpdateDate", defaults.ReferralLastUpdateDate);
        setIfEmpty(next, "overrideReferralConsultId", defaults.ReferralConsultId);
        return next;
      });
      setStatus(
        fileCount > 0 ? "Source Ready" : "Ready",
        fileCount > 0
          ? `${fileCount} Referral JSON ${fileCount === 1 ? "file is" : "files are"} ready. Review the settings, then select Run Processing.`
          : "No Referral JSON files were found. Choose another source folder."
      );
    } catch (error) {
      setStatus("Failed", error.message);
    }
  }, [inspectLeieSource, setForm, setStatus]);

  // ---------------------------------------------------------------------------------------------
  // Start-up
  // ---------------------------------------------------------------------------------------------

  const applyInfo = useCallback((nextInfo) => {
    infoRef.current = nextInfo;
    setInfo(nextInfo);
    document.title = nextInfo.appVersionLabel
      ? `CCRS File Processing Framework | ${nextInfo.appVersionLabel}`
      : "CCRS File Processing Framework";
    acknowledgedReleaseKeyRef.current = String(
      nextInfo.releaseAnnouncement?.acknowledgedReleaseKey || acknowledgedReleaseKeyRef.current || ""
    ).trim();
    setUploadImportState("idle");
  }, []);

  const syncReleaseAnnouncement = useCallback((nextInfo) => {
    const announcement = nextInfo?.releaseAnnouncement || null;
    setReleaseMode("announce");
    setReleaseOpen(Boolean(
      announcement?.releaseKey &&
        (announcement?.shouldShow === true || acknowledgedReleaseKeyRef.current !== announcement.releaseKey)
    ));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nextInfo = await window.ccrs.getInfo();
        if (cancelled) return;
        applyInfo(nextInfo);
        const nextCatalogs = buildCatalogs(nextInfo);
        catalogsRef.current = nextCatalogs;
        const settings = nextInfo.uiSettings || {};
        let nextForm = formFromSettings(settings, nextCatalogs, withGeneratorDefaults(DEFAULT_FORM, nextInfo));
        nextForm.icnCustomValue = sanitizeIcnInput(nextForm.icnCustomValue, nextForm.icnMode, getIcnConstants(nextInfo));
        nextForm.uploadTargets = buildUploadTargets(nextInfo, settings.uploadTargets || {}, nextForm.mainTab);
        nextForm = withGeneratorDefaults(nextForm, nextInfo);
        formRef.current = nextForm;
        setFormState(nextForm);
        setStatus("Ready", nextForm.subTab === "generate" ? READY_MESSAGES.generate : READY_MESSAGES[nextForm.mainTab] || READY_MESSAGES.referral);
        lastSavedSignatureRef.current = JSON.stringify(collectUiSettings(nextForm));
        setReady(true);
        try {
          if (nextForm.inputDir.trim() && !(nextForm.mainTab === "referral" && nextForm.subTab === "generate")) {
            await inspectSource();
          } else if (nextForm.inputDir.trim()) {
            await inspectSource();
          }
        } catch (error) {
          console.error("Unable to inspect source while restoring settings.", error);
        }
        syncReleaseAnnouncement(nextInfo);
      } catch (error) {
        console.error(error);
        setStatus("Failed", error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on start-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------------------------
  // Field updates
  // ---------------------------------------------------------------------------------------------

  const setField = useCallback((key, rawValue) => {
    setForm((current) => {
      const next = { ...current };
      let value = rawValue;
      if (key === "referralCode") value = sanitizeReferralNumberInput(value, current.customReferralPrefix.trim());
      if (key === "customReferralPrefix") value = keepCharacters(value, /[A-Za-z0-9_-]/g);
      if (key === "icnCustomValue") value = sanitizeIcnInput(value, current.icnMode, getIcnConstants(infoRef.current));
      if (key === "leieOutputFileName") value = String(value || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "");
      next[key] = value;

      if (current.subTab === "generate" && REFERRAL_DATE_FIELDS[key]) next.useCurrentReferralDates = false;
      if (key === "icnMode") {
        next.icnCustomValue = sanitizeIcnInput(current.icnCustomValue, value, getIcnConstants(infoRef.current));
      }
      if (key === "randomizeStationId" && value) next.selectedStationIds = [];
      if (key === "useAllNetworks" && value) next.selectedNetworks = [];
      if (key === "useAllSeocs" && value) next.selectedSeocKeys = [];
      if (key === "useAllSituationalSeocs" && value) next.selectedSituationalSeocKeys = [];
      if (key === "useAllPaymentCodes" && value) next.selectedPaymentCodes = [];
      if (key === "selectedStationIds") next.randomizeStationId = false;
      if (key === "selectedNetworks") next.useAllNetworks = false;
      if (key === "selectedSeocKeys") next.useAllSeocs = false;
      if (key === "selectedSituationalSeocKeys") next.useAllSituationalSeocs = false;
      if (key === "selectedPaymentCodes") next.useAllPaymentCodes = false;
      if (key === "overrideReferralPeriod" || key === "useCurrentReferralDates") {
        return withGeneratorDefaults(next, infoRef.current);
      }
      return next;
    });
  }, [setForm]);

  const setUploadTarget = useCallback((name, patch) => {
    setForm((current) => ({
      ...current,
      uploadTargets: { ...current.uploadTargets, [name]: { ...current.uploadTargets[name], ...patch } },
    }));
    setUploadStatus((current) => ({ ...current, [name]: undefined }));
  }, [setForm]);

  const setArchiveCustomValue = useCallback((value, selected) => {
    setForm((current) => ({
      ...current,
      archiveCustomValues: selected
        ? [...new Set([...current.archiveCustomValues, value])]
        : current.archiveCustomValues.filter((entry) => entry !== value),
    }));
  }, [setForm]);

  const setAllArchiveCustomValues = useCallback((selected) => {
    setForm({ archiveCustomValues: selected ? ARCHIVE_CUSTOM_VALUES.map((entry) => entry.value) : [] });
  }, [setForm]);

  const applyWorkflowChange = useCallback((mainTab, subTab) => {
    const previous = formRef.current;
    let next = { ...previous, mainTab, subTab: mainTab === "referral" ? subTab : "edit" };
    next.uploadTargets = resolveUploadDirectories(previous.uploadTargets, infoRef.current, mainTab);
    next = withGeneratorDefaults(next, infoRef.current);
    setForm(next);
    if (mainTab === "leie") {
      sourceInspectionRef.current = null;
      setSourceInspection(null);
    }
    if (!busyRef.current) {
      const isGenerate = mainTab === "referral" && next.subTab === "generate";
      const message = isGenerate ? READY_MESSAGES.generate : READY_MESSAGES[mainTab];
      if (message) setStatus("Ready", message);
    }
    return next;
  }, [setForm, setStatus]);

  const setMainTab = useCallback((mainTab) => {
    if (mainTab === formRef.current.mainTab) return;
    applyWorkflowChange(mainTab, "edit");
    if (mainTab !== "other") inspectSource();
  }, [applyWorkflowChange, inspectSource]);

  const setSubTab = useCallback((subTab) => {
    if (subTab === formRef.current.subTab) return;
    applyWorkflowChange(formRef.current.mainTab, subTab);
  }, [applyWorkflowChange]);

  const commitInputDir = useCallback(async () => {
    if (formRef.current.mainTab === "leie") {
      updateLeie({ inspection: null, lastScannedInput: "" });
    }
    await inspectSource();
  }, [inspectSource, updateLeie]);

  const pickPath = useCallback(async (key) => {
    let selected = "";
    if (key === "inputDir" && formRef.current.mainTab === "leie") {
      selected = await window.ccrs.pickFile([
        { name: "Excel Files", extensions: ["xlsx", "xls", "xlsm", "xlsb"] },
        { name: "All Files", extensions: ["*"] },
      ]);
    } else {
      selected = await window.ccrs.pickDirectory();
    }
    if (!selected) return;
    setForm({ [key]: selected });
    if (key === "inputDir") {
      if (formRef.current.mainTab === "leie") updateLeie({ inspection: null, lastScannedInput: "" });
      await inspectSource({ force: true });
    }
  }, [inspectSource, setForm, updateLeie]);

  // ListDate segments
  const editDatePart = useCallback((partKey, value) => {
    const part = DATE_PARTS.find((entry) => entry.key === partKey);
    listDateTouchedRef.current = true;
    setListDate((current) => ({ ...current, [partKey]: normalizeDigits(value, part.width) }));
  }, []);

  const blurDatePart = useCallback((partKey) => {
    const part = DATE_PARTS.find((entry) => entry.key === partKey);
    setListDate((current) => {
      let value = Number(normalizeDigits(current[partKey], part.width) || part.min);
      if (Number.isNaN(value) || value < part.min) value = part.min;
      if (value > part.max) value = part.max;
      return { ...current, [partKey]: String(value).padStart(part.width, "0") };
    });
  }, []);

  const stepDatePart = useCallback((partKey, delta) => {
    const part = DATE_PARTS.find((entry) => entry.key === partKey);
    listDateTouchedRef.current = true;
    setListDate((current) => {
      let value = Number(normalizeDigits(current[partKey], part.width) || part.min);
      if (Number.isNaN(value)) value = part.min;
      value += delta;
      if (value > part.max) value = part.min;
      if (value < part.min) value = part.max;
      return { ...current, [partKey]: String(value).padStart(part.width, "0") };
    });
  }, []);

  const resumeLiveListDate = useCallback(() => {
    listDateTouchedRef.current = false;
    setListDate(parseListDate(nowAsListDate()));
  }, []);

  // ---------------------------------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------------------------------

  const showResultActions = useCallback((run) => {
    lastRunRef.current = run || null;
    setLastRun(run || null);
  }, []);

  const confirmPreRun = useCallback((command, payload) => {
    const needsProd = needsProdConfirmation(payload);
    return new Promise((resolve) => {
      preRunResolverRef.current = resolve;
      setPreRun({
        items: buildReviewItems(command, payload, sourceInspectionRef.current, archivePreviewRef.current, previewCacheRef.current.result?.generatedSize),
        needsProd,
      });
    });
  }, []);

  const closePreRun = useCallback((confirmed) => {
    setPreRun(null);
    const resolve = preRunResolverRef.current;
    preRunResolverRef.current = null;
    resolve?.(Boolean(confirmed));
  }, []);

  const validateCurrentForm = useCallback(async () => {
    if (formRef.current.mainTab === "leie") {
      if (hasLeieBlockingIssues()) {
        setStatus("Failed", "Resolve LEIE duplicate or validation issues before saving.");
        return false;
      }
      return true;
    }
    const result = await refreshPreview();
    const messages = Object.values(result?.fieldErrors || {});
    if (messages.length > 0) {
      setStatus("Failed", `Please fix the highlighted fields before running. ${messages[0]}`);
      return false;
    }
    return true;
  }, [hasLeieBlockingIssues, refreshPreview, setStatus]);

  const runJob = useCallback(async (command, payload, label) => {
    if (!(await confirmPreRun(command, payload))) {
      setStatus("Ready", "The run was not started. Review or change the settings when ready.");
      return;
    }
    setBusy(true, true);
    const fileCount = Number(payload.fileCount || 0);
    const perFile = Number(payload.referralsPerFile || 0);
    setStatus(
      label,
      command === "generate"
        ? `Creating ${fileCount.toLocaleString()} JSON ${plural(fileCount, "file")} with ${perFile.toLocaleString()} ${plural(perFile, "referral")} per file...`
        : "Reading the Referral Files, applying the selected changes, and preparing the final archive..."
    );
    try {
      setUploadResults([]);
      const result = await window.ccrs.runJob(command, payload);
      setUploadResults(result.uploadResults || []);
      setStatus(result.retryable ? "Upload Warning" : "Completed", result.message || `${label} completed.`);
      showResultActions({
        ...(result.run || {}),
        archivePath: result.archivePath,
        manifestPath: result.manifestPath,
        outputDir: result.outputDir,
        retryable: result.retryable,
      });
    } catch (error) {
      setStatus("Failed", error.message);
    } finally {
      setBusy(false);
      resumeLiveListDate();
    }
  }, [confirmPreRun, resumeLiveListDate, setBusy, setStatus, setUploadResults, showResultActions]);

  const runLeieProcess = useCallback(async () => {
    if (!(await validateCurrentForm())) return;
    const current = formRef.current;
    const payload = {
      inputDir: current.inputDir.trim(),
      outputDir: current.outputDir.trim(),
      outputFileName: sanitizeLeieFileNameInput(current.leieOutputFileName),
      duplicateKey: "full-row",
      duplicateHandling: current.leieDuplicateHandling,
      upload: collectUploadSettings(current),
    };
    if (!(await confirmPreRun("process-leie", payload))) return;

    setBusy(true, true);
    setUploadResults([]);
    setStatus("Processing LEIE", "Loading the selected workbook, checking duplicate handling, and preparing the processed output...");
    try {
      const result = await window.ccrs.runJob("process-leie", payload);
      setUploadResults(result.uploadResults || []);
      if (payload.upload.enabled && payload.upload.targets.length > 0) {
        setStatus(result.retryable ? "Upload Warning" : "Upload Complete", result.message || "LEIE upload completed.");
      } else {
        setStatus("Ready to Save", result.message || "LEIE file saved.");
      }
      if (result.outputDir || result.archivePath || result.manifestPath) showResultActions(result.run || result);
    } catch (error) {
      setStatus("Failed", error.message);
    } finally {
      setBusy(false);
    }
  }, [collectUploadSettings, confirmPreRun, setBusy, setStatus, setUploadResults, showResultActions, validateCurrentForm]);

  const runProcess = useCallback(async () => {
    if (formRef.current.mainTab === "leie") {
      await runLeieProcess();
      return;
    }
    if (!(await validateCurrentForm())) return;
    await runJob("process", { ...sharedPayload(), inputDir: formRef.current.inputDir.trim() }, "Processing");
  }, [runJob, runLeieProcess, sharedPayload, validateCurrentForm]);

  const runGenerate = useCallback(async () => {
    if (!(await validateCurrentForm())) return;
    const current = formRef.current;
    await runJob(
      "generate",
      { ...sharedPayload(), fileCount: Number(current.fileCount), referralsPerFile: Number(current.referralsPerFile) },
      "Generating"
    );
  }, [runJob, sharedPayload, validateCurrentForm]);

  const retryFailedUploads = useCallback(async () => {
    const run = lastRunRef.current;
    if (!run?.runId) return;
    setBusy(true, true);
    setJobPhase("upload");
    setStatus("Retrying Uploads", "Using the existing archive to retry only the failed destinations...");
    try {
      const result = await window.ccrs.runJob("retry-upload", { runId: run.runId });
      setUploadResults(result.uploadResults || []);
      showResultActions({
        ...(result.run || run),
        archivePath: result.archivePath,
        manifestPath: result.manifestPath,
        outputDir: result.outputDir,
        retryable: result.retryable,
      });
      setStatus(result.retryable ? "Upload Warning" : "Upload Complete", result.message);
    } catch (error) {
      setStatus("Failed", error.message);
    } finally {
      setBusy(false);
    }
  }, [setBusy, setJobPhase, setStatus, setUploadResults, showResultActions]);

  const cancelJob = useCallback(async () => {
    if (!cancellable || cancelRequested) return;
    setCancelRequested(true);
    setStatus("Cancelling", "Stopping the current operation safely...");
    const result = await window.ccrs.cancelJob();
    if (!result?.cancelled) {
      setCancelRequested(false);
      setStatus("Working", "The current operation is already finishing.");
    }
  }, [cancellable, cancelRequested, setStatus]);

  const generateManifest = useCallback(async () => {
    const run = lastRunRef.current;
    if (!run?.runId || busyRef.current) return;
    setManifestPending(true);
    try {
      const result = await window.ccrs.runJob("generate-manifest", { runId: run.runId });
      showResultActions(result.run);
      setStatus("Manifest Generated", result.message);
    } catch (error) {
      setStatus("Manifest Not Generated", error.message);
    } finally {
      setManifestPending(false);
    }
  }, [setStatus, showResultActions]);

  const openOutputFolder = useCallback(() => {
    if (lastRunRef.current?.outputDir) window.ccrs.openPath(lastRunRef.current.outputDir);
  }, []);

  const copyArchivePath = useCallback(async () => {
    if (!lastRunRef.current?.archivePath) return;
    try {
      await window.ccrs.copyText(lastRunRef.current.archivePath);
      setStatus("Copied", "The archive path was copied to the clipboard.");
    } catch (_error) {
      setStatus("Copy Failed", `The path could not be copied. Copy it manually: ${lastRunRef.current.archivePath}`);
    }
  }, [setStatus]);

  // ---------------------------------------------------------------------------------------------
  // Upload configuration, diagnostics and guides
  // ---------------------------------------------------------------------------------------------

  const setTargetStatus = useCallback((name, message, tone) => {
    if (!name) return;
    setUploadStatus((current) => ({ ...current, [name]: { message: cleanErrorMessage(message), tone } }));
  }, []);

  const testUploadTarget = useCallback(async (name) => {
    const settings = formRef.current.uploadTargets[name] || {};
    const remoteDirectory = String(settings.remoteDirectory || "").trim();
    setTargetStatus(name, "Testing connection...", "working");
    setStatus("Testing Connection", `Connecting to ${name} and confirming access to ${remoteDirectory || "the selected remote directory"}...`);
    try {
      const result = await window.ccrs.testUploadTarget({
        server_name: name,
        user_name: settings.userName,
        remote_directory: remoteDirectory,
      });
      setTargetStatus(name, result.message, "success");
      setStatus("Connection Ready", `${result.message} This target is ready for the next upload.`);
    } catch (error) {
      setTargetStatus(name, error.message, "error");
      setStatus("Failed", error.message);
    }
  }, [setStatus, setTargetStatus]);

  const importUploadSource = useCallback(async () => {
    const sourcePath = await window.ccrs.pickFile([{ name: "Upload Config", extensions: ["ini", "json"] }]);
    if (!sourcePath) return;
    setBusy(true);
    setUploadImportState("importing");
    setStatus("Importing", "Reading the selected upload configuration and preparing the available server accounts...");
    try {
      const result = await window.ccrs.importUploadSource(sourcePath);
      applyInfo(result.info);
      setForm((current) => ({
        ...current,
        uploadTargets: buildUploadTargets(
          result.info,
          { ...(result.info.uiSettings?.uploadTargets || {}), ...current.uploadTargets },
          current.mainTab
        ),
      }));
      setUploadStatus({});
      setUploadImportState("ready");
      const summaryText = formatUploadProfileSummary(result.importResult?.profile_summary || result.info?.uploadProfileSummary);
      setStatus(
        "Configuration Ready",
        summaryText
          ? `Upload configuration imported successfully. ${summaryText} ready for use.`
          : "Upload configuration imported successfully."
      );
      syncReleaseAnnouncement(result.info);
    } catch (error) {
      setUploadImportState("failed");
      setStatus("Failed", error.message);
    } finally {
      setBusy(false);
    }
  }, [applyInfo, setBusy, setForm, setStatus, syncReleaseAnnouncement]);

  const exportDiagnostics = useCallback(async () => {
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
  }, [setBusy, setStatus]);

  const openUserGuide = useCallback(() => {
    const guidePath = infoRef.current?.docs?.userGuidePath;
    if (guidePath) window.ccrs.openPath(guidePath);
  }, []);

  const openUploadLog = useCallback(async () => {
    const logPath = infoRef.current?.docs?.uploadLogPath;
    try {
      if (!logPath) throw new Error("missing");
      await window.ccrs.openPath(logPath);
    } catch (_error) {
      setStatus("Upload Log", "No upload log is available yet. It is created the first time a file is uploaded.");
    }
  }, [setStatus]);

  const openLeieGuide = useCallback(() => {
    const guidePath = infoRef.current?.docs?.leieValidationGuidePath;
    if (guidePath) window.ccrs.openPath(guidePath);
  }, []);

  const openExternal = useCallback(async (href) => {
    if (!href) return;
    if (typeof window.ccrs.openExternal === "function") {
      await window.ccrs.openExternal(href);
      return;
    }
    window.open(href, "_blank", "noopener");
  }, []);

  const copySql = useCallback(async (sqlText) => {
    let copied = false;
    try {
      copied = (await window.ccrs.copyText(sqlText)) !== false;
    } catch (_error) {
      copied = false;
    }
    if (!copied && navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(sqlText);
        copied = true;
      } catch (_error) {
        copied = false;
      }
    }
    setSqlCopy(copied
      ? { tone: "success", message: "SQL copied. Run it in ccrsdb for the selected environment." }
      : { tone: "error", message: "Unable to copy automatically. Select the SQL and copy it manually." });
  }, []);

  const openReleaseNotes = useCallback(() => {
    if (!infoRef.current?.releaseAnnouncement) return;
    setReleaseMode("view");
    setReleaseOpen(true);
  }, []);

  const closeReleaseNotes = useCallback(() => {
    setReleaseOpen(false);
  }, []);

  const acknowledgeRelease = useCallback(async () => {
    const announcement = infoRef.current?.releaseAnnouncement;
    if (!announcement?.releaseKey) {
      setReleaseOpen(false);
      return;
    }
    const previousKey = acknowledgedReleaseKeyRef.current;
    acknowledgedReleaseKeyRef.current = announcement.releaseKey;
    try {
      await window.ccrs.acknowledgeReleaseAnnouncement(announcement.releaseKey);
      announcement.shouldShow = false;
      setReleaseOpen(false);
    } catch (_error) {
      acknowledgedReleaseKeyRef.current = previousKey;
      setStatus("Failed", "Unable to save the release acknowledgement.");
    }
  }, [setStatus]);

  // LEIE duplicate actions
  const rescanLeie = useCallback(() => inspectLeieSource({ force: true }), [inspectLeieSource]);

  const cancelLeieProcess = useCallback(() => {
    setForm({ inputDir: "" });
    updateLeie({ inspection: null });
    inspectSource();
  }, [inspectSource, setForm, updateLeie]);

  // ---------------------------------------------------------------------------------------------
  // Backend progress events
  // ---------------------------------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = window.ccrs.onBackendEvent((event) => {
      if (event.type !== "progress") return;
      // Progress events and the job result travel on separate IPC channels, so a final progress
      // event can arrive just after the job has finished. Keep the per-server result it carries,
      // but never let it replace the final status of the run.
      if (!busyRef.current) {
        if (event.state === "upload-target-complete") {
          setTargetStatus(event.uploadTarget, `Upload complete — ${event.current} of ${event.total} servers finished.`, "success");
        } else if (event.state === "upload-target-error") {
          setTargetStatus(event.uploadTarget, `Needs attention: ${event.detail || "The server did not complete the upload."}`, "error");
        }
        return;
      }
      setJobPhase(event.phase || phaseRef.current || "processing");
      const uploading = event.phase === "upload" && event.state === "uploading";
      setProgress({ current: uploading ? 0 : Number(event.current) || 0, total: uploading ? 0 : Number(event.total) || 0 });

      switch (event.state) {
        case "preflight-complete":
          setStatus("Preflight Complete", event.message || "The source, output, and business settings passed validation.");
          return;
        case "file-loaded":
          setStatus("Validating LEIE", `${event.filename} loaded. Step 1 of 3 is complete; checking duplicate handling next.`);
          return;
        case "duplicates-found":
          setStatus("Duplicates Found", "Duplicate rows were detected. Choose automatic removal or resolve them manually before saving.");
          return;
        case "ready-to-save":
          setStatus("Ready to Save", `${event.filename} was processed successfully and is ready in the selected output folder.`);
          return;
        case "upload-complete":
          if (Array.isArray(event.results)) setUploadResults(event.results);
          setStatus("Upload Complete", `${event.filename} reached every selected server once, and each server confirmed it.`);
          return;
        case "upload-batch-start":
          setUploadResults((event.targetNames || []).map((serverName) => ({
            serverName,
            status: "pending",
            message: "Waiting for its turn.",
          })));
          setStatus("Starting Uploads", event.message || `Uploading to ${event.total} selected ${plural(event.total, "environment")}, one at a time.`);
          return;
        case "upload-batch-warning":
          if (Array.isArray(event.results)) setUploadResults(event.results);
          setStatus("Upload Warning", "All selected servers have responded. Your local file is safe; review the failed server messages and use Retry Failed Uploads when ready.");
          return;
        case "upload-target-skipped":
          if (event.result) setUploadResults([...uploadResultsRef.current, event.result]);
          setTargetStatus(event.uploadTarget, event.detail || "Skipped: same endpoint as another selected server.", "neutral");
          return;
        case "upload-target-complete": {
          if (event.result) updateLiveUploadResult(event.uploadTarget, event.result);
          setTargetStatus(event.uploadTarget, `Upload complete — ${event.current} of ${event.total} servers finished.`, "success");
          const remaining = Math.max(event.total - event.current, 0);
          setStatus("Upload Verified", `${event.uploadTarget} is complete and verified. ${remaining ? `${remaining} selected ${remaining === 1 ? "server is" : "servers are"} still working.` : "All selected servers have finished."}`);
          return;
        }
        case "upload-target-error": {
          updateLiveUploadResult(event.uploadTarget, event.result || { status: "failed", message: event.detail || "The server did not complete the upload." });
          setTargetStatus(event.uploadTarget, `Needs attention: ${event.detail || "The server did not complete the upload."}`, "error");
          const remaining = Math.max(event.total - event.current, 0);
          setStatus("Upload Warning", `${event.uploadTarget} did not complete: ${event.detail || "No additional details were returned."} Your local file is safe.${remaining ? ` ${remaining} remaining ${remaining === 1 ? "server will be tried" : "servers will be tried"} in order.` : " You can retry only the failed server."}`);
          return;
        }
        case "uploading":
          updateLiveUploadResult(event.uploadTarget, { status: "uploading", message: "Sending and verifying the file..." });
          setTargetStatus(event.uploadTarget, `Uploading and verifying ${event.filename}...`, "working");
          setStatus("Uploading", `${event.uploadTarget} started. ${event.current} of ${event.total} selected servers have finished; uploads run one at a time. Keep the app open.`);
          return;
        case "packaging":
          setProgress({ current: 0, total: 0 });
          setStatus("Packaging", "All Referral Files were processed. Creating the final timestamped gzip archive...");
          return;
        case "archive-created":
          setStatus("Archive Ready", `${event.filename} was created successfully. Finishing cleanup${busyRef.current ? " and any selected uploads" : ""}...`);
          return;
        case "processing":
          setStatus("Processing LEIE", "Step 2 of 3: removing approved duplicates and writing the processed workbook...");
          return;
        case "processed":
          setStatus("Processing", `Processed ${event.filename} — ${event.current} of ${event.total} files complete.`);
          return;
        case "error":
          setStatus("Batch Stopped", `Could not process ${event.filename}: ${event.detail || "validation failed"}. No incomplete archive will be uploaded.`);
          return;
        default:
          setStatus("Working", `Handling ${event.filename} — ${event.current} of ${event.total} complete.`);
      }
    });
    return typeof unsubscribe === "function" ? unsubscribe : undefined;
  }, [setJobPhase, setStatus, setTargetStatus, setUploadResults, updateLiveUploadResult]);

  // ---------------------------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------------------------

  const isReferral = form.mainTab === "referral";
  const isLeie = form.mainTab === "leie";
  const isOther = form.mainTab === "other";
  const isGenerate = isReferral && form.subTab === "generate";
  const fieldErrors = (!isLeie && preview?.fieldErrors) || {};

  const previewFileCount = isGenerate
    ? Math.max(Number(form.fileCount || 1), 1)
    : Math.max(Number(sourceInspection?.fileCount || 0), 1);
  const leieOutputBaseName = sanitizeLeieFileNameInput(form.leieOutputFileName);
  const archivePreview = isLeie
    ? "Preview: not used for LEIE"
    : preview
      ? `${preview.outputFileNames.master || `${preview.outputFileNames.basename}_Master.json`} · ${preview.outputFileNames.gzip}`
      : "VA0000012345_Master.json · VA0000012345.gz";
  archivePreviewRef.current = archivePreview;

  const previews = {
    outputJson: isLeie
      ? leieOutputBaseName ? `Preview: ${leieOutputBaseName}.xlsx` : "Preview: original source file name will be used with .xlsx"
      : formatJsonPreviewList(preview?.replacementCode, previewFileCount, isGenerate),
    archive: archivePreview,
    referral: previewError
      || (preview?.referralNumber ? `Preview: ${preview.referralNumber}` : "Preview: default referral numbers from source files"),
    icn: preview?.icnPreview || "Preview: TEST + 13 generated digits",
    station: form.randomizeStationId
      ? "Preview: randomized from all reference stations"
      : form.selectedStationIds.length > 0
        ? `Preview: randomized from ${form.selectedStationIds.join(", ")}`
        : "Preview: no Station ID override",
    payment: form.useAllPaymentCodes || !form.selectedPaymentCodes.length
      ? "Preview: mixed from the team reference codes"
      : `Preview: ${form.selectedPaymentCodes.join(", ")}`,
  };

  const leieBlocking = isLeie && (() => {
    const inspection = leie.inspection;
    if (!inspection || !inspection.fileCount) return true;
    if ((inspection.validationErrors || []).length > 0) return true;
    return Boolean(inspection.hasDuplicates && form.leieDuplicateHandling !== "auto-remove");
  })();

  return {
    form,
    info,
    ready,
    busy,
    cancellable,
    cancelRequested,
    status,
    activityActive,
    progress,
    phase,
    catalogs,
    sourceInspection,
    sourceSummary,
    leie,
    leieBlocking,
    fieldErrors,
    previewError,
    previews,
    listDate,
    uploadStatus,
    uploadResults,
    generatedSize: isGenerate ? preview?.generatedSize || null : null,
    uploadImportState,
    lastRun,
    manifestPending,
    releaseOpen,
    releaseMode,
    preRun,
    sqlCopy,
    stationQuery,
    flags: { isReferral, isLeie, isOther, isGenerate },
    defaults: { LEIE_DEFAULT_UPLOAD_DIRECTORY, REFERRAL_DEFAULT_UPLOAD_DIRECTORY },
    actions: {
      setField,
      setForm,
      setMainTab,
      setSubTab,
      setUploadTarget,
      setArchiveCustomValue,
      setAllArchiveCustomValues,
      setStationQuery,
      commitInputDir,
      pickPath,
      editDatePart,
      blurDatePart,
      stepDatePart,
      runProcess,
      runGenerate,
      cancelJob,
      retryFailedUploads,
      generateManifest,
      openOutputFolder,
      copyArchivePath,
      testUploadTarget,
      importUploadSource,
      exportDiagnostics,
      openUserGuide,
      openUploadLog,
      openLeieGuide,
      openExternal,
      copySql,
      openReleaseNotes,
      closeReleaseNotes,
      acknowledgeRelease,
      closePreRun,
      rescanLeie,
      cancelLeieProcess,
      isTargetAvailable,
    },
  };
}
