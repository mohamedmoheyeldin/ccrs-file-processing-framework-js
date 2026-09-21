const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-regression-"));
process.env.CCRS_USER_DATA_ROOT = path.join(root, "settings");
const backend = require("../electron/backend");
const { codes } = require("../electron/backend/paymentAuthorityCatalog");
const { uploadTargetsSequentially } = require("../electron/backend/uploader");
const { promoteStagedFiles } = require("../electron/backend/batchSafety");

async function run() {
  assert.equal(codes.length, 43);
  assert.equal(new Set(codes).size, codes.length);
  const info = await backend.handleCommand("info", {});
  const { getCurrentReferralDates } = require("../electron/backend/referralGenerator");
  assert.equal(getCurrentReferralDates({ ReferralPeriod: "10 days" }, new Date(2024, 1, 25, 12)).ReferralExpirationDate, "2024-03-06");
  const currentDates = getCurrentReferralDates();
  const regular = info.seocOptions.slice(0, 3);
  const situational = info.situationalSeocOptions.slice(0, 2);
  const payload = {
    outputDir: path.join(root, "output"), fileCount: 3, referralsPerFile: 400,
    referralReplacementCode: "1234500000", archiveNamingOptions: { mode: "referral-number" },
    keepProcessedJson: true, keepMasterJson: true,
    identityOptions: { randomizeSsn: true, randomizeDob: true, selectedStationIds: ["508GS", "508QG", "402"],
      selectedPaymentCodes: ["21"], selectedNetworks: ["CCN1", "CCN4"],
      selectedSeocKeys: regular.map((item) => item.selectorKey),
      selectedSituationalSeocKeys: situational.map((item) => item.selectorKey) },
  };
  const initialRun = await backend.handleCommand("generate", payload);
  const names = fs.readdirSync(payload.outputDir);
  const masterName = names.find((name) => name.endsWith("_Master.json"));
  const master = JSON.parse(fs.readFileSync(path.join(payload.outputDir, masterName)));
  const archiveName = names.find((name) => name.endsWith(".gz"));
  const archive = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(payload.outputDir, archiveName))));
  assert.deepEqual(master, archive);
  assert.equal(fs.readFileSync(path.join(payload.outputDir, masterName), "utf8"), JSON.stringify(master, null, 4) + "\n");
  assert.equal(names.some((name) => name.endsWith(".manifest.json")), false);
  const exported = await backend.handleCommand("generate-manifest", { runId: initialRun.run.runId });
  const manifest = JSON.parse(fs.readFileSync(exported.manifestPath));
  assert.deepEqual(manifest.selections.paymentAuthorityCodes, { mode: "selected", values: ["21"] });
  const individual = names.filter((name) => name.endsWith(".json") && name !== masterName && !name.endsWith(".manifest.json"));
  assert.equal(individual.length, 3);
  assert.deepEqual(master.Referrals, individual.sort().flatMap((name) => JSON.parse(fs.readFileSync(path.join(payload.outputDir, name))).Referrals));
  assert.equal(master.Referrals.length, 1200);
  assert.equal(new Set(master.Referrals.map((item) => item.ReferralNumber)).size, 1200);
  for (const referral of master.Referrals) {
    assert.equal(referral.ReferralDate, currentDates.ReferralDate);
    for (const key of ["AllocatedDate", "TreatmentStartDate", "ClinicallyIndicatedDate", "AppointmentDate"]) assert.equal(referral[key], currentDates.ReferralDate);
    assert.ok(referral.ReferralLastUpdateDateTime.startsWith(currentDates.ReferralLastUpdateDate));
    assert.equal(referral.ReferralExpirationDate, currentDates.ReferralExpirationDate);
    const authority = referral.ProgramAuthority || referral;
    assert.ok(payload.identityOptions.selectedStationIds.includes(authority.StationID));
    assert.equal(String(authority.PaymentAuthorityCode), "21");
    assert.ok(payload.identityOptions.selectedNetworks.includes(referral.Network));
    assert.ok(regular.some((item) => item.seocKey === String(authority.SeocKey) && item.seocId === authority.SeocID));
    assert.ok(situational.some((item) => item.seocKey === String(authority.SituationalSeocKey) && item.seocId === authority.SituationalSeocID));
  }
  fs.writeFileSync(path.join(payload.outputDir, "unrelated.txt"), "preserve me");
  await backend.handleCommand("generate", payload);
  assert.equal(fs.readFileSync(path.join(payload.outputDir, "unrelated.txt"), "utf8"), "preserve me");
  await assert.rejects(() => backend.handleCommand("generate-manifest", { runId: initialRun.run.runId }), /changed or been removed/);
  for (const [individualJson, masterJson] of [[false, false], [false, true], [true, false]]) {
    const outputDir = path.join(root, `retention-${individualJson}-${masterJson}`);
    await backend.handleCommand("generate", { ...payload, outputDir, fileCount: 2, referralsPerFile: 2, keepProcessedJson: individualJson, keepMasterJson: masterJson });
    const files = fs.readdirSync(outputDir);
    assert.equal(files.filter((name) => name.endsWith("_Master.json")).length, masterJson ? 1 : 0);
    assert.equal(files.filter((name) => name.endsWith(".json") && !name.endsWith("_Master.json") && !name.endsWith(".manifest.json")).length, individualJson ? 2 : 0);
    assert.equal(files.filter((name) => name.endsWith(".gz")).length, 1);
    assert.equal(files.some((name) => name.endsWith(".manifest.json")), false);
  }
  const customDir = path.join(root, "custom-dates");
  await backend.handleCommand("generate", { ...payload, outputDir: customDir, fileCount: 1, referralsPerFile: 1,
    optionalOverrides: { ReferralDate: "2024-02-25", ReferralPeriod: "10 days", ReferralDateTime: "2024-02-25 10:30:00", ReferralLastUpdateDate: "2024-02-25" } });
  const custom = JSON.parse(fs.readFileSync(path.join(customDir, fs.readdirSync(customDir).find((name) => name.endsWith("_Master.json"))))).Referrals[0];
  assert.equal(custom.ReferralDate, "2024-02-25");
  assert.equal(custom.ReferralDateTime, "2024-02-25 10:30:00");
  assert.equal(custom.ReferralExpirationDate, "2024-03-06");
  const orderDir = path.join(root, "ordering"); fs.mkdirSync(orderDir);
  for (let i = 12; i >= 1; i--) fs.writeFileSync(path.join(orderDir, `batch_${i}.json`), JSON.stringify({ Referrals: [{ index: i }] }));
  await require("../electron/backend/zipper").zipOutput(orderDir, "ordered", "master.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(orderDir, "master.json"))).Referrals.map((item) => item.index), Array.from({ length: 12 }, (_, i) => i + 1));
  const targets = ["SQA", "DEV", "PPD", "SQA"].map((name) => ({ server_name: name, remote_directory: "/upload", connection_details: { host: name } }));
  const calls = [];
  const results = await uploadTargetsSequentially("test.gz", targets, { upload: async (_file, _directory, connection) => {
    calls.push(connection.host); if (connection.host === "DEV") throw new Error("connection failed"); return "/upload/test.gz";
  } });
  assert.deepEqual(calls, ["SQA", "DEV", "PPD"]);
  assert.deepEqual(results.map((item) => item.status), ["completed", "failed", "completed"]);
  const stage = path.join(root, "stage"); const dest = path.join(root, "dest");
  fs.mkdirSync(stage); fs.mkdirSync(dest);
  fs.writeFileSync(path.join(stage, "one.json"), "new"); fs.writeFileSync(path.join(stage, "two.json"), "new2");
  fs.writeFileSync(path.join(dest, "one.json"), "original");
  const originalCopy = fs.copyFileSync;
  fs.copyFileSync = (source, destination, ...args) => {
    if (source === path.join(stage, "two.json")) throw new Error("simulated disk failure");
    return originalCopy(source, destination, ...args);
  };
  try { assert.throws(() => promoteStagedFiles(stage, dest, ["one.json", "two.json"]), /disk failure/); }
  finally { fs.copyFileSync = originalCopy; }
  assert.equal(fs.readFileSync(path.join(dest, "one.json"), "utf8"), "original");
  assert.equal(fs.existsSync(path.join(dest, "two.json")), false);
  console.log("PASS 1,200 referrals, catalog subsets, master/gzip equality, repeated output, retention modes, deduplicated sequential upload recovery, and rollback");
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
