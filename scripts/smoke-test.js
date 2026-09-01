const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const XLSX = require("xlsx");

const {
  ICN_MODES,
  NETWORK_VALUES,
  applySelectedNetworks,
  generateIcnFromReferralNumber,
  generateOptionalFieldOverrides,
  generatePaymentAuthorityCodeValue,
  generateRandomSsn,
  generateReferralNumber,
  modifyContent,
  prepareIcnSettings,
  validatePaymentAuthorityCode,
  validateSsn,
} = require("../electron/backend/contentEditor");
const backend = require("../electron/backend");
const {
  cleanupRuntimeArtifacts,
  cleanupKnownTemporaryArtifacts,
  registerTemporaryPath,
} = require("../electron/backend/runtimeCleanup");
const { summarizeUploadProfiles, uploadFileWithSftp, uploadTargetsInParallel } = require("../electron/backend/uploader");
const {
  buildArchiveBasename,
  buildOutputFileNames,
  formatArchiveReferralDateTime,
  formatCurrentDateTime,
  zipOutput,
} = require("../electron/backend/zipper");
const { writeFileAtomic } = require("../electron/backend/atomicFile");
const { assertSourceFilesWithinLimits } = require("../electron/backend/limits");
const { importCredentialFile, parseCredentialFile } = require("../electron/backend/secureCredentials");
const {
  DEFAULT_UI_SETTINGS,
  loadUiSettings,
  normalizeUiSettings,
  saveUiSettings,
} = require("../electron/backend/userSettings");
const {
  exportReleaseArtifacts,
  getDisplayVersion,
  isRealWindowsExecutable,
  resolveReleasePaths,
} = require("./export-release-artifacts");
const {
  assertPathInsideWorkRoot,
  assertSafeTemporaryWorkRoot,
} = require("./build-release");
const {
  buildLeieValidationSql,
  highlightSql,
} = require("../electron/renderer/leieSql");
const {
  LEIE_DEFAULT_UPLOAD_DIRECTORY,
  resolveUploadDirectoryForWorkflow,
} = require("../electron/renderer/uploadDefaults");
const { normalizeStations } = require("../electron/backend/stationCatalog");
const { ensureRuntimeFiles } = require("../electron/backend/appPaths");
const { normalizeCell } = require("./import-stations");
const { convertWorksheet: convertSeocWorksheet, splitVersionedSeocId } = require("./import-seoc");
const { getSituationalSeocOptions, resolveSeocSelection } = require("../electron/backend/referralGenerator");
const { assertSafeFolderRelationship, stripWindowsExtendedPathPrefix } = require("../electron/backend/batchSafety");
const { validateReferralFile } = require("../electron/backend/referralValidator");
const { allowedUploadTargets } = require("../electron/backend/workflowPolicy");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-smoke-"));
const projectRoot = path.resolve(__dirname, "..");
let failures = 0;
const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function writeJsonFixture(fileName, data) {
  const filePath = path.join(tempRoot, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

function writeWindowsExecutableFixture(filePath, sizeBytes = 1024 * 1024 + 32) {
  const buffer = Buffer.alloc(sizeBytes, 0);
  buffer[0] = 0x4d;
  buffer[1] = 0x5a;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

function writeXlsxFixture(filePath, rows) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  XLSX.writeFile(workbook, filePath);
}

test("LEIE validation SQL includes the requested query set and syntax highlighting", () => {
  const sql = buildLeieValidationSql("LEIE0731202606153013");
  assert.match(sql, /^Use ccrsdb;/);
  assert.match(sql, /select \* from CLAIM_BATCH_LOG order by last_updated_date desc;-- First get the etl_batch_id/);
  assert.equal((sql.match(/LEIE0731202606153013/g) || []).length, 3);
  assert.match(sql, /select \* from dbo\.LKUP_PROVIDER_SANCTION;$/);

  const highlighted = highlightSql(sql);
  assert.match(highlighted, /class="sql-keyword">select<\/span>/i);
  assert.match(highlighted, /class="sql-string">&#39;LEIE0731202606153013&#39;<\/span>/);
  assert.match(highlighted, /class="sql-comment">-- First get the etl_batch_id<\/span>/);
});

test("Version 1.4.2 metadata, combined user release notes, safety controls, and release automation stay consolidated", () => {
  const versionConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "config", "app_version.json"), "utf8"));
  const packageConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const releaseWorkflow = fs.readFileSync(path.join(projectRoot, ".github", "workflows", "release.yml"), "utf8");
  const releaseNotes = fs.readFileSync(path.join(projectRoot, "docs", "RELEASE_NOTES.md"), "utf8");
  const smokeWorkflow = fs.readFileSync(path.join(projectRoot, ".github", "workflows", "smoke-tests.yml"), "utf8");
  const buildReleaseScript = fs.readFileSync(path.join(projectRoot, "scripts", "build-release.js"), "utf8");
  const rendererHtml = fs.readFileSync(path.join(projectRoot, "electron", "renderer", "index.html"), "utf8");
  const rendererStyles = fs.readFileSync(path.join(projectRoot, "electron", "renderer", "styles.css"), "utf8");
  const rendererApp = fs.readFileSync(path.join(projectRoot, "electron", "renderer", "app.js"), "utf8");
  const workflowPolicy = fs.readFileSync(path.join(projectRoot, "electron", "backend", "workflowPolicy.js"), "utf8");
  const jobUi = fs.readFileSync(path.join(projectRoot, "electron", "renderer", "jobUi.js"), "utf8");
  const compactSelect = fs.readFileSync(path.join(projectRoot, "electron", "renderer", "compactSelect.js"), "utf8");
  const mainProcess = fs.readFileSync(path.join(projectRoot, "electron", "main.js"), "utf8");
  const iconPng = fs.readFileSync(path.join(projectRoot, "assets", "icons", "ccrs_app_icon.png"));
  const iconIco = fs.readFileSync(path.join(projectRoot, "assets", "icons", "ccrs_app_icon.ico"));

  assert.equal(versionConfig.version, "1.4.2");
  assert.equal(versionConfig.releaseTag, "v1.4.2");
  assert.equal(versionConfig.label, "Version 1.4.2");
  assert.match(releaseNotes, /^# CCRS File Processing Framework Version 1\.4\.2/);
  assert.match(releaseNotes, /\[Version 1\.4\.1\]\(https:\/\/github\.com\/mohamedmoheyeldin\/ccrs-file-processing-framework-js\/releases\/tag\/v1\.4\.1\)/);
  assert.match(releaseNotes, /\[Version 1\.4\]\(https:\/\/github\.com\/mohamedmoheyeldin\/ccrs-file-processing-framework-js\/releases\/tag\/v1\.4\)/);
  assert.match(releaseNotes, /\[Version 1\.3\.11\]\(https:\/\/github\.com\/mohamedmoheyeldin\/ccrs-file-processing-framework-js\/releases\/tag\/v1\.3\.11\)/);
  const currentUserDocumentNotes = releaseNotes.split("## [Version 1.3.11]")[0];
  assert.doesNotMatch(currentUserDocumentNotes, /Electron|smoke test|pnpm|deterministic|test coverage|source-backed|17-character|JSON|gzip/i);
  assert.match(releaseNotes, /\[Version 1\.3\.9\]\(https:\/\/github\.com\/mohamedmoheyeldin\/ccrs-file-processing-framework-js\/releases\/tag\/v1\.3\.9\)/);
  assert.match(releaseNotes, /\[Version 1\.3\.7\]\(https:\/\/github\.com\/mohamedmoheyeldin\/ccrs-file-processing-framework-js\/releases\/tag\/v1\.3\.7\) Internal Release Notes/);
  assert.match(releaseNotes, /Version 1\.3\.7 was released internally/);
  assert.match(releaseNotes, /\[Version 1\.3\.6\]\(https:\/\/github\.com\/mohamedmoheyeldin\/ccrs-file-processing-framework-js\/releases\/tag\/v1\.3\.6\)/);
  assert.match(releaseNotes, /\[Version 1\.3\.5\]\(https:\/\/github\.com\/mohamedmoheyeldin\/ccrs-file-processing-framework-js\/releases\/tag\/v1\.3\.5\)/);
  assert.match(releaseNotes, /\[Version 1\.3\.3\]\(https:\/\/github\.com\/mohamedmoheyeldin\/ccrs-file-processing-framework-js\/releases\/tag\/v1\.3\.3\)/);
  assert.match(releaseNotes, /\[Version 1\.3\.2\]\(https:\/\/github\.com\/mohamedmoheyeldin\/ccrs-file-processing-framework-js\/releases\/tag\/v1\.3\.2\)/);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Publishes one verified Windows Setup installer")), false);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Uses Electron 43")), false);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Electron sandboxing")), false);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Station selection")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("SEOC")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("live previews")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Converts SEOC.xlsx into 761")), false);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Expands smoke and Windows Electron coverage")), false);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("VAiFAMS")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Referral Numbers and ICNs unique")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("expandable help")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Archive naming")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("nine approved choices")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("same Number and ID never appears in both")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Situational SEOC choice")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Network")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Starts selected uploads together")), true);
  assert.equal(versionConfig.releaseNotes.some((note) => note.includes("Updates Electron to")), false);
  const userReleaseCopy = versionConfig.releaseNotes.join(" ");
  assert.doesNotMatch(userReleaseCopy, /Electron|smoke test|pnpm|deterministic|test coverage|SEOC\.xlsx|17-character|JSON|gzip|SHA-256/i);
  assert.equal(packageConfig.scripts["test:smoke"], "node scripts/smoke-test.js");
  assert.equal(packageConfig.scripts["test:syntax"], "node scripts/syntax-check.js");
  assert.equal(crypto.createHash("sha256").update(iconPng).digest("hex"), "dc3b2ab2b0beda8d92527552f2160be83572018c5bf17c0a6cca7c21c013cb95");
  assert.deepEqual([...iconIco.subarray(0, 4)], [0, 0, 1, 0]);
  assert.equal(iconIco.readUInt16LE(4), 7);
  assert.equal(packageConfig.build.files.includes("assets/icons/ccrs_app_icon.ico"), true);
  assert.equal(packageConfig.build.files.includes("assets/icons/ccrs_app_icon.png"), true);
  assert.equal(packageConfig.build.win.icon, "assets/icons/ccrs_app_icon.ico");
  assert.equal(packageConfig.build.win.signAndEditExecutable, true);
  assert.equal(Object.prototype.hasOwnProperty.call(packageConfig.build.win, "signExecutable"), false);
  assert.equal(packageConfig.build.nsis.installerIcon, "assets/icons/ccrs_app_icon.ico");
  assert.equal(packageConfig.build.nsis.uninstallerIcon, "assets/icons/ccrs_app_icon.ico");
  assert.equal(packageConfig.build.nsis.installerHeaderIcon, "assets/icons/ccrs_app_icon.ico");
  assert.match(rendererHtml, /ccrs_app_icon\.ico/);
  assert.equal((rendererHtml.match(/ccrs_app_icon\.png/g) || []).length, 2);
  assert.match(rendererHtml, /class="release-announcement-scroll"/);
  assert.match(rendererHtml, />Start Using The App</);
  assert.match(rendererHtml, /Content-Security-Policy/);
  assert.match(rendererHtml, /id="cancel-job"/);
  assert.match(rendererHtml, /id="job-progress-wrap"/);
  assert.match(rendererHtml, /id="job-progress-label"/);
  assert.match(rendererHtml, /id="job-progress-value"/);
  assert.match(rendererHtml, /aria-live="polite"/);
  assert.match(rendererHtml, /compactSelect\.js/);
  assert.match(rendererStyles, /\.compact-select-menu\s*\{[^}]*max-height:\s*260px/s);
  assert.match(rendererStyles, /--control-height:\s*48px/);
  assert.match(rendererStyles, /--control-touch-target:\s*44px/);
  assert.match(rendererStyles, /\.field-block\s*\{[^}]*align-content:\s*start/s);
  assert.match(rendererStyles, /\.upload-target-grid\s*\{[^}]*minmax\(0, 2fr\) minmax\(0, 3fr\)/s);
  assert.match(rendererStyles, /\.upload-target-grid\s*\{[^}]*align-items:\s*start/s);
  assert.doesNotMatch(rendererStyles, /\.upload-target-grid\s*\{[^}]*180px/s);
  assert.match(rendererApp, /stationIdCombobox\.contains\(document\.activeElement\)/);
  assert.match(workflowPolicy, /REFERRAL_UPLOAD_TARGET_NAMES = Object\.freeze\(\["SQA", "DEV", "PPD"\]\)/);
  assert.match(rendererApp, /PROD is not available for Referral Files/);
  assert.match(jobUi, /progressElement\.removeAttribute\("value"\)/);
  assert.match(jobUi, /percent/);
  assert.match(compactSelect, /aria-controls/);
  assert.match(compactSelect, /event\.key === "Home" \|\| event\.key === "End"/);
  assert.match(compactSelect, /aria-invalid/);
  assert.match(rendererStyles, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(rendererStyles, /\.release-announcement-scroll\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(mainProcess, /ccrs_app_icon\.ico/);
  assert.equal(fs.existsSync(path.join(projectRoot, ".github", "release.yml")), false);
  assert.match(releaseWorkflow, /\$config\.releaseTag/);
  assert.match(releaseWorkflow, /pnpm test/);
  assert.match(releaseWorkflow, /pnpm run test:e2e/);
  assert.match(releaseWorkflow, /pnpm audit --prod/);
  assert.doesNotMatch(releaseWorkflow, /portable executables are not generated/i);
  assert.match(releaseWorkflow, /Get-AuthenticodeSignature/);
  assert.match(releaseWorkflow, /Install and launch the packaged application/);
  assert.match(releaseWorkflow, /must include at least one releaseNotes entry/);
  assert.match(releaseWorkflow, /gh release upload[\s\S]*--clobber/);
  assert.match(releaseWorkflow, /gh release edit/);
  assert.doesNotMatch(releaseWorkflow, /--generate-notes/);
  assert.match(buildReleaseScript, /"--publish",\s*"never"/);
  assert.match(smokeWorkflow, /pull_request:/);
  assert.match(smokeWorkflow, /pnpm test/);
  assert.match(smokeWorkflow, /Electron E2E \(Windows\)/);
  assert.match(mainProcess, /sandbox:\s*true/);
  assert.match(mainProcess, /jobWorker\.js/);
  assert.match(mainProcess, /backend:cancel/);
  assert.match(mainProcess, /Background generation did not return its archive and manifest/);
  assert.match(rendererHtml, /id="pre-run-overlay"/);
  assert.match(rendererHtml, /id="retry-failed-uploads"/);
  assert.doesNotMatch(rendererHtml, /id="recent-runs"/);
  assert.doesNotMatch(rendererHtml, /id="generation-preset"/);
  assert.doesNotMatch(rendererHtml, /id="generation-preset-name"/);
  assert.doesNotMatch(rendererApp, /renderRecentRuns|GenerationPreset/);
  assert.match(jobUi, /normalizedPhase/);
});

