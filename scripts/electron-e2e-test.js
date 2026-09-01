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
  fs.mkdirSync(path.join(userDataRoot, "config"), { recursive: true });
  fs.writeFileSync(path.join(userDataRoot, "config", "ui_settings.json"), JSON.stringify({
    selectedSeocKeys: ["missing::value"],
    selectedSituationalSeocKeys: ["missing::value"],
  }));
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
    assert.equal(await window.locator("#status-badge").textContent(), "Ready");
    assert.equal(await window.locator("#job-progress-wrap").isHidden(), true);
    assert.equal(await window.locator("#pre-run-overlay").isHidden(), true);
    assert.equal(await window.locator(".context-help").count(), 5);
    assert.equal(await window.locator(".context-help[open]").count(), 0);
    assert.equal(await window.locator("#output-help").isVisible(), true);
    assert.equal(await window.locator("#leie-output-help").isHidden(), true);
    assert.equal(await window.locator("#workflow-help summary").textContent(), "New here? See how the five steps work");
    await window.locator("#workflow-help summary").click();
    assert.equal(await window.locator("#workflow-help").getAttribute("open"), "");
    assert.equal(await window.locator("#workflow-help .context-help-grid > div").count(), 5);
    assert.match(await window.locator("#workflow-help").textContent(), /Source files are never edited/);
    assert.equal(await window.locator("#input-dir").getAttribute("aria-describedby"), "source-folder-help");
    assert.match(await window.locator("#source-folder-help").textContent(), /never changes the originals/);
    assert.equal(await window.locator(".helper-text.live-preview").count(), 5);
    if (process.env.CCRS_E2E_HELP_SCREENSHOT) {
      await window.locator("#workflow-help").scrollIntoViewIfNeeded();
      await window.screenshot({ path: process.env.CCRS_E2E_HELP_SCREENSHOT, fullPage: false });
    }
    assert.equal(await window.locator("#generation-preset").count(), 0);
    assert.equal(await window.locator("#generation-preset-name").count(), 0);
    assert.equal(await window.locator("#recent-runs").count(), 0);
    assert.equal(await window.locator('input[name="referral-prefix-mode"]').count(), 4);
    assert.equal(await window.locator('input[name="icn-mode"]').count(), 4);
    assert.equal(await window.locator('input[name="archive-naming-mode"]').count(), 4);
    assert.equal(await window.locator('input[name="archive-naming-mode"][value="prefix"]').count(), 0);
    assert.equal(await window.locator("#referral-prefix-va").isChecked(), true);
    assert.equal(await window.locator("#custom-referral-prefix-row").isHidden(), true);
    assert.equal(await window.locator("#selected-seocs .selected-station-chip").count(), 0);
    assert.equal(await window.locator("#selected-situational-seocs .selected-station-chip").count(), 0);
    assert.equal(await window.locator("meta[http-equiv='Content-Security-Policy']").count(), 1);
    const nativeSelectCount = await window.locator("select").count();
    assert.equal(await window.locator(".compact-select").count(), nativeSelectCount);
    await window.locator("[data-sub-tab='generate']").click();
    await window.locator("#referral-prefix-mixed").check();
    assert.match(await window.locator("#referral-prefix-help").textContent(), /VAiFAMS will be added automatically/);
    await window.locator("#referral-code").fill("DD");
    await window.waitForFunction(() => document.querySelector("#referral-preview")?.textContent.includes("VAiFAMSDD"));
    assert.match(await window.locator("#referral-preview").textContent(), /Preview: VAiFAMSDD/);
    await window.locator("#referral-prefix-custom").check();
    assert.equal(await window.locator("#custom-referral-prefix-row").isVisible(), true);
    assert.equal(await window.locator("#custom-referral-prefix").getAttribute("maxlength"), null);
    await window.locator("#custom-referral-prefix").fill("CUSTOM_PREFIX_WITHOUT_A_LIMIT_");
    await window.locator("#referral-code").fill("12345678901234567890");
    await window.waitForFunction(() => document.querySelector("#referral-preview")?.textContent.includes("CUSTOM_PREFIX_WITHOUT_A_LIMIT_12345678901234567890"));
    assert.match(await window.locator("#referral-preview").textContent(), /CUSTOM_PREFIX_WITHOUT_A_LIMIT_12345678901234567890/);
    await window.locator("#custom-referral-prefix").fill("CCRS");
    await window.locator("#referral-code").fill("26S600001");
    await window.locator("#referral-preview").waitFor({ state: "visible" });
    await window.waitForFunction(() => document.querySelector("#referral-preview")?.textContent.includes("CCRS26S600001"));
    assert.match(await window.locator("#referral-preview").textContent(), /CCRS26S600001/);
    await window.locator("#referral-prefix-mixed").check();
    assert.equal(await window.locator("#keep-existing-files").isChecked(), true);
    assert.match(await window.locator("#output-retention-card").textContent(), /Recommended/);
    assert.match(await window.locator("#output-retention-card").textContent(), /Replace folder contents after success/);
    await window.locator("#toggle-optional-fields").click();
    await window.locator("#referral-prefix-custom").check();
    await window.locator("#icn-mode-referral-match").check();
    const optionCardSystem = await window.evaluate(() => {
      const metrics = (selector) => {
        const target = document.querySelector(selector);
        const card = target.matches(".choice-card") ? target : target.closest(".choice-card");
        const style = getComputedStyle(card);
        return {
          minHeight: style.minHeight,
          padding: style.padding,
          borderRadius: style.borderRadius,
          columns: getComputedStyle(card.closest(".choice-card-grid")).gridTemplateColumns.split(" ").length,
        };
      };
      return {
        referral: metrics(".referral-prefix-choices .choice-card"),
        icn: metrics('input[name="icn-mode"]:checked'),
        archive: metrics(".archive-mode-choices .choice-card"),
      };
    });
    assert.deepEqual(optionCardSystem.referral, optionCardSystem.archive);
    assert.deepEqual(optionCardSystem.referral, optionCardSystem.icn);
    assert.equal(optionCardSystem.referral.minHeight, "66px");
    assert.equal(optionCardSystem.referral.columns, 2);
    assert.equal(optionCardSystem.archive.columns, 2);
    assert.equal(optionCardSystem.icn.columns, 2);
    if (process.env.CCRS_E2E_OPTION_CARD_SCREENSHOT) {
      await window.locator(".referral-prefix-choices").scrollIntoViewIfNeeded();
      await window.screenshot({ path: process.env.CCRS_E2E_OPTION_CARD_SCREENSHOT, fullPage: false });
    }
    await window.waitForFunction(() => document.querySelector("#icn-preview")?.textContent.includes("TEST000026S600001"));
    assert.equal(await window.locator("#icn-custom-value").isDisabled(), true);
    assert.match(await window.locator("#referral-preview").textContent(), /CCRS26S600001/);
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
    assert.equal(await window.locator("#station-id-menu .combo-option").count(), 0);
    await window.locator("#override-station-id").focus();
    await window.locator("#station-id-menu .combo-option").first().waitFor({ state: "visible" });
    assert.equal(await window.locator("#station-id-menu .combo-option").count(), 60);
    assert.match(await window.locator("#station-id-menu .combo-result-summary").textContent(), /complete catalog/);
    await window.locator("#override-station-id").fill("614GA01");
    await window.locator("#station-id-toggle").click();
    assert.equal(await window.locator("#station-id-menu .station-option-field", { hasText: "station_id: 614GA01" }).count(), 1);
    assert.equal(await window.locator("#station-id-menu .station-option-field", { hasText: "station_key: 2242" }).count(), 1);
    await window.locator("#station-id-menu .combo-option", { hasText: "Tremont VA Clinic" }).click();
    assert.equal(await window.locator("#override-station-id").inputValue(), "");
    assert.equal(await window.locator("#selected-stations .selected-station-chip", { hasText: "614GA01" }).count(), 1);
    assert.equal((await window.locator("body").textContent()).includes("(Optional)"), false);
    const situationalColor = await window.locator(".situational-label").evaluate((element) => getComputedStyle(element).color);
    const normalLabelColor = await window.locator(".situational-label").locator("..").evaluate((element) => getComputedStyle(element).color);
    assert.notEqual(situationalColor, normalLabelColor);
    const seocBounds = await window.locator("#seoc-combobox").boundingBox();
    const situationalSeocBounds = await window.locator("#situational-seoc-combobox").boundingBox();
    assert.equal(Boolean(seocBounds && situationalSeocBounds), true);
    assert.equal(Math.abs(seocBounds.y - situationalSeocBounds.y) < 4, true);
    await window.locator("#override-station-id").press("Escape");
    await window.locator("#seoc-combobox").scrollIntoViewIfNeeded();
    await window.locator("#seoc-search").fill("AUD_AUDIOLOGY_1.0.1");
    const requestedPrimarySeoc = window.locator("#seoc-menu .combo-option").first();
    await requestedPrimarySeoc.waitFor({ state: "visible" });
    assert.equal((await requestedPrimarySeoc.locator(".combo-option-title").textContent()).trim(), "AUD_AUDIOLOGY_1.0.1");
    assert.equal((await requestedPrimarySeoc.locator(".combo-option-copy").textContent()).trim(), "SEOC Number: 11");
    if (process.env.CCRS_E2E_PRIMARY_SEOC_SCREENSHOT) {
      await window.screenshot({ path: process.env.CCRS_E2E_PRIMARY_SEOC_SCREENSHOT, fullPage: false });
    }
    await window.locator("#seoc-search").press("Escape");
    await window.locator("#seoc-search").fill("MSC_INFERTILITY-IUI FEMALE");
    assert.equal(await window.locator("#seoc-menu .combo-option").count(), 0);
    assert.equal(await window.locator("#seoc-menu .combo-empty").textContent(), "No matching SEOC values.");
    await window.locator("#seoc-search").fill("PMR_ACUPUNCTURE INITIAL");
    const primarySeoc = window.locator("#seoc-menu .combo-option", { hasText: "PMR_ACUPUNCTURE INITIAL" }).first();
    await primarySeoc.waitFor({ state: "visible" });
    assert.equal((await primarySeoc.locator(".combo-option-title").textContent()).trim(), "PMR_ACUPUNCTURE INITIAL_1.0.17");
    assert.equal((await primarySeoc.locator(".combo-option-copy").textContent()).trim(), "SEOC Number: 1");
    await primarySeoc.click();
    assert.equal(await window.locator("#selected-seocs .selected-station-chip", { hasText: "PMR_ACUPUNCTURE INITIAL_1.0.17" }).count(), 1);
    assert.equal(await window.locator("#seoc-override-warning").isVisible(), true);
    await window.locator("#selected-seocs .selected-station-chip", { hasText: "PMR_ACUPUNCTURE INITIAL" }).click();
    assert.equal(await window.locator("#selected-seocs .selected-station-chip").count(), 0);
    assert.equal(await window.locator("#seoc-override-warning").isHidden(), true);
    await window.locator("#seoc-search").fill("PMR_ACUPUNCTURE INITIAL");
    await window.locator("#seoc-menu .combo-option", { hasText: "PMR_ACUPUNCTURE INITIAL" }).first().click();
    await window.locator("#seoc-search").press("Escape");
    await window.locator("#situational-seoc-search").fill("AUD_AUDIOLOGY");
    assert.equal(await window.locator("#situational-seoc-menu .combo-option").count(), 0);
    await window.locator("#situational-seoc-search").fill("EUC_EMERGENCY CARE");
    const situationalSeoc = window.locator("#situational-seoc-menu .combo-option", { hasText: "EUC_EMERGENCY CARE" }).first();
    await situationalSeoc.waitFor({ state: "visible" });
    if (process.env.CCRS_E2E_SITUATIONAL_SEOC_SCREENSHOT) {
      await window.locator("#situational-seoc-combobox").scrollIntoViewIfNeeded();
      await window.screenshot({ path: process.env.CCRS_E2E_SITUATIONAL_SEOC_SCREENSHOT, fullPage: false });
    }
    assert.equal((await situationalSeoc.locator(".combo-option-title").textContent()).trim(), "EUC_EMERGENCY CARE_1.2.8");
    assert.equal((await situationalSeoc.locator(".combo-option-copy").textContent()).trim(), "SEOC Number: 158");
    await situationalSeoc.click();
    assert.equal(await window.locator("#selected-situational-seocs .selected-station-chip", { hasText: "EUC_EMERGENCY CARE_1.2.8" }).count(), 1);
    assert.match(await window.locator("#seoc-override-warning").textContent(), /Most referrals use regular SEOC only/);
    await window.locator("#use-all-situational-seocs").check();
    assert.equal(await window.locator("#situational-seoc-search").isDisabled(), true);
    assert.match(await window.locator("#situational-seoc-match").textContent(), /All 9 available Situational SEOC values/);
    await window.locator("#use-all-situational-seocs").uncheck();
    await window.locator('input[name="archive-naming-mode"][value="custom"]').check();
    assert.equal(await window.locator("#archive-custom-fields").isVisible(), true);
    assert.equal(await window.locator(".archive-custom-value").count(), 6);
    assert.equal(await window.locator(".archive-value-choice.choice-card.choice-card--compact").count(), 6);
    assert.match(
      await window.locator(".archive-values-help").textContent(),
      /\{referralNumber\}.*\{referralPrefix\}.*\{networkName\}.*\{date\}.*\{dateTime\}.*\{customText\}/
    );
    await window.locator("#archive-custom-text").fill("CCRS");
    await window.waitForFunction(() => document.querySelector("#archive-preview")?.textContent.includes("CCRS26S600001_CCRS_Final.json"));
    await window.locator("#archive-custom-select-all").check();
    assert.equal(await window.locator(".archive-custom-value:checked").count(), 6);
    await window.waitForFunction(() => {
      const preview = document.querySelector("#archive-preview")?.textContent || "";
      return preview.includes("CCRS26S600001_CCRS_CCN1_2019-03-17_2019-01-02_114732_CCRS_Final.json") &&
        preview.includes(".gz");
    });
    assert.equal((await window.locator("#archive-preview").textContent()).includes("{"), false);
    if (process.env.CCRS_E2E_ARCHIVE_SCREENSHOT) {
      await window.locator(".archive-naming-card").scrollIntoViewIfNeeded();
      await window.screenshot({ path: process.env.CCRS_E2E_ARCHIVE_SCREENSHOT, fullPage: false });
    }
    await window.locator('[data-theme="dark"]').click();
    assert.equal(await window.locator("body").evaluate((element) => element.classList.contains("theme-dark")), true);
    const darkCardColors = await window.evaluate(() => ({
      selected: getComputedStyle(document.querySelector('.archive-mode-choices .choice-card:has(input:checked)')).backgroundColor,
      unselected: getComputedStyle(document.querySelector('.archive-mode-choices .choice-card:not(:has(input:checked))')).backgroundColor,
    }));
    assert.notEqual(darkCardColors.selected, darkCardColors.unselected);
    if (process.env.CCRS_E2E_DARK_HELP_SCREENSHOT) {
      await window.locator("#output-help").evaluate((element) => { element.open = true; });
      await window.locator("#output-help").scrollIntoViewIfNeeded();
      await window.screenshot({ path: process.env.CCRS_E2E_DARK_HELP_SCREENSHOT, fullPage: false });
    }
    if (process.env.CCRS_E2E_DARK_OPTION_CARD_SCREENSHOT) {
      await window.locator(".archive-naming-card").scrollIntoViewIfNeeded();
      await window.screenshot({ path: process.env.CCRS_E2E_DARK_OPTION_CARD_SCREENSHOT, fullPage: false });
    }
    await window.locator('[data-theme="light"]').click();
    await window.locator("#archive-custom-select-all").uncheck();
    assert.equal(await window.locator(".archive-custom-value:checked").count(), 0);
    assert.equal(await window.locator("#archive-custom-text").isDisabled(), true);
    await window.locator("#archive-custom-value-referral-number").check();
    await window.locator("#archive-custom-value-date").check();
    await window.waitForFunction(() => document.querySelector("#archive-preview")?.textContent.includes("CCRS26S600001_2019-03-17_Final.json"));
    await window.locator('input[name="archive-naming-mode"][value="referral-number"]').check();
    await window.waitForFunction(() => document.querySelector("#archive-preview")?.textContent.includes("CCRS26S600001_Final.json"));
    await window.locator("#override-network").evaluate((select) => {
      select.value = "CCN2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await window.locator('input[name="archive-naming-mode"][value="network"]').check();
    await window.waitForFunction(() => document.querySelector("#archive-preview")?.textContent.includes("CCN2_CCRS26S600001_Final.json"));
    const uploadDirectoryNote = window.locator(".upload-path-help").first();
    await uploadDirectoryNote.waitFor({ state: "visible" });
    assert.match(await uploadDirectoryNote.textContent(), /CCRS Referral uploads default to \/CCRA_Uploads/);
    const referralTargets = await window.locator(".upload-target").evaluateAll((rows) => rows
      .filter((row) => window.getComputedStyle(row).display !== "none")
      .map((row) => row.dataset.target));
    assert.deepEqual(referralTargets, ["DEV", "PPD", "SQA"]);
    assert.equal(await window.locator('.upload-target[data-target="PROD"]').isHidden(), true);
    await assertControlSystem(window);
    await window.locator("[data-main-tab='leie']").click();
    assert.match(await uploadDirectoryNote.textContent(), /LEIE Data uploads default to \/in\/manual_process\//);
    assert.equal(await window.locator('.upload-target[data-target="PROD"]').isVisible(), true);
    assert.equal(await window.locator("#output-help").isHidden(), true);
    assert.equal(await window.locator("#leie-output-help").isVisible(), true);
    assert.match(await window.locator("#leie-output-help").textContent(), /LEIE produces a processed \.xlsx file/);
    assert.match(await window.locator("#upload-help").textContent(), /Production is available only for LEIE/);
    await assertControlSystem(window);
    await window.locator("[data-main-tab='referral']").click();
    assert.equal(await window.locator("#output-help").isVisible(), true);
    assert.equal(await window.locator("#leie-output-help").isHidden(), true);
    await window.locator("#referral-prefix-mixed").check();
    await window.locator("#referral-code").fill("12345678901234567890");
    await window.locator("#icn-mode-referral-match").check();
    await window.waitForFunction(() => document.querySelector("#referral-preview")?.textContent.includes("VAiFAMS12345678901234567890"));
    await window.waitForFunction(() => document.querySelector("#icn-preview")?.textContent.includes("TEST1234567890121"));
    assert.match(await window.locator("#referral-preview").textContent(), /Preview: VAiFAMS12345678901234567890/);
    assert.match(await window.locator("#icn-preview").textContent(), /Preview: TEST1234567890121/);
    if (process.env.CCRS_E2E_SCREENSHOT) {
      await window.screenshot({ path: process.env.CCRS_E2E_SCREENSHOT, fullPage: true });
    }
    await window.setViewportSize({ width: 800, height: 700 });
    await window.locator("#output-help").evaluate((element) => { element.open = true; });
    const hasHorizontalOverflow = await window.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(hasHorizontalOverflow, false);
    assert.equal(
      await window.locator(".archive-mode-choices").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
      1
    );
    assert.equal(
      await window.locator("#output-help .context-help-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
      1
    );
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
    assert.match(result.message, /Completed safely\. Processed 2 files/);
    assert.match(await window.locator("#status-message").textContent(), /was created successfully/);
    assert.equal(await window.locator("#job-progress-wrap").isVisible(), true);
    assert.equal(await window.locator("#job-progress-value").textContent(), "100%");
    assert.equal(fs.readdirSync(outputDir).some((name) => /^e2e_archive_\d{8}_\d{6}\.gz$/.test(name)), true);
    const outputJsonPaths = fs.readdirSync(outputDir)
      .map((name) => path.join(outputDir, name))
      .filter((filePath) => filePath.toLowerCase().endsWith(".json") && !filePath.toLowerCase().endsWith(".manifest.json"));
    assert.equal(outputJsonPaths.length, 2);
    assert.equal(fs.readdirSync(outputDir).some((name) => name.endsWith(".manifest.json")), true);
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
