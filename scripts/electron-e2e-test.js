const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-e2e-output-"));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-e2e-user-"));
  const electronApp = await electron.launch({
    executablePath: require("electron"),
    args: [projectRoot],
    env: { ...process.env, CCRS_USER_DATA_ROOT: userDataRoot },
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.locator("#status-message").waitFor({ state: "visible" });
    const releaseButton = window.locator("#release-announcement-accept");
    if (await releaseButton.isVisible()) await releaseButton.click();
    assert.match(await window.title(), /CCRS File Processing Framework/);
    assert.equal(await window.locator("#workflow-stepper").isVisible(), true);
    assert.equal(await window.locator("#run-process").isVisible(), true);
    assert.equal(await window.locator("#cancel-job").isHidden(), true);
    assert.equal(await window.locator("meta[http-equiv='Content-Security-Policy']").count(), 1);
    const uploadDirectoryNote = window.locator(".upload-path-help").first();
    await uploadDirectoryNote.waitFor({ state: "visible" });
    assert.match(await uploadDirectoryNote.textContent(), /CCRS Referral uploads default to \/CCRA_Uploads/);
    await window.locator("[data-main-tab='leie']").click();
    assert.match(await uploadDirectoryNote.textContent(), /LEIE Data uploads default to \/in\/manual_process\//);
    await window.locator("[data-main-tab='referral']").click();
    if (process.env.CCRS_E2E_SCREENSHOT) {
      await window.screenshot({ path: process.env.CCRS_E2E_SCREENSHOT, fullPage: true });
    }
    await window.setViewportSize({ width: 800, height: 700 });
    const hasHorizontalOverflow = await window.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(hasHorizontalOverflow, false);
    const result = await window.evaluate(async (targetOutputDir) => window.ccrs.runJob("generate", {
      outputDir: targetOutputDir,
      replacementCode: "e2e_referral",
      archiveBasename: "e2e_archive",
      clearOutput: true,
      keepProcessedJson: false,
      fileCount: 1,
      referralsPerFile: 2,
      referralReplacementCode: "",
      icnSettings: { mode: "test-dynamic" },
      identityOptions: { randomizeSsn: true, randomizeDob: true, matchSuffixLength: 5 },
      optionalOverrides: {},
      upload: { enabled: false, targets: [] },
    }), outputDir);
    assert.match(result.message, /Done\. Processed 1 file/);
    assert.equal(fs.existsSync(path.join(outputDir, "e2e_archive.gz")), true);
  } finally {
    await electronApp.close();
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
}

run().then(
  () => console.log("Electron end-to-end smoke test passed."),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