test("Workflow policy is authoritative for Referral and LEIE upload environments", () => {
  assert.deepEqual(allowedUploadTargets("referral"), ["SQA", "DEV", "PPD"]);
  assert.deepEqual(allowedUploadTargets("leie"), ["SQA", "DEV", "PPD", "PROD"]);
});

test("Network choices can stay automatic or rotate across a selected subset", () => {
  const automatic = { Referrals: [{ Network: "SOURCE1" }, { Network: "SOURCE2" }] };
  applySelectedNetworks(automatic, {});
  assert.deepEqual(automatic.Referrals.map((item) => item.Network), ["SOURCE1", "SOURCE2"]);

  const selected = { Referrals: Array.from({ length: 6 }, () => ({ Network: "SOURCE" })) };
  applySelectedNetworks(selected, { selectedNetworks: ["CCN2", "CCN4"] });
  assert.deepEqual(new Set(selected.Referrals.map((item) => item.Network)), new Set(["CCN2", "CCN4"]));
  assert.deepEqual(NETWORK_VALUES, ["CCN1", "CCN2", "CCN3", "CCN4", "CCN5"]);
  assert.throws(() => applySelectedNetworks({ Referrals: [{}] }, { selectedNetworks: ["OTHER"] }), /not available/);
});

test("Selected upload targets run concurrently and one failure does not stop the others", async () => {
  const targets = ["SQA", "DEV", "PPD"].map((serverName) => ({
    server_name: serverName,
    user_name: `${serverName.toLowerCase()}-user`,
    remote_directory: `/${serverName.toLowerCase()}`,
    connection_details: {},
  }));
  let active = 0;
  let maxActive = 0;
  const events = [];
  const results = await uploadTargetsInParallel("fixture.gz", targets, {
    onProgress: (event) => events.push(event),
    upload: async (_localPath, remoteDirectory) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, remoteDirectory === "/dev" ? 5 : 15));
      active -= 1;
      if (remoteDirectory === "/dev") throw new Error("mock DEV connection failed");
      return `${remoteDirectory}/fixture.gz`;
    },
  });
  assert.equal(maxActive, 3);
  assert.deepEqual(results.map((item) => item.serverName), ["SQA", "DEV", "PPD"]);
  assert.deepEqual(results.map((item) => item.status), ["completed", "failed", "completed"]);
  assert.equal(events.filter((event) => event.state === "uploading").length, 3);
  assert.equal(events.at(-1).state, "upload-batch-warning");
});

test("Source and output safety rejects identical and nested folders", () => {
  const inputDir = path.join(tempRoot, "safe-path-input");
  const outputDir = path.join(tempRoot, "safe-path-output");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  assert.throws(() => assertSafeFolderRelationship(inputDir, inputDir), /must be different/);
  assert.throws(() => assertSafeFolderRelationship(inputDir, path.join(inputDir, "nested")), /cannot be nested/);
  assert.doesNotThrow(() => assertSafeFolderRelationship(inputDir, outputDir));
  assert.equal(stripWindowsExtendedPathPrefix("\\\\?\\C:\\Temp\\Input"), "C:\\Temp\\Input");
  assert.equal(stripWindowsExtendedPathPrefix("\\\\?\\UNC\\server\\share\\Input"), "\\\\server\\share\\Input");
});

test("Referral schema preflight reports malformed business input", () => {
  const invalidJson = writeJsonFixture("invalid-referral-shape.json", { NotReferrals: [] });
  const result = validateReferralFile(invalidJson);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Referrals field must be an array/);
});

test("Atomic writes replace files without leaving temporary artifacts", () => {
  const targetPath = path.join(tempRoot, "atomic", "settings.json");
  writeFileAtomic(targetPath, "first\n");
  writeFileAtomic(targetPath, "second\n");
  assert.equal(fs.readFileSync(targetPath, "utf8"), "second\n");
  assert.deepEqual(fs.readdirSync(path.dirname(targetPath)), ["settings.json"]);
});

test("Credential imports preserve the source and remain readable", () => {
  const sourcePath = writeJsonFixture("credential-source.json", [{ Host: "example", UserName: "user", Password: "secret" }]);
  const destinationPath = path.join(tempRoot, "secure", "credentials.json");
  importCredentialFile(sourcePath, destinationPath);
  assert.equal(fs.existsSync(sourcePath), true);
  assert.equal(parseCredentialFile(destinationPath).entries[0].Password, "secret");
});

test("Diagnostic export excludes credentials and user file paths", async () => {
  const outputDir = path.join(tempRoot, "diagnostics");
  const result = await backend.handleCommand("export-diagnostics", { outputDir });
  const reportText = fs.readFileSync(result.reportPath, "utf8");
  const report = JSON.parse(reportText);
  assert.equal(report.appVersion, "1.4.2");
  assert.equal(Object.prototype.hasOwnProperty.call(report.workflowPreferences, "inputDir"), false);
  assert.doesNotMatch(reportText, /password|ciphertext|connection_details/i);
});

