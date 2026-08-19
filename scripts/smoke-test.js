const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");

const {
  ICN_MODES,
  generateOptionalFieldOverrides,
  generatePaymentAuthorityCodeValue,
  generateReferralNumber,
  modifyContent,
  prepareIcnSettings,
  validatePaymentAuthorityCode,
} = require("../electron/backend/contentEditor");
const backend = require("../electron/backend");
const {
  cleanupRuntimeArtifacts,
  cleanupKnownTemporaryArtifacts,
  registerTemporaryPath,
} = require("../electron/backend/runtimeCleanup");
const { summarizeUploadProfiles, uploadFileWithSftp } = require("../electron/backend/uploader");
const { buildArchiveBasename, formatArchiveReferralDateTime } = require("../electron/backend/zipper");
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

test("Final Version 1.2 metadata and release automation stay consolidated", () => {
  const versionConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "config", "app_version.json"), "utf8"));
  const packageConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const releaseWorkflow = fs.readFileSync(path.join(projectRoot, ".github", "workflows", "release.yml"), "utf8");
  const smokeWorkflow = fs.readFileSync(path.join(projectRoot, ".github", "workflows", "smoke-tests.yml"), "utf8");
  const buildReleaseScript = fs.readFileSync(path.join(projectRoot, "scripts", "build-release.js"), "utf8");

  assert.equal(versionConfig.version, "1.2.4");
  assert.equal(versionConfig.releaseTag, "v1.2");
  assert.equal(versionConfig.label, "Version 1.2");
  assert.equal(packageConfig.scripts["test:smoke"], "node scripts/smoke-test.js");
  assert.equal(fs.existsSync(path.join(projectRoot, ".github", "release.yml")), false);
  assert.match(releaseWorkflow, /\$config\.releaseTag/);
  assert.match(releaseWorkflow, /pnpm run test:smoke/);
  assert.match(releaseWorkflow, /must include at least one releaseNotes entry/);
  assert.doesNotMatch(releaseWorkflow, /--generate-notes/);
  assert.match(buildReleaseScript, /"--publish",\s*"never"/);
  assert.match(smokeWorkflow, /pull_request:/);
  assert.match(smokeWorkflow, /pnpm run test:smoke/);
});

test("LEIE upload targets use the manual-processing directory without replacing custom paths", () => {
  assert.equal(LEIE_DEFAULT_UPLOAD_DIRECTORY, "/in/manual_process/");
  assert.equal(resolveUploadDirectoryForWorkflow("", "leie"), "/in/manual_process/");
  assert.equal(resolveUploadDirectoryForWorkflow("/CCRA_Uploads", "leie"), "/in/manual_process/");
  assert.equal(resolveUploadDirectoryForWorkflow("/custom/leie/", "leie"), "/custom/leie/");
  assert.equal(resolveUploadDirectoryForWorkflow("/in/manual_process/", "referral"), "/CCRA_Uploads");
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
    StationID: "1501",
    PaymentAuthorityCode: "54321",
  });

  assert.equal(overrides.PaymentAuthorityCode, "54321");
  assert.equal(overrides.StationID, "1501");
  assert.throws(
    () => generateOptionalFieldOverrides({ StationID: "150" }),
    /must exactly match a station_key/
  );
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
      ProgramAuthority: { StationID: "1501", SeocKey: "69", SeocID: "OLD" },
    })),
  });

  const result = modifyContent(
    filePath,
    "400",
    null,
    "999-99-0001",
    1,
    1,
    { StationID: "1501", SeocKey: "107", SeocID: "PMR_PHYSICAL THERAPY_1.0.12_PRCT" },
    1,
    prepareIcnSettings(),
    1,
    { randomizeSsn: true, randomizeDob: true, matchSuffixLength: 5 }
  );
  const referrals = JSON.parse(result.content).Referrals;

  assert.deepEqual(referrals.map((item) => item.ProgramAuthority.StationID), ["1501", "1501"]);
  assert.deepEqual(referrals.map((item) => item.ProgramAuthority.SeocKey), ["107", "107"]);
  assert.deepEqual(referrals.map((item) => item.ProgramAuthority.SeocID), [
    "PMR_PHYSICAL THERAPY_1.0.12_PRCT",
    "PMR_PHYSICAL THERAPY_1.0.12_PRCT",
  ]);
  for (const referral of referrals) {
    assert.match(referral.Patient.SSN, /^9\d{2}-\d{2}-\d{4}$/);
    assert.match(referral.Patient.DOB, /^(19|20)\d{2}-\d{2}-\d{2}$/);
    assert.equal(referral.Patient.ICN.slice(-5), referral.ReferralNumber.slice(-5));
  }
  assert.notEqual(referrals[0].Patient.SSN, referrals[1].Patient.SSN);
});

