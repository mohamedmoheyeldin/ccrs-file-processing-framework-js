const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

async function assertControlSystem(window) {
  const audit = await window.evaluate(() => {
    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }

    const expectedHeight = Number.parseFloat(
      window.getComputedStyle(document.documentElement).getPropertyValue("--control-height")
    );
    const standardControls = [...document.querySelectorAll(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), .combo-shell'
    )].filter((element) =>
      isVisible(element) &&
      !element.classList.contains("clipboard-copy-field") &&
      !(element.matches("input") && element.closest(".combo-shell"))
    );
    const nonStandardControls = standardControls
      .map((element) => ({
        id: element.id || element.className || element.tagName,
        height: Number(element.getBoundingClientRect().height.toFixed(1)),
      }))
      .filter((item) => Math.abs(item.height - expectedHeight) > 0.5);

    const undersizedTargets = [...document.querySelectorAll("button, label.radio-chip, label.checkbox-chip")]
      .filter(isVisible)
      .map((element) => ({
        id: element.id || element.className || element.textContent.trim().slice(0, 40),
        height: Number(element.getBoundingClientRect().height.toFixed(1)),
      }))
      .filter((item) => item.height < 44);

    const unnamedControls = [...document.querySelectorAll("input, select, textarea, button")]
      .filter((element) => isVisible(element) && !element.disabled)
      .filter((element) => {
        const hasLabel = Boolean(element.labels?.length);
        const hasName = Boolean(
          element.getAttribute("aria-label") ||
          element.getAttribute("aria-labelledby") ||
          element.textContent.trim() ||
          element.title
        );
        return !hasLabel && !hasName;
      })
      .map((element) => element.id || element.className || element.tagName);

    const uploadPairs = [...document.querySelectorAll(".upload-target-grid")]
      .filter(isVisible)
      .map((grid) => {
        const userControl = grid.querySelector(".compact-select");
        const pathControl = grid.querySelector(".upload-path");
        return {
          userWidth: Number(userControl?.getBoundingClientRect().width.toFixed(1) || 0),
          pathWidth: Number(pathControl?.getBoundingClientRect().width.toFixed(1) || 0),
          userTop: Number(userControl?.getBoundingClientRect().top.toFixed(1) || 0),
          pathTop: Number(pathControl?.getBoundingClientRect().top.toFixed(1) || 0),
        };
      });

    return { expectedHeight, nonStandardControls, undersizedTargets, unnamedControls, uploadPairs };
  });

  assert.equal(audit.expectedHeight, 48);
  assert.deepEqual(audit.nonStandardControls, []);
  assert.deepEqual(audit.undersizedTargets, []);
  assert.deepEqual(audit.unnamedControls, []);
  for (const pair of audit.uploadPairs) {
    assert.equal(pair.userWidth < pair.pathWidth, true);
    assert.equal(pair.pathWidth / pair.userWidth >= 1.45 && pair.pathWidth / pair.userWidth <= 1.55, true);
    assert.equal(Math.abs(pair.userTop - pair.pathTop) <= 0.5, true);
  }
}

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
    const nativeSelectCount = await window.locator("select").count();
    assert.equal(await window.locator(".compact-select").count(), nativeSelectCount);
    await window.locator("[data-sub-tab='generate']").click();
    await window.locator("#toggle-optional-fields").click();
    const matchTrigger = window.locator("#match-suffix-length").locator("..").locator(".compact-select-trigger");
    await matchTrigger.focus();
    await matchTrigger.press("ArrowDown");
    const matchMenu = window.locator("#match-suffix-length").locator("..").locator(".compact-select-menu");
    assert.equal(await matchMenu.isVisible(), true);
    assert.equal(await matchMenu.locator(".compact-select-option").count(), 3);
    assert.equal((await matchMenu.evaluate((element) => element.getBoundingClientRect().height)) <= 260, true);
    const fourCharacterOption = matchMenu.locator('.compact-select-option[data-value="4"]');
    await fourCharacterOption.focus();
    await fourCharacterOption.press("Enter");
    assert.equal(await window.locator("#match-suffix-length").inputValue(), "4");
    await window.locator("#override-station-id").fill("614GA01");
    await window.locator("#station-id-toggle").click();
    assert.equal(await window.locator("#station-id-menu .station-option-field", { hasText: "station_id: 614GA01" }).count(), 1);
    assert.equal(await window.locator("#station-id-menu .station-option-field", { hasText: "station_key: 2242" }).count(), 1);
    await window.locator("#station-id-menu .combo-option", { hasText: "Tremont VA Clinic" }).click();
    assert.equal(await window.locator("#override-station-id").inputValue(), "614GA01");
    assert.equal(
      await window.locator('#override-seoc-key option[value="67"]').textContent(),
      "67 — INF_FERTILITY-1332 EXISTING OVARY_1.1.17 — Special: explicit selection only"
    );
    assert.equal(await window.locator('#override-seoc-key option[value="1160"]').count(), 1);
    const uploadDirectoryNote = window.locator(".upload-path-help").first();
    await uploadDirectoryNote.waitFor({ state: "visible" });
    assert.match(await uploadDirectoryNote.textContent(), /CCRS Referral uploads default to \/CCRA_Uploads/);
    await assertControlSystem(window);
    await window.locator("[data-main-tab='leie']").click();
    assert.match(await uploadDirectoryNote.textContent(), /LEIE Data uploads default to \/in\/manual_process\//);
    await assertControlSystem(window);
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
      keepProcessedJson: true,
      fileCount: 2,
      referralsPerFile: 2,
      referralReplacementCode: "",
      icnSettings: { mode: "test-dynamic" },
      identityOptions: { randomizeSsn: true, randomizeDob: true, randomizeStationId: true, matchSuffixLength: 5 },
      optionalOverrides: {},
      upload: { enabled: false, targets: [] },
    }), outputDir);
    assert.match(result.message, /Done\. Processed 2 files/);
    assert.equal(fs.existsSync(path.join(outputDir, "e2e_archive.gz")), true);
    const outputJsonPaths = fs.readdirSync(outputDir)
      .map((name) => path.join(outputDir, name))
      .filter((filePath) => filePath.toLowerCase().endsWith(".json"));
    assert.equal(outputJsonPaths.length, 2);
    const generatedReferrals = outputJsonPaths.flatMap(
      (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")).Referrals
    );
    const appInfo = await window.evaluate(() => window.ccrs.getInfo());
    const validStationIds = new Set(appInfo.stations.map((station) => station.station_id).filter(Boolean));
    const specialSeocKeys = new Set(["67", "158", "191", "233", "268", "1160"]);
    assert.equal(new Set(generatedReferrals.map((referral) => referral.Patient.SSN)).size, 4);
    const stationIds = generatedReferrals.map(
      (referral) => referral.ProgramAuthority?.StationID || referral.StationID
    );
    assert.equal(new Set(stationIds).size, 4);
    for (const referral of generatedReferrals) {
      const stationId = referral.ProgramAuthority?.StationID || referral.StationID;
      const seocKey = referral.ProgramAuthority?.SeocKey || referral.SeocKey;
      assert.match(referral.Patient.SSN, /^999-\d{2}-\d{4}$/);
      assert.equal(validStationIds.has(stationId), true);
      assert.equal(specialSeocKeys.has(String(seocKey)), false);
    }
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