test("Large source files are rejected before processing", () => {
  const sourcePath = path.join(tempRoot, "limit-source.json");
  fs.writeFileSync(sourcePath, "1234567890");
  const originalLimit = process.env.CCRS_MAX_SOURCE_FILE_BYTES;
  try {
    process.env.CCRS_MAX_SOURCE_FILE_BYTES = "5";
    assert.throws(() => assertSourceFilesWithinLimits([sourcePath]), /safety limit/);
  } finally {
    if (originalLimit === undefined) delete process.env.CCRS_MAX_SOURCE_FILE_BYTES;
    else process.env.CCRS_MAX_SOURCE_FILE_BYTES = originalLimit;
  }
});

test("Streaming gzip combines referral files without building one giant payload", async () => {
  const outputDir = path.join(tempRoot, "streaming-gzip");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "one.json"), JSON.stringify({ Batch: "A", Referrals: [{ id: 1 }] }));
  fs.writeFileSync(path.join(outputDir, "two.json"), JSON.stringify({ Batch: "A", Referrals: [{ id: 2 }, { id: 3 }] }));
  const archivePath = await zipOutput(outputDir, "stream-test");
  const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(archivePath)).toString("utf8"));
  assert.equal(payload.Batch, "A");
  assert.deepEqual(payload.Referrals.map((item) => item.id), [1, 2, 3]);
});

test("LEIE upload targets use the manual-processing directory without replacing custom paths", () => {
  assert.equal(LEIE_DEFAULT_UPLOAD_DIRECTORY, "/in/manual_process/");
  assert.equal(resolveUploadDirectoryForWorkflow("", "leie"), "/in/manual_process/");
  assert.equal(resolveUploadDirectoryForWorkflow("/CCRA_Uploads", "leie"), "/in/manual_process/");
  assert.equal(resolveUploadDirectoryForWorkflow("/custom/leie/", "leie"), "/custom/leie/");
  assert.equal(resolveUploadDirectoryForWorkflow("/in/manual_process/", "referral"), "/CCRA_Uploads");
});

test("Referral and LEIE upload notes identify their separate default directories", () => {
  const rendererSource = fs.readFileSync(path.join(projectRoot, "electron", "renderer", "app.js"), "utf8");
  assert.match(rendererSource, /CCRS Referral uploads default to/);
  assert.match(rendererSource, /separate from the LEIE Data default/);
  assert.match(rendererSource, /LEIE Data uploads default to/);
  assert.match(rendererSource, /separate from the CCRS Referral default/);
});

test("Payment Authority Code accepts up to 5 digits", () => {
  assert.equal(validatePaymentAuthorityCode("99999"), "99999");
  assert.equal(validatePaymentAuthorityCode("12-345"), "12345");
  assert.throws(
    () => validatePaymentAuthorityCode("100000"),
    /Payment Authority Code must be a whole number between 0 and 99999/
  );
});

test("Payment Authority Code generation increments and stops at 99999", () => {
  assert.equal(generatePaymentAuthorityCodeValue("12345", 3), "12347");
  assert.equal(generatePaymentAuthorityCodeValue("", 1), "10000");
  assert.throws(
    () => generatePaymentAuthorityCodeValue("99999", 2),
    /Payment Authority Code range exceeded/
  );
});

test("Optional override normalization keeps the validated Payment Authority Code", () => {
  const overrides = generateOptionalFieldOverrides({
    StationID: "402",
    PaymentAuthorityCode: "54321",
  });

  assert.equal(overrides.PaymentAuthorityCode, "54321");
  assert.equal(overrides.StationID, "402");
  assert.equal(generateOptionalFieldOverrides({ StationID: "564GF_OLD" }).StationID, "564GF_OLD");
  assert.equal(generateOptionalFieldOverrides({ StationID: "aa" }).StationID, "AA");
  assert.throws(
    () => generateOptionalFieldOverrides({ StationID: "150" }),
    /must exactly match a station_id/
  );
});

test("Station records normalize nulls and de-duplicate by station_key", () => {
  const normalized = normalizeStations([
    { station_key: "2823", station_id: "402HL", station_name: "  Bingham   VA Mobile Clinic " },
    { station_key: "2823", station_id: "DUPLICATE", station_name: "Duplicate" },
    { station_key: "2014", station_id: "NULL", station_name: null, parent_station_id: "642" },
  ]);

  assert.deepEqual(normalized, [
    { station_key: "2823", station_id: "402HL", station_name: "Bingham VA Mobile Clinic" },
    { station_key: "2014", station_id: null, station_name: null, parent_station_id: "642" },
  ]);
  assert.equal(normalizeCell("NULL"), null);
  assert.equal(normalizeCell(" 402HL "), "402HL");
});

test("Bundled station JSON preserves every spreadsheet row and column", () => {
  const bundled = JSON.parse(fs.readFileSync(path.join(projectRoot, "config", "stations.json"), "utf8"));
  assert.equal(bundled.length, 1573);
  assert.equal(new Set(bundled.map((station) => station.station_key)).size, bundled.length);
  assert.equal(new Set(bundled.map((station) => station.station_id)).size, bundled.length);
  assert.deepEqual(Object.keys(bundled[0]), [
    "station_key", "station_id", "visn_id", "is_current", "start_date", "end_date",
    "source_system", "source_entity", "station_name", "last_updated_date",
    "last_updated_user", "vssc_station_id", "parent_station_id", "CPAC",
  ]);
  const missingStationId = bundled.find((station) => station.station_key === "2014");
  assert.equal(missingStationId.station_id, null);
  assert.equal(missingStationId.station_name, null);
  assert.equal(missingStationId.parent_station_id, "642");
  const bingham = bundled.find((station) => station.station_key === "2823");
  assert.equal(bingham.station_id, "402HL");
  assert.equal(bingham.visn_id, "1");
  assert.equal(bingham.parent_station_id, "402");
});

test("Long source-backed Station IDs remain exact through generated JSON and gzip", async () => {
  for (const stationId of ["675GB01", "595GF01", "402"]) {
    assert.equal(generateOptionalFieldOverrides({ StationID: stationId }).StationID, stationId);
    const filePath = writeJsonFixture(`station-${stationId}.json`, {
      ListDate: "2026-08-31 16:25:00",
      Referrals: [{
        ReferralNumber: "VA0000000001",
        Patient: { ICN: "1", FirstName: "A", LastName: "B", SSN: "999-99-0001" },
        ProgramAuthority: { StationID: "402", SeocKey: "69", SeocID: "OLD" },
      }],
    });
    const result = modifyContent(filePath, "", null, "999-99-0001", 1, 1, { StationID: stationId });
    assert.equal(JSON.parse(result.content).Referrals[0].ProgramAuthority.StationID, stationId);
    const outputDir = fs.mkdtempSync(path.join(tempRoot, `station-output-${stationId}-`));
    fs.writeFileSync(path.join(outputDir, "result.json"), result.content);
    const archivePath = await zipOutput(outputDir, `station-${stationId}`);
    const archived = JSON.parse(zlib.gunzipSync(fs.readFileSync(archivePath)).toString("utf8"));
    assert.equal(archived.Referrals[0].ProgramAuthority.StationID, stationId);
  }
});

test("SEOC conversion maps columns, removes version duplicates, and sorts deterministically", () => {
  const worksheet = XLSX.utils.json_to_sheet([
    { "seoc_source_key/Number": 2, seoc_id: "BETA_1.0.1" },
    { "seoc_source_key/Number": 1, seoc_id: "PMR_ACUPUNCTURE INITIAL_1.0.16" },
    { "seoc_source_key/Number": 1, seoc_id: "PMR_ACUPUNCTURE INITIAL_1.0.17" },
    { "seoc_source_key/Number": 3, seoc_id: "ALPHA_1.2.3_REV" },
    { "seoc_source_key/Number": 158, seoc_id: "EUC_EMERGENCY CARE_1.2.7" },
    { "seoc_source_key/Number": 158, seoc_id: "EUC_EMERGENCY CARE_1.2.8" },
  ]);
  assert.deepEqual(convertSeocWorksheet(worksheet), [
    { seocNumber: "3", seocId: "ALPHA_1.2.3_REV", name: "ALPHA", displayName: "ALPHA - 3" },
    { seocNumber: "2", seocId: "BETA_1.0.1", name: "BETA", displayName: "BETA - 2" },
    { seocNumber: "1", seocId: "PMR_ACUPUNCTURE INITIAL_1.0.17", name: "PMR_ACUPUNCTURE INITIAL", displayName: "PMR_ACUPUNCTURE INITIAL - 1" },
  ]);
  assert.deepEqual(splitVersionedSeocId("PMR_ACUPUNCTURE INITIAL_1.0.17").version, [1, 0, 17]);
});