test("modifyContent uses only reference Station IDs in random mode", () => {
  const filePath = writeJsonFixture("random-stations.json", {
    Referrals: [
      { ReferralNumber: "VA0000000001", StationID: "BAD", ICN: "1", FirstName: "A", LastName: "B", SSN: "999-99-0001" },
      { ReferralNumber: "VA0000000002", StationID: "BAD", ICN: "2", FirstName: "C", LastName: "D", SSN: "999-99-0001" },
    ],
  });
  const result = modifyContent(filePath, "", null, "999-99-0001", 1, 1, {}, 1, prepareIcnSettings(), 1, {
    randomizeStationId: true,
  });
  const validKeys = new Set(require("../electron/backend/stationCatalog").loadStationOptions().map((option) => option.stationKey));
  for (const referral of JSON.parse(result.content).Referrals) {
    assert.equal(validKeys.has(referral.StationID), true);
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
  assert.equal(generateReferralNumber("ABC123", 2), "VA0000ABC124");
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
    prepareIcnSettings({ mode: ICN_MODES.TEST_CUSTOM_SUFFIX, value: "AB12" }),
    1
  );
  const parsed = JSON.parse(result.content);

  assert.match(parsed.Referrals[0].ICN, /^TESTAB12[A-Z0-9]{9}$/);
  assert.match(parsed.Referrals[1].ICN, /^TESTAB12[A-Z0-9]{9}$/);
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
    prepareIcnSettings({ mode: ICN_MODES.CUSTOM_FULL, value: "AB12" }),
    1
  );
  const parsed = JSON.parse(result.content);

  assert.match(parsed.Referrals[0].ICN, /^AB12[A-Z0-9]{13}$/);
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

test("App info exposes unique Station ID dropdown options", async () => {
  const info = await backend.handleCommand("info", {});

  assert.equal(Array.isArray(info.stationOptions), true);
  assert.equal(info.stationOptions.length >= 1500, true);

  const stationKeys = info.stationOptions.map((option) => option.stationKey);
  assert.equal(new Set(stationKeys).size, stationKeys.length);

  const sample = info.stationOptions.find((option) => option.stationKey === "1501");
  assert.equal(Boolean(sample), true);
  assert.match(sample.stationName, /Togus VA Medical Center/);
});

test("App info exposes valid synchronized SEOC pairs", async () => {
  const info = await backend.handleCommand("info", {});
  assert.equal(Array.isArray(info.seocOptions), true);
  assert.deepEqual(info.seocOptions, [
    { seocKey: "69", seocId: "RAD_INTERVENTIONAL RADIOLOGY_1.0.12_REV_PRCT" },
    { seocKey: "107", seocId: "PMR_PHYSICAL THERAPY_1.0.12_PRCT" },
  ]);
});

test("Archive basename can append Network and Referral DateTime safely", () => {
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
  });

  assert.equal(archiveBasename, "My_Custom_Export_CCN1_20260401_134500");
  assert.equal(formatArchiveReferralDateTime("2026-04-01 13:45:00"), "20260401_134500");
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

    saveUiSettings({
      ...DEFAULT_UI_SETTINGS,
      theme: "dark",
      archiveBasename: "session_export",
      archiveAppendNetwork: true,
      acknowledgedReleaseKey: "1.2.0|Production V1.2",
    });

    const loaded = loadUiSettings();
    assert.equal(loaded.theme, "dark");
    assert.equal(loaded.archiveBasename, "session_export");
    assert.equal(loaded.archiveAppendNetwork, true);
    assert.equal(loaded.acknowledgedReleaseKey, "1.2.0|Production V1.2");
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
    assert.equal(initialInfo.appVersion.version, "1.2.4");
    assert.equal(initialInfo.appVersion.label, "Version 1.2");
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
  const olderReleaseKey = "1.2.3|Production V1.2.3";

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

  assert.equal(preview.fieldErrors.ssnValue, "SSN must use the format 999-99-0001.");
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
    "Choose a Network in Referral Details before appending it to the .gz name."
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

  assert.equal(path.relative(projectRoot, paths.workRoot).startsWith(".."), true);
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