test("Packaged upgrades refresh the installed Station ID and special SEOC catalogs", () => {
  const bundleRoot = path.join(tempRoot, "station-bundle");
  const userDataRoot = path.join(tempRoot, "station-user-data");
  fs.mkdirSync(path.join(bundleRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(userDataRoot, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(bundleRoot, "config", "stations.json"),
    JSON.stringify([{ station_key: "2242", station_id: "614GA01", station_name: "Tremont VA Clinic" }])
  );
  fs.writeFileSync(
    path.join(userDataRoot, "config", "stations.json"),
    JSON.stringify([{ station_key: "old", station_id: "OLD", station_name: "Old station" }])
  );
  fs.writeFileSync(
    path.join(bundleRoot, "config", "seoc_options.json"),
    JSON.stringify([{ seocKey: "1", seocId: "PMR_ACUPUNCTURE INITIAL_1.0.17" }])
  );
  fs.writeFileSync(path.join(userDataRoot, "config", "seoc_options.json"), "[]");
  fs.writeFileSync(
    path.join(bundleRoot, "config", "situational_seoc_options.json"),
    JSON.stringify([{ seocNumber: "158", seocId: "EUC_EMERGENCY CARE_1.2.8", name: "EUC_EMERGENCY CARE" }])
  );
  fs.writeFileSync(path.join(userDataRoot, "config", "situational_seoc_options.json"), "[]");

  const originalPackaged = process.env.CCRS_IS_PACKAGED;
  const originalBundleRoot = process.env.CCRS_BUNDLE_ROOT;
  const originalUserDataRoot = process.env.CCRS_USER_DATA_ROOT;
  try {
    process.env.CCRS_IS_PACKAGED = "1";
    process.env.CCRS_BUNDLE_ROOT = bundleRoot;
    process.env.CCRS_USER_DATA_ROOT = userDataRoot;
    ensureRuntimeFiles();
    const installed = JSON.parse(fs.readFileSync(path.join(userDataRoot, "config", "stations.json"), "utf8"));
    assert.equal(installed[0].station_id, "614GA01");
    const installedSeocs = JSON.parse(fs.readFileSync(path.join(userDataRoot, "config", "seoc_options.json"), "utf8"));
    assert.equal(installedSeocs[0].seocKey, "1");
    const installedSituationalSeocs = JSON.parse(
      fs.readFileSync(path.join(userDataRoot, "config", "situational_seoc_options.json"), "utf8")
    );
    assert.equal(installedSituationalSeocs[0].seocNumber, "158");
  } finally {
    for (const [key, value] of [
      ["CCRS_IS_PACKAGED", originalPackaged],
      ["CCRS_BUNDLE_ROOT", originalBundleRoot],
      ["CCRS_USER_DATA_ROOT", originalUserDataRoot],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("modifyContent randomizes identity data and matches Referral Number and ICN endings", () => {
  const filePath = writeJsonFixture("random-identities.json", {
    Referrals: [1, 2].map((number) => ({
      ReferralNumber: `VA000000000${number}`,
      Patient: {
        ICN: String(number),
        FirstName: "Test",
        LastName: "Patient",
        SSN: "999-99-0001",
        DOB: "1970-01-01",
      },
      ProgramAuthority: { StationID: "402", SeocKey: "69", SeocID: "OLD" },
    })),
  });

  const result = modifyContent(
    filePath,
    "400",
    null,
    "999-99-0001",
    1,
    1,
    { StationID: "614GA01", SeocKey: "107", SeocID: "PMR_PHYSICAL THERAPY_1.0.12_PRCT" },
    1,
    prepareIcnSettings(),
    1,
    { randomizeSsn: true, randomizeDob: true, matchSuffixLength: 5 }
  );
  const referrals = JSON.parse(result.content).Referrals;

  assert.deepEqual(referrals.map((item) => item.ProgramAuthority.StationID), ["614GA01", "614GA01"]);
  assert.deepEqual(referrals.map((item) => item.ProgramAuthority.SeocKey), ["107", "107"]);
  assert.deepEqual(referrals.map((item) => item.ProgramAuthority.SeocID), [
    "PMR_PHYSICAL THERAPY_1.0.12_PRCT",
    "PMR_PHYSICAL THERAPY_1.0.12_PRCT",
  ]);
  for (const referral of referrals) {
    assert.match(referral.Patient.SSN, /^999-\d{2}-\d{4}$/);
    assert.match(referral.Patient.DOB, /^(19|20)\d{2}-\d{2}-\d{2}$/);
    assert.equal(referral.Patient.ICN.slice(-5), referral.ReferralNumber.slice(-5));
  }
  assert.notEqual(referrals[0].Patient.SSN, referrals[1].Patient.SSN);
});

test("Generated test SSNs always start with 999 and remain unique", () => {
  const generated = Array.from({ length: 1000 }, (_, index) => generateRandomSsn(index + 1));
  assert.equal(new Set(generated).size, generated.length);
  for (const ssn of generated) {
    assert.match(ssn, /^999-\d{2}-\d{4}$/);
  }
  assert.throws(() => validateSsn("995-12-3456"), /must start with 999/);
  assert.doesNotThrow(() => validateSsn("999-12-3456"));
});

test("modifyContent uses only reference Station IDs in random mode", () => {
  const filePath = writeJsonFixture("random-stations.json", {
    Referrals: [
      { ReferralNumber: "VA0000000001", StationID: "BAD", ICN: "1", FirstName: "A", LastName: "B", SSN: "999-99-0001" },
      { ReferralNumber: "VA0000000002", StationID: "BAD", ICN: "2", FirstName: "C", LastName: "D", SSN: "999-99-0001" },
    ],
  });
  const stationIdentityOptions = {
    randomizeStationId: true,
    generatedStationKeys: ["NOT-IN-REFERENCE-LIST"],
  };
  const result = modifyContent(
    filePath,
    "",
    null,
    "999-99-0001",
    1,
    2,
    {},
    1,
    prepareIcnSettings(),
    1,
    stationIdentityOptions
  );
  const secondResult = modifyContent(
    filePath,
    "",
    null,
    "999-99-0001",
    2,
    2,
    {},
    1,
    prepareIcnSettings(),
    1,
    stationIdentityOptions
  );
  const validKeys = new Set(require("../electron/backend/stationCatalog").loadStationOptions().map((option) => option.stationKey));
  const generatedStationIds = [result, secondResult].flatMap((item) =>
    JSON.parse(item.content).Referrals.map((referral) => referral.StationID)
  );
  assert.equal(new Set(generatedStationIds).size, generatedStationIds.length);
  for (const stationId of generatedStationIds) {
    assert.equal(validKeys.has(stationId), true);
    assert.match(stationId, /^[A-Z0-9]{3,7}$/);
    assert.notEqual(stationId, "2242");
  }
});

test("Optional date overrides reject invalid formats", () => {
  assert.throws(
    () => generateOptionalFieldOverrides({ DOB: "03/26/2026" }),
    /DOB must use the format YYYY-MM-DD/
  );
  assert.throws(
    () => generateOptionalFieldOverrides({ ReferralDateTime: "2026-03-26T11:30:00" }),
    /Referral DateTime must use the format YYYY-MM-DD HH:mm:ss/
  );
});

test("Referral number generation preserves the VA prefix and increments", () => {
  assert.equal(generateReferralNumber("123", 1), "VA0000000123");
  assert.equal(generateReferralNumber("123", 2), "VA0000000124");
  assert.equal(generateReferralNumber("ABC123", 2), "VAABC124");
  assert.equal(
    generateReferralNumber("123456789012345678901234567890", 2),
    "VA123456789012345678901234567891"
  );
  assert.equal(
    generateReferralNumber("ALPHABETICREFERRALBODY", 2),
    "VAALPHABETICREFERRALBODY2"
  );
  assert.equal(generateReferralNumber("26S6-00001_TEST", 1), "VA26S6-00001_TEST");
  assert.equal(generateReferralNumber("26S6_TEST-00001", 2), "VA26S6_TEST-00002");
  assert.equal(generateReferralNumber("BODY_TEST", 2), "VABODY_TEST2");
  assert.equal(generateReferralNumber("26S6_TEST-00001", 1, "VA-TEST_"), "VA-TEST_26S6_TEST-00001");
  assert.equal(generateIcnFromReferralNumber("VA26S6_TEST-00001"), "TEST26S6TEST00001");
});

test("Referral uploads reject PROD while preserving it for the separate LEIE workflow", () => {
  assert.throws(
    () => backend.prepareBackgroundPayload("process", {
      upload: {
        enabled: true,
        targets: [{
          server_name: "PROD",
          user_name: "rruser@PROD",
          remote_directory: "/CCRA_Uploads",
        }],
      },
    }),
    /Referral Files can be uploaded only to SQA, DEV, or PPD/
  );
});

test("Referral numbers can use iFAMS and map directly to matching TEST ICNs", () => {
  assert.equal(generateReferralNumber("26S600001", 1, "iFAMS"), "iFAMS26S600001");
  assert.equal(generateReferralNumber("26S600001", 2, "iFAMS"), "iFAMS26S600002");
  assert.equal(generateIcnFromReferralNumber("VA26S600001"), "TEST000026S600001");
  assert.equal(generateIcnFromReferralNumber("iFAMS26S600001"), "TEST000026S600001");
  assert.equal(generateReferralNumber("26S600001", 1, "CCRS"), "CCRS26S600001");
  assert.equal(generateIcnFromReferralNumber("CCRS26S600001", ["CCRS"]), "TEST000026S600001");
  assert.equal(generateIcnFromReferralNumber("CCRS26S600001", ["CCRS"]).length, 17);
  assert.equal(generateReferralNumber("12345", 1, "VA_TEST_"), "VA_TEST_0000012345");
  assert.equal(
    generateReferralNumber("UNLIMITEDBODY", 1, "CUSTOM_PREFIX_WITHOUT_A_CHARACTER_LIMIT_"),
    "CUSTOM_PREFIX_WITHOUT_A_CHARACTER_LIMIT_UNLIMITEDBODY"
  );
  const longIcnOne = generateIcnFromReferralNumber("VA12345678901234567890", [], 1);
  const longIcnTwo = generateIcnFromReferralNumber("VA12345678901234567891", [], 2);
  assert.equal(longIcnOne, "TEST1234567890121");
  assert.equal(longIcnTwo, "TEST1234567890122");
  assert.equal(longIcnOne.length, 17);
  assert.notEqual(longIcnOne, longIcnTwo);
});

test("Referral generation supports VA, iFAMS, combined VAiFAMS, and custom prefix modes", async () => {
  const invalidCustomPreview = await backend.handleCommand("preview", {
    referralReplacementCode: "26S600001",
    identityOptions: { referralPrefixMode: "custom", customReferralPrefix: "" },
  });
  assert.match(invalidCustomPreview.fieldErrors.referralPrefix, /Enter a custom Referral Number prefix/);

  const scenarios = [
    { mode: "va", customReferralPrefix: "", expected: [/^VA/, /^VA/, /^VA/, /^VA/] },
    { mode: "ifams", customReferralPrefix: "", expected: [/^iFAMS/, /^iFAMS/, /^iFAMS/, /^iFAMS/] },
    { mode: "mixed", customReferralPrefix: "", expected: [/^VAiFAMS/, /^VAiFAMS/, /^VAiFAMS/, /^VAiFAMS/] },
    { mode: "custom", customReferralPrefix: "CCRS", expected: [/^CCRS/, /^CCRS/, /^CCRS/, /^CCRS/] },
  ];

  for (const scenario of scenarios) {
    const outputDir = path.join(tempRoot, `prefix-mode-${scenario.mode}`);
    fs.mkdirSync(outputDir, { recursive: true });
    await backend.handleCommand("generate", {
      outputDir,
      fileCount: 1,
      referralsPerFile: 4,
      referralReplacementCode: "26S600001",
      clearOutput: false,
      keepProcessedJson: true,
      archiveBasename: `prefix_${scenario.mode}`,
      icnSettings: { mode: ICN_MODES.REFERRAL_MATCH },
      identityOptions: {
        referralPrefixMode: scenario.mode,
        customReferralPrefix: scenario.customReferralPrefix,
      },
      upload: { enabled: false },
    });
    const jsonName = fs.readdirSync(outputDir).find((name) => name.endsWith(".json") && !name.endsWith(".manifest.json"));
    const referrals = JSON.parse(fs.readFileSync(path.join(outputDir, jsonName), "utf8")).Referrals;
    assert.equal(new Set(referrals.map((referral) => referral.ReferralNumber)).size, 4);
    referrals.forEach((referral, index) => {
      assert.match(referral.ReferralNumber, scenario.expected[index]);
      assert.equal(
        referral.Patient.ICN,
        generateIcnFromReferralNumber(referral.ReferralNumber, [scenario.customReferralPrefix].filter(Boolean))
      );
    });
  }
});

test("modifyContent derives ICNs from unique referral numbers and mixes only selected stations", () => {
  const filePath = writeJsonFixture("matched-referrals.json", {
    Referrals: Array.from({ length: 6 }, (_, index) => ({
      ReferralNumber: `VA000000000${index + 1}`,
      Patient: { ICN: String(index + 1), FirstName: "A", LastName: "B", SSN: "999-99-0001" },
      ProgramAuthority: { StationID: "402" },
    })),
  });
  const result = modifyContent(
    filePath,
    "26S600001",
    null,
    "999-99-0001",
    1,
    1,
    {},
    1,
    prepareIcnSettings({ mode: ICN_MODES.REFERRAL_MATCH }),
    1,
    { selectedStationIds: ["402", "614GA01", "570"], referralPrefix: "VA" }
  );
  const referrals = JSON.parse(result.content).Referrals;
  assert.equal(new Set(referrals.map((item) => item.ReferralNumber)).size, referrals.length);
  for (const referral of referrals) {
    assert.equal(referral.Patient.ICN, generateIcnFromReferralNumber(referral.ReferralNumber));
    assert.equal(["402", "614GA01", "570"].includes(referral.ProgramAuthority.StationID), true);
  }
  assert.equal(new Set(referrals.map((item) => item.ProgramAuthority.StationID)).size, 3);
});

test("Long Referral Numbers stay complete while Referral-derived ICNs remain unique and 17 characters", () => {
  const filePath = writeJsonFixture("long-matched-referrals.json", {
    Referrals: Array.from({ length: 3 }, (_, index) => ({
      ReferralNumber: `VA${index + 1}`,
      Patient: { ICN: String(index + 1), FirstName: "A", LastName: "B", SSN: "999-99-0001" },
    })),
  });
  const result = modifyContent(
    filePath,
    "12345678901234567890",
    null,
    "999-99-0001",
    1,
    1,
    {},
    1,
    prepareIcnSettings({ mode: ICN_MODES.REFERRAL_MATCH }),
    1,
    { referralPrefixMode: "mixed" }
  );
  const referrals = JSON.parse(result.content).Referrals;
  assert.deepEqual(
    referrals.map((item) => item.ReferralNumber),
    [
      "VAiFAMS12345678901234567890",
      "VAiFAMS12345678901234567891",
      "VAiFAMS12345678901234567892",
    ]
  );
  assert.equal(new Set(referrals.map((item) => item.Patient.ICN)).size, referrals.length);
  assert.equal(referrals.every((item) => item.Patient.ICN.length === 17), true);
  assert.deepEqual(
    referrals.map((item) => item.Patient.ICN),
    ["TEST1234567890121", "TEST1234567890122", "TEST1234567890123"]
  );
});

test("Generated batches keep referral numbers unique and share timestamped iFAMS JSON and gzip names", async () => {
  const outputDir = path.join(tempRoot, "ifams-generated-batch");
  fs.mkdirSync(outputDir, { recursive: true });
  await backend.handleCommand("generate", {
    outputDir,
    fileCount: 3,
    referralsPerFile: 4,
    icnSettings: { mode: ICN_MODES.REFERRAL_MATCH },
    identityOptions: {
      randomizeSsn: true,
      randomizeDob: true,
      randomizeStationId: false,
      selectedStationIds: ["402", "570"],
      referralPrefix: "iFAMS",
    },
    archiveBasename: "referrals",
    archiveNamingOptions: { useIfamsPrefix: true },
    keepProcessedJson: true,
  });

  const names = fs.readdirSync(outputDir).sort();
  const gzipName = names.find((name) => name.endsWith(".gz"));
  const manifestName = names.find((name) => name.endsWith(".manifest.json"));
  const jsonNames = names.filter((name) => name.endsWith(".json") && !name.endsWith(".manifest.json"));
  assert.match(gzipName, /^iFAMS_referrals_\d{8}_\d{6}\.gz$/);
  assert.equal(jsonNames.length, 3);
  assert.equal(jsonNames.every((name) => name.startsWith(gzipName.slice(0, -3))), true);
  assert.match(manifestName, /^iFAMS_referrals_\d{8}_\d{6}\.manifest\.json$/);
  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, manifestName), "utf8"));
  assert.equal(manifest.referralNumbers.unique, true);
  assert.equal(manifest.counts.referrals, 12);
  assert.match(manifest.archive.sha256, /^[a-f0-9]{64}$/);

  const referrals = jsonNames.flatMap((name) => JSON.parse(
    fs.readFileSync(path.join(outputDir, name), "utf8")
  ).Referrals);
  assert.equal(referrals.length, 12);
  assert.equal(new Set(referrals.map((item) => item.ReferralNumber)).size, referrals.length);
  for (const referral of referrals) {
    assert.match(referral.ReferralNumber, /^iFAMS/);
    assert.equal(referral.Patient.ICN, generateIcnFromReferralNumber(referral.ReferralNumber));
    assert.equal(["402", "570"].includes(referral.ProgramAuthority?.StationID || referral.StationID), true);
  }
});

test("Keep existing files preserves unrelated JSON and excludes it from the new archive", async () => {
  const outputDir = path.join(tempRoot, "keep-existing-output");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "unrelated.json"), JSON.stringify({ Referrals: [{ ReferralNumber: "OLD" }] }), "utf8");

  const result = await backend.handleCommand("generate", {
    outputDir,
    fileCount: 1,
    referralsPerFile: 2,
    clearOutput: false,
    keepProcessedJson: false,
    archiveBasename: "safe_keep_test",
    identityOptions: { referralPrefix: "VA" },
    upload: { enabled: false },
  });

  assert.equal(fs.existsSync(path.join(outputDir, "unrelated.json")), true);
  const archived = JSON.parse(zlib.gunzipSync(fs.readFileSync(result.archivePath)).toString("utf8"));
  assert.equal(archived.Referrals.length, 2);
  assert.equal(archived.Referrals.some((referral) => referral.ReferralNumber === "OLD"), false);
});

test("A malformed source stops the batch before output or upload artifacts are created", async () => {
  const inputDir = path.join(tempRoot, "fail-closed-input");
  const outputDir = path.join(tempRoot, "fail-closed-output");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, "valid.json"), JSON.stringify({ Referrals: [{ ReferralNumber: "VA0000000001" }] }), "utf8");
  fs.writeFileSync(path.join(inputDir, "invalid.json"), "{ invalid", "utf8");
  fs.writeFileSync(path.join(outputDir, "existing.txt"), "preserve", "utf8");

  await assert.rejects(
    backend.handleCommand("process", {
      inputDir,
      outputDir,
      archiveBasename: "should_not_exist",
      clearOutput: true,
      keepProcessedJson: true,
      upload: { enabled: false },
    }),
    /preflight schema validation failed/
  );
  assert.deepEqual(fs.readdirSync(outputDir), ["existing.txt"]);
});

test("modifyContent applies Payment Authority Code overrides uniquely across referrals", () => {
  const filePath = writeJsonFixture("override-referrals.json", {
    ListDate: "2026-01-01 00:00:00",
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        PaymentAuthorityCode: "12000",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
      {
        ReferralNumber: "VA0000000002",
        PaymentAuthorityCode: "12000",
        ICN: "2",
        FirstName: "Jane",
        LastName: "Doe",
        SSN: "222-22-2222",
      },
    ],
  });

  const result = modifyContent(
    filePath,
    "200",
    "2026-03-26 11:30:00",
    "999-99-0001",
    1,
    1,
    { PaymentAuthorityCode: "55550" },
    1
  );
  const parsed = JSON.parse(result.content);

  assert.deepEqual(
    parsed.Referrals.map((item) => item.PaymentAuthorityCode),
    ["55550", "55551"]
  );
  assert.deepEqual(
    parsed.Referrals.map((item) => item.ReferralNumber),
    ["VA0000000200", "VA0000000201"]
  );
  assert.equal(parsed.ListDate, "2026-03-26 11:30:00");
});

test("modifyContent keeps TEST and generates unique ICNs by default", () => {
  const filePath = writeJsonFixture("default-icn.json", {
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
      {
        ReferralNumber: "VA0000000002",
        ICN: "2",
        FirstName: "Jane",
        LastName: "Doe",
        SSN: "222-22-2222",
      },
    ],
  });

  const result = modifyContent(filePath, "", null, "999-99-0001", 1, 1, {}, 1);
  const parsed = JSON.parse(result.content);

  assert.match(parsed.Referrals[0].ICN, /^TEST\d{13}$/);
  assert.match(parsed.Referrals[1].ICN, /^TEST\d{13}$/);
  assert.notEqual(parsed.Referrals[0].ICN, parsed.Referrals[1].ICN);
});

test("modifyContent supports a custom suffix after TEST", () => {
  const filePath = writeJsonFixture("custom-test-icn.json", {
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
      {
        ReferralNumber: "VA0000000002",
        ICN: "2",
        FirstName: "Jane",
        LastName: "Doe",
        SSN: "222-22-2222",
      },
    ],
  });

  const result = modifyContent(
    filePath,
    "",
    null,
    "999-99-0001",
    1,
    1,
    {},
    1,
    prepareIcnSettings({ mode: ICN_MODES.TEST_CUSTOM_SUFFIX, value: "Ab12" }),
    1
  );
  const parsed = JSON.parse(result.content);

  assert.match(parsed.Referrals[0].ICN, /^TESTAb12[A-Z0-9]{9}$/);
  assert.match(parsed.Referrals[1].ICN, /^TESTAb12[A-Z0-9]{9}$/);
  assert.notEqual(parsed.Referrals[0].ICN, parsed.Referrals[1].ICN);
});

test("modifyContent supports a fully custom ICN base", () => {
  const filePath = writeJsonFixture("custom-full-icn.json", {
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
      {
        ReferralNumber: "VA0000000002",
        ICN: "2",
        FirstName: "Jane",
        LastName: "Doe",
        SSN: "222-22-2222",
      },
    ],
  });

  const result = modifyContent(
    filePath,
    "",
    null,
    "999-99-0001",
    1,
    1,
    {},
    1,
    prepareIcnSettings({ mode: ICN_MODES.CUSTOM_FULL, value: "AbCd12" }),
    1
  );
  const parsed = JSON.parse(result.content);

  assert.match(parsed.Referrals[0].ICN, /^AbCd12[A-Z0-9]{11}$/);
  assert.equal(parsed.Referrals[0].ICN.length, 17);
  assert.equal(parsed.Referrals[1].ICN.length, 17);
  assert.notEqual(parsed.Referrals[0].ICN, parsed.Referrals[1].ICN);
});

test("modifyContent rejects source files with oversized Payment Authority Code values", () => {
  const filePath = writeJsonFixture("invalid-payment-authority-code.json", {
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        PaymentAuthorityCode: "123456",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
    ],
  });

  assert.throws(
    () => modifyContent(filePath, "", null, "999-99-0001", 1, 1, {}, 1),
    /Payment Authority Code must be a whole number between 0 and 99999/
  );
});

test("runtime cleanup removes tracked temp directories and stale known temp files", () => {
  const trackedDir = registerTemporaryPath(fs.mkdtempSync(path.join(os.tmpdir(), "ccrs_referral_generator_")));
  fs.writeFileSync(path.join(trackedDir, "generated.json"), "{}", "utf8");

  const staleWinscpScript = path.join(os.tmpdir(), `winscp_upload_${Date.now()}_smoke.txt`);
  fs.writeFileSync(staleWinscpScript, "exit", "utf8");
  const staleDate = new Date(Date.now() - 10 * 60 * 1000);
  fs.utimesSync(staleWinscpScript, staleDate, staleDate);

  const removedStaleCount = cleanupKnownTemporaryArtifacts({ minimumAgeMs: 5 * 60 * 1000 });
  assert.equal(removedStaleCount, 1);
  assert.equal(fs.existsSync(staleWinscpScript), false);

  const removedRuntimeCount = cleanupRuntimeArtifacts();
  assert.equal(removedRuntimeCount >= 1, true);
  assert.equal(fs.existsSync(trackedDir), false);
});

test("Upload profile summary reports server and user counts", () => {
  const summary = summarizeUploadProfiles({
    servers: [{ name: "DEV" }, { name: "SQA" }],
    users: [{ name: "devuser" }, { name: "sqauser" }, { name: "extrauser" }],
  });

  assert.deepEqual(summary, {
    serverCount: 2,
    userCount: 3,
    targetNames: ["DEV", "SQA"],
  });
});

test("App info exposes the complete searchable station source", async () => {
  const info = await backend.handleCommand("info", {});

  assert.equal(Array.isArray(info.stations), true);
  assert.equal(info.stations.length, 1573);

  const stationKeys = info.stations.map((station) => station.station_key);
  assert.equal(new Set(stationKeys).size, stationKeys.length);

  const sample = info.stations.find((station) => station.station_id === "402");
  assert.equal(Boolean(sample), true);
  assert.match(sample.station_name, /Togus VA Medical Center/);
  const tremont = info.stations.find((station) => station.station_id === "614GA01");
  assert.equal(Boolean(tremont), true);
  assert.match(tremont.station_name, /Tremont VA Clinic/);
  assert.equal(Object.hasOwn(info.constants, "stationIdMaxLength"), false);
});

test("App info exposes valid synchronized SEOC pairs", async () => {
  const info = await backend.handleCommand("info", {});
  assert.equal(Array.isArray(info.seocOptions), true);
  assert.equal(info.seocOptions.length, 752);
  assert.equal(Array.isArray(info.situationalSeocOptions), true);
  assert.equal(info.situationalSeocOptions.length, 9);
  const acupuncture = info.seocOptions.find((option) => option.displayName === "PMR_ACUPUNCTURE INITIAL - 1");
  assert.equal(acupuncture.seocKey, "1");
  assert.equal(acupuncture.seocNumber, "1");
  assert.equal(acupuncture.seocId, "PMR_ACUPUNCTURE INITIAL_1.0.17");
  assert.equal(resolveSeocSelection([acupuncture.selectorKey])[0].seocId, acupuncture.seocId);
  assert.equal(resolveSeocSelection([], true).length, 752);
  assert.equal(resolveSeocSelection([], true, "situational").length, 9);
  assert.deepEqual(
    getSituationalSeocOptions().map((option) => [option.seocNumber, option.seocId]),
    [
      ["158", "EUC_EMERGENCY CARE_1.2.8"],
      ["191", "EUC_POM USE ONLY UNAUTHORIZED EMERGENCY ROOM CARE_1.4.2_PRCT"],
      ["203", "INF_FERTILITY-1334 BIRTH SEX FEMALE VETERAN_1.4.14"],
      ["207", "INF_FERTILITY-1334 BIRTH SEX MALE VETERAN_1.5.14"],
      ["268", "MHC_MENTAL HEALTH RESIDENTIAL TREATMENT_1.15.7"],
      ["1160", "MHC_RESIDENTIAL WITHDRAWAL MANAGEMENT_1.22.2"],
      ["246", "MSC_CRYOPRESERVATION STORAGE FOR IVF-ART_1.8.1_PRCT"],
      ["67", "MSC_INFERTILITY-IUI FEMALE_1.3.3_PRCT"],
      ["233", "SSC_TRANSPLANT BONE MARROW COMP EVAL_1.11.2_PRCT"],
    ]
  );
  const regularIdentities = new Set(info.seocOptions.map((option) => `${option.seocNumber}\u0000${option.name}`));
  assert.equal(
    info.situationalSeocOptions.some((option) => regularIdentities.has(`${option.seocNumber}\u0000${option.name}`)),
    false
  );
  assert.throws(() => resolveSeocSelection(["missing::value"]), /no longer available/);
});

test("SEOC and Situational SEOC selections remain paired in generated output", () => {
  const specialKeys = new Set(["67", "158", "191", "203", "207", "233", "246", "268", "1160"]);
  for (const templatePath of fs.readdirSync(path.join(projectRoot, "templates", "referrals"))) {
    const template = JSON.parse(fs.readFileSync(path.join(projectRoot, "templates", "referrals", templatePath), "utf8"));
    for (const referral of template.Referrals || []) {
      assert.equal(specialKeys.has(String(referral.ProgramAuthority?.SeocKey || "")), false);
    }
  }

  const filePath = writeJsonFixture("special-seoc.json", {
    Referrals: [{
      ReferralNumber: "VA0000000001",
      Patient: { ICN: "1", FirstName: "A", LastName: "B", SSN: "999-99-0001" },
      ProgramAuthority: { StationID: "402", SeocKey: "69", SeocID: "RAD_INTERVENTIONAL RADIOLOGY_1.0.12_REV_PRCT" },
    }],
  });
  const result = modifyContent(
    filePath,
    "",
    null,
    "999-99-0001",
    1,
    1,
    {},
    1,
    prepareIcnSettings(),
    1,
    {
      selectedSeocPairs: [{ seocKey: "1", seocId: "PMR_ACUPUNCTURE INITIAL_1.0.17" }],
      selectedSituationalSeocPairs: [{ seocKey: "158", seocId: "EUC_EMERGENCY CARE_1.2.8" }],
    }
  );
  const authority = JSON.parse(result.content).Referrals[0].ProgramAuthority;
  assert.equal(authority.SeocKey, "1");
  assert.equal(authority.SeocID, "PMR_ACUPUNCTURE INITIAL_1.0.17");
  assert.equal(authority.SituationalSeocKey, "158");
  assert.equal(authority.SituationalSeocID, "EUC_EMERGENCY CARE_1.2.8");
});

test("Archive basename can append Network and Referral DateTime safely", () => {
  const now = new Date(2026, 3, 2, 9, 8, 7);
  const archiveBasename = buildArchiveBasename({
    archiveBasename: "My Custom Export",
    archiveNamingOptions: {
      includeNetwork: true,
      includeReferralDateTime: true,
    },
    optionalOverrides: {
      Network: "CCN1",
      ReferralDateTime: "2026-04-01 13:45:00",
    },
  }, now);

  assert.equal(archiveBasename, "My_Custom_Export_CCN1_2026-04-01_134500_20260402_090807");
  assert.equal(formatArchiveReferralDateTime("2026-04-01 13:45:00"), "2026-04-01_134500");
  assert.equal(formatCurrentDateTime(now), "20260402_090807");
  assert.equal(
    buildArchiveBasename({
      archiveBasename: "referrals",
      archiveNamingOptions: { useIfamsPrefix: true },
    }, now),
    "iFAMS_referrals_20260402_090807"
  );
  assert.equal(
    buildArchiveBasename({
      archiveBasename: "iFAMS_referrals",
      archiveNamingOptions: { useIfamsPrefix: true },
    }, now),
    "iFAMS_referrals_20260402_090807"
  );
});

test("Archive naming modes share safe JSON and gzip filenames", () => {
  const now = new Date(2026, 7, 31, 16, 25, 0);
  const basePayload = {
    referralReplacementCode: "12345",
    identityOptions: { referralPrefixMode: "va" },
    optionalOverrides: { Network: "Network1", ReferralDateTime: "2026-08-31 16:25:00" },
  };
  const scenarios = [
    ["referral-number", "VA12345_Final"],
    ["network", "Network1_VA12345_Final"],
    ["referral-date-time", "VA12345_2026-08-31_162500_Final"],
  ];
  for (const [mode, expected] of scenarios) {
    assert.equal(buildArchiveBasename({ ...basePayload, archiveNamingOptions: { mode } }, now), expected);
  }
  const custom = buildOutputFileNames({
    ...basePayload,
    archiveNamingOptions: {
      mode: "custom",
      customText: "DEV:CCRS",
      customValues: ["referralNumber", "customText"],
    },
  }, now);
  assert.deepEqual(custom, {
    basename: "VA12345_DEV_CCRS_Final",
    json: "VA12345_DEV_CCRS_Final.json",
    gzip: "VA12345_DEV_CCRS_Final.gz",
  });
  assert.equal(
    buildArchiveBasename({ ...basePayload, archiveNamingOptions: { mode: "prefix" } }, now),
    "VA12345_Final"
  );
  assert.equal(
    buildArchiveBasename({
      ...basePayload,
      optionalOverrides: {
        Network: "Network1",
        ReferralDate: "2026-08-30",
        ReferralDateTime: "2026-08-31 16:25:00",
      },
      archiveNamingOptions: {
        mode: "custom",
        customText: "DEV",
        customValues: ["customText", "dateTime", "date", "networkName", "referralPrefix", "referralNumber"],
      },
    }, now),
    "VA12345_VA_Network1_2026-08-30_2026-08-31_162500_DEV_Final"
  );
  assert.throws(
    () => buildArchiveBasename({ ...basePayload, archiveNamingOptions: { mode: "custom", customValues: [] } }, now),
    /Choose at least one value/
  );
  assert.throws(
    () => buildArchiveBasename({
      ...basePayload,
      optionalOverrides: {},
      archiveNamingOptions: { mode: "custom", customValues: ["networkName"] },
    }, now),
    /Choose a Network/
  );
  assert.throws(
    () => buildArchiveBasename({
      ...basePayload,
      archiveNamingOptions: { mode: "custom", customValues: ["customText"] },
    }, now),
    /Enter Custom text/
  );
});

test("UI settings normalize legacy theme values and persist user choices", () => {
  const originalOverride = process.env.CCRS_USER_DATA_ROOT;
  const settingsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-user-settings-"));

  try {
    process.env.CCRS_USER_DATA_ROOT = settingsRoot;

    const normalized = normalizeUiSettings({
      theme_mode: "Dark",
      archiveAppendNetwork: true,
      archiveAppendReferralDateTime: true,
      archiveBasename: "my_exports",
      uploadTargets: {
        DEV: {
          enabled: true,
          userName: "devuser",
          remoteDirectory: "/CCRA_Uploads",
        },
      },
    });

    assert.equal(normalized.theme, "dark");
    assert.equal(normalized.archiveAppendNetwork, true);
    assert.equal(normalized.archiveAppendReferralDateTime, true);
    assert.equal(normalized.uploadTargets.DEV.userName, "devuser");
    assert.equal(normalized.acknowledgedReleaseKey, "");
    assert.equal(normalizeUiSettings({ useIfamsReferralPrefix: true }).referralPrefixMode, "ifams");
    assert.equal(normalizeUiSettings({ referralPrefixMode: "mixed" }).referralPrefixMode, "mixed");
    assert.equal(
      normalizeUiSettings({ referralPrefixMode: "custom", customReferralPrefix: "CCRS_TEST" }).customReferralPrefix,
      "CCRS_TEST"
    );
    assert.equal(
      normalizeUiSettings({ referralPrefixMode: "custom", customReferralPrefix: "CCRS-TEST_" }).customReferralPrefix,
      "CCRS-TEST_"
    );
    const longReferralPrefix = "CCRS_LONG_REFERRAL_PREFIX_WITHOUT_A_CHARACTER_LIMIT";
    assert.equal(
      normalizeUiSettings({ referralPrefixMode: "custom", customReferralPrefix: longReferralPrefix }).customReferralPrefix,
      longReferralPrefix
    );
    const namedSettings = normalizeUiSettings({
      archiveNamingMode: "custom",
      archiveCustomText: "DEV",
      archiveCustomValues: ["networkName", "referralNumber", "networkName"],
      selectedSeocKeys: ["1::A", "1::A"],
      useAllSituationalSeocs: true,
    });
    assert.equal(namedSettings.schemaVersion, 4);
    assert.equal(namedSettings.archiveNamingMode, "custom");
    assert.deepEqual(namedSettings.archiveCustomValues, ["referralNumber", "networkName"]);
    assert.deepEqual(namedSettings.selectedSeocKeys, ["1::A"]);
    assert.equal(namedSettings.useAllSituationalSeocs, true);
    assert.deepEqual(
      normalizeUiSettings({ overrideSeocKey: "107", overrideSeocId: "PMR_PHYSICAL THERAPY_1.0.12_PRCT" }).selectedSeocKeys,
      ["107::PMR_PHYSICAL%20THERAPY_1.0.12_PRCT"]
    );

    saveUiSettings({
      ...DEFAULT_UI_SETTINGS,
      theme: "dark",
      archiveBasename: "session_export",
      archiveAppendNetwork: true,
      archiveNamingMode: "custom",
      archiveCustomValues: ["referralNumber", "customText"],
      archiveCustomText: "CCRS",
      selectedSeocKeys: ["1::PMR"],
      selectedSituationalSeocKeys: ["107::PT"],
      acknowledgedReleaseKey: "1.2.0|Production V1.2",
    });

    const loaded = loadUiSettings();
    assert.equal(loaded.theme, "dark");
    assert.equal(loaded.archiveBasename, "session_export");
    assert.equal(loaded.archiveAppendNetwork, true);
    assert.equal(loaded.archiveNamingMode, "custom");
    assert.equal(loaded.archiveCustomText, "CCRS");
    assert.deepEqual(loaded.archiveCustomValues, ["referralNumber", "customText"]);
    assert.deepEqual(loaded.selectedSeocKeys, ["1::PMR"]);
    assert.deepEqual(loaded.selectedSituationalSeocKeys, ["107::PT"]);
    assert.equal(loaded.acknowledgedReleaseKey, "1.2.0|Production V1.2");
    assert.deepEqual(
      normalizeUiSettings({ archiveCustomPattern: "{customText}_{referralNumber}_Final" }).archiveCustomValues,
      ["referralNumber", "customText"]
    );
    assert.equal(normalizeUiSettings({ archiveNamingMode: "prefix" }).archiveNamingMode, "referral-number");
  } finally {
    if (originalOverride === undefined) {
      delete process.env.CCRS_USER_DATA_ROOT;
    } else {
      process.env.CCRS_USER_DATA_ROOT = originalOverride;
    }
    fs.rmSync(settingsRoot, { recursive: true, force: true });
  }
});

test("App info exposes one-time release announcement metadata", async () => {
  const originalOverride = process.env.CCRS_USER_DATA_ROOT;
  const settingsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-release-announcement-"));

  try {
    process.env.CCRS_USER_DATA_ROOT = settingsRoot;

    const initialInfo = await backend.handleCommand("info", {});
    assert.equal(initialInfo.appVersion.version, "1.4.2");
    assert.equal(initialInfo.appVersion.label, "Version 1.4.2");
    assert.equal(Array.isArray(initialInfo.releaseAnnouncement.notes), true);
    assert.equal(initialInfo.releaseAnnouncement.notes.length > 0, true);
    assert.equal(initialInfo.releaseAnnouncement.shouldShow, true);

    await backend.handleCommand("acknowledge-release-announcement", {
      releaseKey: initialInfo.releaseAnnouncement.releaseKey,
    });

    const acknowledgedInfo = await backend.handleCommand("info", {});
    assert.equal(acknowledgedInfo.releaseAnnouncement.shouldShow, false);
    assert.equal(loadUiSettings().acknowledgedReleaseKey, initialInfo.releaseAnnouncement.releaseKey);
  } finally {
    if (originalOverride === undefined) {
      delete process.env.CCRS_USER_DATA_ROOT;
    } else {
      process.env.CCRS_USER_DATA_ROOT = originalOverride;
    }
    fs.rmSync(settingsRoot, { recursive: true, force: true });
  }
});

test("Release notes appear once after upgrading from an older release", async () => {
  const originalOverride = process.env.CCRS_USER_DATA_ROOT;
  const settingsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-release-upgrade-"));
  const olderReleaseKey = "v1.2.5|Version 1.2.5|2026-08-19";

  try {
    process.env.CCRS_USER_DATA_ROOT = settingsRoot;
    saveUiSettings({
      ...DEFAULT_UI_SETTINGS,
      acknowledgedReleaseKey: olderReleaseKey,
    });

    const upgradedInfo = await backend.handleCommand("info", {});
    assert.equal(upgradedInfo.releaseAnnouncement.acknowledgedReleaseKey, olderReleaseKey);
    assert.notEqual(upgradedInfo.releaseAnnouncement.releaseKey, olderReleaseKey);
    assert.equal(upgradedInfo.releaseAnnouncement.notes.length > 0, true);
    assert.equal(upgradedInfo.releaseAnnouncement.shouldShow, true);

    await backend.handleCommand("acknowledge-release-announcement", {
      releaseKey: upgradedInfo.releaseAnnouncement.releaseKey,
    });

    const acknowledgedInfo = await backend.handleCommand("info", {});
    assert.equal(acknowledgedInfo.releaseAnnouncement.shouldShow, false);
  } finally {
    if (originalOverride === undefined) {
      delete process.env.CCRS_USER_DATA_ROOT;
    } else {
      process.env.CCRS_USER_DATA_ROOT = originalOverride;
    }
    fs.rmSync(settingsRoot, { recursive: true, force: true });
  }
});

test("LEIE inspection detects duplicates and LEIE processing removes them when configured", async () => {
  const sourceDir = fs.mkdtempSync(path.join(tempRoot, "leie-source-"));
  const outputDir = fs.mkdtempSync(path.join(tempRoot, "leie-output-"));
  const sourcePath = path.join(sourceDir, "leie_source.xlsx");

  writeXlsxFixture(sourcePath, [
    { SSN: "111-11-1111", NPI: "1234567890", Name: "A" },
    { SSN: "222-22-2222", NPI: "1234567891", Name: "B" },
    { SSN: "111-11-1111", NPI: "1234567890", Name: "A" },
  ]);

  const inspection = await backend.handleCommand("inspect-leie-source", {
    inputDir: sourceDir,
    duplicateKey: "full-row",
  });

  assert.equal(inspection.fileCount, 1);
  assert.equal(inspection.outputNameSuggestion, "leie_source");
  assert.equal(inspection.hasDuplicates, true);
  assert.equal(inspection.duplicates.length, 1);
  assert.equal(inspection.duplicates[0].rowNumber, 4);

  await assert.rejects(
    backend.handleCommand("process-leie", {
      inputDir: sourceDir,
      outputDir,
      outputFileName: "processed_leie",
      duplicateKey: "full-row",
      duplicateHandling: "manual",
      upload: { enabled: false, targets: [] },
    }),
    /Duplicates were found/
  );

  const processed = await backend.handleCommand("process-leie", {
    inputDir: sourceDir,
    outputDir,
    outputFileName: "processed_leie",
    duplicateKey: "full-row",
    duplicateHandling: "auto-remove",
    upload: { enabled: false, targets: [] },
  });

  assert.equal(processed.outputFileName, "processed_leie.xlsx");
  assert.equal(fs.existsSync(path.join(outputDir, "processed_leie.xlsx")), true);
  assert.equal(processed.duplicatesRemoved, 1);

  const defaultNamed = await backend.handleCommand("process-leie", {
    inputDir: sourceDir,
    outputDir,
    outputFileName: "",
    duplicateKey: "full-row",
    duplicateHandling: "auto-remove",
    upload: { enabled: false, targets: [] },
  });

  assert.equal(defaultNamed.outputFileName, "leie_source.xlsx");
  assert.equal(fs.existsSync(path.join(outputDir, "leie_source.xlsx")), true);
});

test("SFTP upload verifies the remote file and does not hang when disconnect stalls", async () => {
  const localPath = path.join(tempRoot, "verified-upload.xlsx");
  fs.writeFileSync(localPath, "verified upload payload", "utf8");
  let destroyed = false;
  let uploadedRemotePath = "";

  const fakeClient = {
    client: {
      destroy() {
        destroyed = true;
      },
    },
    async connect() {},
    async stat(remotePath) {
      if (remotePath.endsWith("verified-upload.xlsx")) {
        return { size: fs.statSync(localPath).size };
      }
      return { type: "d" };
    },
    async mkdir() {},
    async put(_sourcePath, remotePath) {
      uploadedRemotePath = remotePath;
    },
    end() {
      return new Promise(() => {});
    },
  };

  const remotePath = await uploadFileWithSftp(
    localPath,
    "/incoming/leie",
    { host: "example.test", port: 22, username: "tester", password: "secret" },
    fakeClient,
    { connectTimeoutMs: 100, operationTimeoutMs: 100, closeTimeoutMs: 10 }
  );

  assert.equal(remotePath, "/incoming/leie/verified-upload.xlsx");
  assert.equal(uploadedRemotePath, remotePath);
  assert.equal(destroyed, true);
});

test("App info prefers the PDF user guide path", async () => {
  const info = await backend.handleCommand("info", {});
  assert.equal(typeof info.docs?.userGuidePath, "string");
  assert.match(info.docs.userGuidePath, /USER_GUIDE\.pdf$/);
});

test("Preview validation reports field-level errors without throwing", async () => {
  const preview = await backend.handleCommand("preview", {
    referralReplacementCode: "123",
    icnSettings: {
      mode: ICN_MODES.TEST_CUSTOM_SUFFIX,
      value: "",
    },
    ssnValue: "9999990001",
    identityOptions: { randomizeSsn: false },
    optionalOverrides: {
      DOB: "2026/03/26",
      PaymentAuthorityCode: "100000",
    },
    fileCount: 0,
    referralsPerFile: 0,
    upload: {
      enabled: true,
      targets: [{ server_name: "DEV", user_name: "", remote_directory: "" }],
    },
  });

  assert.equal(preview.fieldErrors.ssnValue, "SSN must start with 999 and use the format 999-99-0001.");
  assert.equal(preview.fieldErrors.icnValue, "Enter up to 13 letters or numbers after TEST.");
  assert.equal(preview.fieldErrors.PaymentAuthorityCode, "Payment Authority Code must be a whole number between 0 and 99999.");
  assert.equal(preview.fieldErrors.DOB, "DOB must use the format YYYY-MM-DD.");
  assert.equal(preview.fieldErrors.fileCount, "Number of JSON files to generate must be greater than zero.");
  assert.equal(preview.fieldErrors.referralsPerFile, "Number of referrals per file must be greater than zero.");
  assert.equal(preview.fieldErrors["upload:DEV:user_name"], "Please choose a user for DEV.");
  assert.equal(
    preview.fieldErrors["upload:DEV:remote_directory"],
    "Please enter the remote upload location for DEV."
  );
});

test("Live preview resolves Referral Number, formatted ICN, and archive tokens together", async () => {
  const preview = await backend.handleCommand("preview", {
    referralReplacementCode: "26S600001",
    identityOptions: { referralPrefixMode: "custom", customReferralPrefix: "CCRS" },
    icnSettings: { mode: ICN_MODES.REFERRAL_MATCH },
    archiveNamingOptions: {
      mode: "custom",
      customText: "DEV",
      customValues: ["referralNumber", "referralPrefix", "customText"],
    },
    optionalOverrides: {},
    fileCount: 1,
    referralsPerFile: 1,
  });

  assert.equal(preview.referralNumber, "CCRS26S600001");
  assert.equal(preview.icnPreview, "Preview: TEST000026S600001");
  assert.equal(preview.outputFileNames.json, "CCRS26S600001_CCRS_DEV_Final.json");
  assert.equal(preview.outputFileNames.gzip, "CCRS26S600001_CCRS_DEV_Final.gz");
});

test("Preview validation requires archive naming fields when append options are enabled", async () => {
  const preview = await backend.handleCommand("preview", {
    archiveBasename: "customname",
    archiveNamingOptions: {
      includeNetwork: true,
      includeReferralDateTime: true,
    },
    optionalOverrides: {
      Network: "",
      ReferralDateTime: "",
    },
  });

  assert.equal(
    preview.fieldErrors.archiveBasename,
    "Choose a Network before adding it to the archive name."
  );
});

test("Release export uses the display label for shareable file names", () => {
  assert.equal(
    getDisplayVersion({ label: "Production V1.1 <>:/\\|?*" }, { version: "1.1.0" }),
    "Production V1.1"
  );
  assert.equal(getDisplayVersion({ label: "" }, { version: "1.1.0" }), "1.1.0");
});

test("Windows packaging targets only the setup installer", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const targetNames = packageJson.build.win.target.map((target) => target.target);

  assert.deepEqual(targetNames, ["nsis"]);
  assert.equal(Object.hasOwn(packageJson.scripts, "dist:portable"), false);
});

test("Release builds use temporary storage outside the project", () => {
  const paths = resolveReleasePaths({ repoRoot: projectRoot });

  assert.doesNotThrow(() => assertSafeTemporaryWorkRoot(paths.workRoot, projectRoot));
  assert.throws(
    () => assertSafeTemporaryWorkRoot(projectRoot, projectRoot),
    /unsafe release work directory/
  );
  assert.throws(
    () => assertPathInsideWorkRoot(projectRoot, paths.workRoot),
    /must stay inside the temporary work directory/
  );
});

test("Release export copies only the verified setup executable into release", () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-release-export-"));

  try {
    fs.mkdirSync(path.join(repoRoot, "config"), { recursive: true });
    const distRoot = path.join(repoRoot, "temporary-dist");
    const releaseRoot = path.join(repoRoot, "temporary-publish");
    fs.mkdirSync(distRoot, { recursive: true });
    fs.mkdirSync(releaseRoot, { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ version: "1.1.0" }, null, 2)
    );
    fs.writeFileSync(
      path.join(repoRoot, "config", "app_version.json"),
      JSON.stringify({ version: "1.1.0", label: "Production V1.1" }, null, 2)
    );

    const setupSource = path.join(
      repoRoot,
      "temporary-dist",
      "CCRS File Processing Framework Setup 1.1.0.exe"
    );

    writeWindowsExecutableFixture(setupSource);
    const stalePortableOutput = path.join(
      repoRoot,
      "temporary-publish",
      "CCRS File Processing Framework Production V1.0.exe"
    );
    writeWindowsExecutableFixture(stalePortableOutput);

    const result = exportReleaseArtifacts({ repoRoot, distRoot, releaseRoot });

    const setupOutput = path.join(
      repoRoot,
      "temporary-publish",
      "CCRS File Processing Framework Setup Production V1.1.exe"
    );

    assert.equal(result.exportedPaths.length, 1);
    assert.equal(fs.existsSync(stalePortableOutput), false);
    assert.equal(fs.existsSync(setupOutput), true);
    assert.equal(isRealWindowsExecutable(setupOutput), true);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("Release export rejects incomplete executables", () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-release-invalid-"));

  try {
    fs.mkdirSync(path.join(repoRoot, "config"), { recursive: true });
    const distRoot = path.join(repoRoot, "temporary-dist");
    const releaseRoot = path.join(repoRoot, "temporary-publish");
    fs.mkdirSync(distRoot, { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ version: "1.1.0" }, null, 2)
    );
    fs.writeFileSync(
      path.join(repoRoot, "config", "app_version.json"),
      JSON.stringify({ version: "1.1.0", label: "Production V1.1" }, null, 2)
    );

    const setupSource = path.join(distRoot, "CCRS File Processing Framework Setup 1.1.0.exe");
    fs.writeFileSync(setupSource, "version https://git-lfs.github.com/spec/v1\n");

    assert.throws(
      () => exportReleaseArtifacts({ repoRoot, distRoot, releaseRoot }),
      /Git LFS pointer|verified Windows executable/
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

(async () => {
  try {
    for (const { name, callback } of tests) {
      try {
        await callback();
        console.log(`PASS ${name}`);
      } catch (error) {
        failures += 1;
        console.error(`FAIL ${name}`);
        console.error(`  ${error.message}`);
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  if (failures > 0) {
    process.exitCode = 1;
  } else {
    console.log("Smoke tests passed.");
  }
})();
