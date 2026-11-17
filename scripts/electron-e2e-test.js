const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

// The interface is built from Untitled UI React components (React Aria underneath).
// Checkboxes, radios and switches keep a visually hidden native input, so the helpers
// below click the visible label and read the state from the input.

function control(window, id) {
  return window.locator(`#${id}`);
}

async function setChecked(window, id, checked) {
  const input = control(window, id);
  if ((await input.isChecked()) !== checked) {
    await window.locator(`label:has(#${id})`).click();
  }
  assert.equal(await input.isChecked(), checked, `${id} should be ${checked ? "checked" : "unchecked"}`);
}

async function chooseRadio(window, selector) {
  const input = window.locator(selector);
  await window.locator("label").filter({ has: input }).click();
  assert.equal(await input.isChecked(), true);
}

async function waitForText(window, selector, text) {
  await window.waitForFunction(
    ([targetSelector, expected]) => document.querySelector(targetSelector)?.textContent.includes(expected),
    [selector, text]
  );
}

function options(window, menuId) {
  return window.locator(`#${menuId} [role="option"][data-option-key]`);
}

function chips(window, selectedId) {
  return window.locator(`#${selectedId} [role="row"]`);
}

async function removeChip(window, selectedId, text) {
  await chips(window, selectedId).filter({ hasText: text }).locator("button").click();
}

async function assertControlSystem(window) {
  const audit = await window.evaluate(() => {
    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    }

    const textInputs = [...document.querySelectorAll(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])'
    )].filter((element) => isVisible(element) && !element.closest("[data-date-part]"));
    const inputHeights = [...new Set(textInputs.map((element) => Math.round(element.getBoundingClientRect().height)))];

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

    const uploadPairs = [...document.querySelectorAll("[data-upload-grid]")]
      .filter(isVisible)
      .map((grid) => {
        const userControl = grid.querySelector("[data-upload-user] button");
        const pathControl = grid.querySelector("[data-upload-path] input");
        return {
          userWidth: Number(userControl?.getBoundingClientRect().width.toFixed(1) || 0),
          pathWidth: Number(pathControl?.getBoundingClientRect().width.toFixed(1) || 0),
          userTop: Number(userControl?.getBoundingClientRect().top.toFixed(1) || 0),
          pathTop: Number(pathControl?.getBoundingClientRect().top.toFixed(1) || 0),
        };
      });
    return { inputHeights, unnamedControls, uploadPairs };
  });

  assert.equal(audit.inputHeights.length, 1, `Text inputs should share one height, received ${audit.inputHeights}`);
  assert.equal(audit.inputHeights[0] >= 40, true);
  assert.deepEqual(audit.unnamedControls, []);
  for (const pair of audit.uploadPairs) {
    assert.equal(pair.userWidth < pair.pathWidth, true);
    assert.equal(Math.abs(pair.userTop - pair.pathTop) <= 4, true);
  }
}

async function assertReachable(electronApp, window, locator, label) {
  for (const zoom of [1.5, 2, 3]) {
    await electronApp.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor), zoom);
    // Zoom changes are applied asynchronously, so re-check until the layout has settled
    // instead of measuring once right after the zoom call.
    let reachable = false;
    for (let attempt = 0; attempt < 20 && !reachable; attempt += 1) {
      await locator.scrollIntoViewIfNeeded();
      reachable = await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      });
      if (!reachable) await window.waitForTimeout(100);
    }
    assert.ok(reachable, `${label} reachable at ${zoom * 100}%`);
  }
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
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
    // Chromium's sandbox is unavailable to root in Linux containers.
    args: [...(process.platform === "linux" ? ["--no-sandbox"] : []), projectRoot],
    env: { ...process.env, CCRS_USER_DATA_ROOT: userDataRoot },
  });

  let window;
  try {
    window = await electronApp.firstWindow();
    const pageErrors = [];
    window.on("pageerror", (error) => pageErrors.push(error.message));
    await window.waitForLoadState("domcontentloaded");
    await window.locator("#status-message").waitFor({ state: "visible" });

    // Release announcement
    const releaseButton = window.locator("#release-announcement-accept");
    await releaseButton.waitFor({ state: "visible" });
    assert.match(await window.locator("#release-announcement-title").textContent(), /What's new in Version/);
    assert.equal((await window.locator("#release-announcement-list li").count()) > 0, true);
    await window.setViewportSize({ width: 800, height: 600 });
    await assertReachable(electronApp, window, releaseButton, "Release button");
    await releaseButton.click();
    await releaseButton.waitFor({ state: "detached" });
    await window.setViewportSize({ width: 1280, height: 900 });

    // Shell
    assert.match(await window.title(), /CCRS File Processing Framework/);
    assert.equal(await window.locator("#workflow-stepper").isVisible(), true);
    assert.equal(await window.locator("#workflow-stepper [data-workflow-step]").count(), 5);
    assert.equal(await window.locator('#workflow-stepper [data-state="active"]').count(), 1);
    assert.equal(await window.locator("#run-process").isVisible(), true);
    assert.equal(await window.locator("#cancel-job").count(), 0);
    assert.equal(await window.locator("#status-badge").textContent(), "Ready");
    assert.equal(await window.locator("#job-progress-wrap").count(), 0);
    assert.equal(await window.locator("#pre-run-overlay").count(), 0);
    assert.equal(await window.locator("meta[http-equiv='Content-Security-Policy']").count(), 1);

    // Contextual help
    assert.equal(await window.locator("[data-context-help]").count(), 4);
    assert.equal(await window.locator("[data-context-help][data-open]").count(), 0);
    assert.equal(await window.locator("#output-help").isVisible(), true);
    assert.equal(await window.locator("#leie-output-help").count(), 0);
    assert.equal((await window.locator("#workflow-help button").first().textContent()).trim(), "New here? See how the five steps work");
    await window.locator("#workflow-help button").first().click();
    assert.equal(await window.locator("#workflow-help[data-open]").count(), 1);
    assert.equal(await window.locator("#workflow-help [data-help-item]").count(), 5);
    assert.match(await window.locator("#workflow-help").textContent(), /Source files are never edited/);
    assert.equal(await window.locator("#input-dir").getAttribute("aria-describedby"), "source-folder-help");
    assert.match(await window.locator("#source-folder-help").textContent(), /never changes the originals/);
    assert.equal(await window.locator("[data-live-preview]").count(), 3);

    // Removed features stay removed
    assert.equal(await window.locator("#generation-preset").count(), 0);
    assert.equal(await window.locator("#generation-preset-name").count(), 0);
    assert.equal(await window.locator("#recent-runs").count(), 0);
    assert.equal(await window.locator('input[name="referral-prefix-mode"]').count(), 2);
    assert.equal(await window.locator('input[name="archive-naming-mode"]').count(), 4);
    assert.equal(await window.locator('input[name="archive-naming-mode"][value="prefix"]').count(), 0);
    assert.equal(await window.locator("#referral-prefix-va").isChecked(), true);
    assert.equal(await window.locator("#custom-referral-prefix-row").count(), 0);

    // Referral Numbers
    await window.locator("[data-sub-tab='generate']").click();
    assert.equal(await window.locator("#run-generate").isVisible(), true);
    assert.equal(await window.locator("#source-card").count(), 0);
    assert.match(await window.locator("#template-summary-pill").textContent(), /1 JSON file \| 1 referral per file \| 1 total referral/);
    assert.match(await window.locator("#referral-prefix-help").textContent(), /VA will be added automatically/);
    await window.locator("#referral-code").fill("DD");
    await waitForText(window, "#referral-preview", "VADD00000001");
    assert.match(await window.locator("#referral-preview").textContent(), /Preview: VADD00000001/);
    await chooseRadio(window, "#referral-prefix-custom");
    assert.equal(await window.locator("#custom-referral-prefix-row").isVisible(), true);
    assert.equal(await window.locator("#custom-referral-prefix").getAttribute("maxlength"), "8");
    await window.locator("#custom-referral-prefix").fill("PROJECT_");
    await window.locator("#referral-code").fill("12345678901234567890");
    await waitForText(window, "#referral-preview", "PROJECT_7890");
    await window.locator("#custom-referral-prefix").fill("Ccrs-T_");
    await window.locator("#referral-code").fill("abC-001_Test");
    await waitForText(window, "#referral-preview", "Ccrs-T_abC-1");
    await window.locator("#custom-referral-prefix").fill("CCRS");
    await window.locator("#referral-code").fill("26S600001");
    await chooseRadio(window, "#referral-prefix-va");
    assert.match(await window.locator("#output-retention-card").textContent(), /Matching filenames are overwritten automatically/);

    // A run over the combined size limit is flagged before it can start.
    await window.locator("#file-count").fill("100");
    await window.locator("#referrals-per-file").fill("800");
    await waitForText(window, "#generated-size-estimate", "Too large");
    assert.match(await window.locator("#generated-size-estimate").textContent(), /about 1\.\d\d GB of JSON\. The limit is 1\.00 GB/);
    await window.locator("#run-generate").click();
    await waitForText(window, "#status-message", "combined safety limit");
    assert.equal(await window.locator("#pre-run-overlay").count(), 0);
    await window.locator("#file-count").fill("2");
    await window.locator("#referrals-per-file").fill("2");
    await waitForText(window, "#generated-size-estimate", "Estimated size");

    // Generator counts
    await window.locator("#file-count").fill("3");
    await window.locator("#referrals-per-file").fill("4");
    assert.equal(await window.locator("#generator-total-referrals-display").textContent(), "12");
    await window.locator("#file-count").fill("2");
    await window.locator("#referrals-per-file").fill("2");

    // Additional fields
    await window.locator("#toggle-optional-fields").click();
    assert.equal(await window.locator("#optional-fields").isVisible(), true);
    assert.equal(await window.locator('input[name="icn-mode"]').count(), 3);
    assert.equal(await window.locator("[data-live-preview]").count(), 6);
    assert.equal(await chips(window, "selected-seocs").count(), 0);
    assert.equal(await chips(window, "selected-situational-seocs").count(), 0);
    assert.equal(await window.locator("#use-current-referral-dates").isChecked(), true);
    const today = await window.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    assert.equal(await window.locator("#override-referral-date").inputValue(), today);
    await window.locator("#override-referral-date").fill("2024-02-25");
    assert.equal(await window.locator("#use-current-referral-dates").isChecked(), false);
    await setChecked(window, "use-current-referral-dates", true);
    assert.equal(await window.locator("#override-referral-date").inputValue(), today);

    // Payment Authority Codes
    await window.locator("#override-payment-authority-code").focus();
    await options(window, "payment-code-menu").first().waitFor({ state: "visible" });
    assert.equal(await options(window, "payment-code-menu").count(), 43);
    await window.locator('#payment-code-menu [data-option-key="21"]').click();
    await window.locator('#payment-code-menu [data-option-key="28"]').click();
    assert.equal(await chips(window, "selected-payment-codes").count(), 2);
    assert.equal(await window.locator("#use-all-payment-codes").isChecked(), false);
    await window.locator("#override-payment-authority-code").press("Escape");
    assert.equal(await window.locator("#payment-code-menu").count(), 0);
    await setChecked(window, "use-all-payment-codes", true);
    assert.equal(await chips(window, "selected-payment-codes").count(), 0);
    await window.locator("#override-payment-authority-code").fill("21");
    assert.equal(await options(window, "payment-code-menu").count(), 1);
    await window.locator('#payment-code-menu [data-option-key="21"]').click();
    assert.equal(await window.locator("#use-all-payment-codes").isChecked(), false);
    await window.locator("#override-payment-authority-code").press("Escape");
    await window.waitForFunction(async () => {
      const info = await window.ccrs.getInfo();
      return info.uiSettings.selectedPaymentCodes?.join(",") === "21" && info.uiSettings.useAllPaymentCodes === false;
    });

    // ICN modes
    await chooseRadio(window, "#referral-prefix-custom");
    await chooseRadio(window, "#icn-mode-custom-full");
    await window.locator("#icn-custom-value").fill("aBc123");
    assert.equal(await window.locator("#icn-custom-value").inputValue(), "aBc123");
    await waitForText(window, "#icn-preview", "aBc123");
    await chooseRadio(window, "#icn-mode-referral-match");
    await waitForText(window, "#icn-preview", "TEST0000026600001");
    assert.equal(await window.locator("#icn-custom-value").isDisabled(), true);
    assert.match(await window.locator("#referral-preview").textContent(), /CCRS26600001/);
    const cardMetrics = await window.evaluate(() => [...document.querySelectorAll("[data-choice-card]")]
      .filter((card) => card.getBoundingClientRect().height > 0)
      .map((card) => {
        const style = getComputedStyle(card);
        return `${style.padding}|${style.borderRadius}|${style.minHeight}`;
      }));
    assert.equal(new Set(cardMetrics).size, 1, "Option cards should share one padding, radius and minimum height");

    // Referral / ICN match select
    await window.locator("#match-suffix-length").click();
    const matchOptions = window.locator('[role="listbox"] [role="option"]');
    await matchOptions.first().waitFor({ state: "visible" });
    assert.equal(await matchOptions.count(), 3);
    await matchOptions.filter({ hasText: "Match last 4 characters" }).click();
    assert.match(await window.locator("#match-suffix-length").textContent(), /Match last 4 characters/);

    // Stations
    assert.equal(await window.locator("#station-id-menu").count(), 0);
    await window.locator("#override-station-id").focus();
    await options(window, "station-id-menu").first().waitFor({ state: "visible" });
    assert.equal(await options(window, "station-id-menu").count(), 60);
    assert.match(await window.locator("#station-id-menu [data-combobox-summary]").textContent(), /complete catalog/);
    await window.locator("#override-station-id").fill("508GS");
    assert.equal(await window.locator("#station-id-menu [data-option-field]", { hasText: "station_id: 508GS" }).count(), 1);
    assert.equal(await window.locator("#station-id-menu [data-option-field]", { hasText: "station_key: 2864" }).count(), 1);
    await options(window, "station-id-menu").filter({ hasText: "Pike County VA Clinic" }).click();
    assert.equal(await window.locator("#override-station-id").inputValue(), "");
    assert.equal(await chips(window, "selected-stations").filter({ hasText: "508GS" }).count(), 1);
    await waitForText(window, "#station-id-preview", "randomized from 508GS");
    await window.locator("#override-station-id").press("Escape");
    assert.equal((await window.locator("body").textContent()).includes("(Optional)"), false);

    // SEOC and Situational SEOC
    const situationalColor = await window.locator("[data-situational-label]").evaluate((element) => getComputedStyle(element).color);
    const normalLabelColor = await window.locator("[data-situational-label]").locator("..").evaluate((element) => getComputedStyle(element).color);
    assert.notEqual(situationalColor, normalLabelColor);
    const seocBounds = await window.locator("#seoc-combobox").boundingBox();
    const situationalSeocBounds = await window.locator("#situational-seoc-combobox").boundingBox();
    assert.equal(Boolean(seocBounds && situationalSeocBounds), true);
    assert.equal(Math.abs(seocBounds.y - situationalSeocBounds.y) < 4, true);
    await window.locator("#seoc-search").fill("AUD_AUDIOLOGY_1.0.1");
    const requestedPrimarySeoc = options(window, "seoc-menu").first();
    await requestedPrimarySeoc.waitFor({ state: "visible" });
    assert.equal((await requestedPrimarySeoc.locator("[data-option-title]").textContent()).trim(), "AUD_AUDIOLOGY");
    assert.equal((await requestedPrimarySeoc.locator("[data-option-copy]").textContent()).trim(), "SEOC Number: 11");
    await window.locator("#seoc-search").fill("MSC_INFERTILITY-IUI FEMALE");
    assert.equal(await options(window, "seoc-menu").count(), 0);
    assert.equal(await window.locator("#seoc-menu [data-combobox-empty]").textContent(), "No matching SEOC values.");
    await window.locator("#seoc-search").fill("PMR_ACUPUNCTURE INITIAL");
    const primarySeoc = options(window, "seoc-menu").filter({ hasText: "PMR_ACUPUNCTURE INITIAL" }).first();
    await primarySeoc.waitFor({ state: "visible" });
    assert.equal((await primarySeoc.locator("[data-option-copy]").textContent()).trim(), "SEOC Number: 1");
    await primarySeoc.click();
    assert.equal(await chips(window, "selected-seocs").filter({ hasText: "PMR_ACUPUNCTURE INITIAL" }).count(), 1);
    assert.equal(await window.locator("#seoc-override-warning").count(), 0);
    await window.locator("#seoc-search").press("Escape");
    await removeChip(window, "selected-seocs", "PMR_ACUPUNCTURE INITIAL");
    assert.equal(await chips(window, "selected-seocs").count(), 0);
    await window.locator("#situational-seoc-search").fill("AUD_AUDIOLOGY");
    assert.equal(await options(window, "situational-seoc-menu").count(), 0);
    await window.locator("#situational-seoc-search").fill("EUC_EMERGENCY CARE");
    const situationalSeoc = options(window, "situational-seoc-menu").filter({ hasText: "EUC_EMERGENCY CARE" }).first();
    await situationalSeoc.waitFor({ state: "visible" });
    assert.equal((await situationalSeoc.locator("[data-option-copy]").textContent()).trim(), "SEOC Number: 158");
    await situationalSeoc.click();
    assert.equal(await chips(window, "selected-situational-seocs").filter({ hasText: "EUC_EMERGENCY CARE" }).count(), 1);
    assert.match(await window.locator("#seoc-override-warning").textContent(), /Most referrals use regular SEOC only/);
    await window.locator("#situational-seoc-search").press("Escape");
    await setChecked(window, "use-all-situational-seocs", true);
    assert.equal(await chips(window, "selected-situational-seocs").count(), 0);
    assert.equal(await window.locator("#situational-seoc-search").isDisabled(), false);
    assert.match(await window.locator("#situational-seoc-match").textContent(), /All 9 available Situational SEOC values/);
    await setChecked(window, "use-all-situational-seocs", false);
    assert.equal(await window.locator("#seoc-override-warning").count(), 0);

    // Network and archive naming
    await window.locator("#network-search").fill("CCN1");
    await options(window, "network-menu").filter({ hasText: "CCN1" }).click();
    await window.locator("#network-search").press("Escape");
    await chooseRadio(window, 'input[name="archive-naming-mode"][value="custom"]');
    assert.equal(await window.locator("#archive-custom-fields").isVisible(), true);
    assert.equal(await window.locator(".archive-custom-value").count(), 6);
    assert.match(
      await window.locator("#archive-name-help").textContent(),
      /\{referralNumber\}.*\{referralPrefix\}.*\{networkName\}.*\{date\}.*\{dateTime\}.*\{customText\}/
    );
    await window.locator("#archive-custom-text").fill("CCRS");
    await waitForText(window, "#archive-preview", "CCRS26600001_CCRS_Master.json");
    await window.locator("#override-referral-date").fill("2019-03-17");
    await window.locator("#override-referral-date-time").fill("2019-01-02 11:47:32");
    await setChecked(window, "archive-custom-select-all", true);
    assert.equal(await window.locator(".archive-custom-value:checked").count(), 6);
    await waitForText(window, "#archive-preview", "CCRS26600001_CCRS_CCN1_2019-03-17_2019-01-02_114732_CCRS_Master.json");
    assert.match(await window.locator("#archive-preview").textContent(), /\.gz/);
    assert.equal((await window.locator("#archive-preview").textContent()).includes("{"), false);

    // Dark theme
    await window.locator('[data-theme="dark"]').click();
    assert.equal(await window.locator("html").evaluate((element) => element.classList.contains("dark-mode")), true);
    await window.waitForTimeout(250);
    const darkCardColors = await window.evaluate(() => {
      const cards = [...document.querySelectorAll("#archive-naming-card [role='radiogroup'] [data-choice-card]")];
      return {
        selected: getComputedStyle(cards.find((card) => card.querySelector("input:checked"))).backgroundColor,
        unselected: getComputedStyle(cards.find((card) => !card.querySelector("input:checked"))).backgroundColor,
        page: getComputedStyle(document.body).backgroundColor,
      };
    });
    assert.notEqual(darkCardColors.selected, darkCardColors.unselected);
    if (process.env.CCRS_E2E_DARK_SCREENSHOT) {
      await window.screenshot({ path: process.env.CCRS_E2E_DARK_SCREENSHOT, fullPage: true });
    }
    await window.locator('[data-theme="light"]').click();
    assert.equal(await window.locator("html").evaluate((element) => element.classList.contains("dark-mode")), false);

    await setChecked(window, "archive-custom-select-all", false);
    assert.equal(await window.locator(".archive-custom-value:checked").count(), 0);
    assert.equal(await window.locator("#archive-custom-text").isDisabled(), true);
    await setChecked(window, "archive-custom-value-referral-number", true);
    await setChecked(window, "archive-custom-value-date", true);
    await waitForText(window, "#archive-preview", "CCRS26600001_2019-03-17_Master.json");
    await chooseRadio(window, 'input[name="archive-naming-mode"][value="referral-number"]');
    await waitForText(window, "#archive-preview", "CCRS26600001_Master.json");
    await removeChip(window, "selected-networks", "CCN1");
    await window.locator("#network-search").fill("CCN2");
    await options(window, "network-menu").filter({ hasText: "CCN2" }).click();
    assert.match(await window.locator("#network-match").textContent(), /CCN2 will be used for every referral/);
    await window.locator("#network-search").fill("CCN4");
    await options(window, "network-menu").filter({ hasText: "CCN4" }).click();
    assert.match(await window.locator("#network-match").textContent(), /mixed from the 2 selected Networks/);
    await window.locator("#network-search").press("Escape");
    await removeChip(window, "selected-networks", "CCN4");
    await chooseRadio(window, 'input[name="archive-naming-mode"][value="network"]');
    await waitForText(window, "#archive-preview", "CCN2_CCRS26600001_Master.json");

    // Upload targets follow the workflow policy
    const uploadDirectoryNote = window.locator("[data-upload-path-help]").first();
    await uploadDirectoryNote.waitFor({ state: "visible" });
    assert.match(await uploadDirectoryNote.textContent(), /CCRS Referral uploads default to \/CCRA_Uploads/);
    const visibleTargets = () => window.locator("[data-upload-target]").evaluateAll((rows) => rows.map((row) => row.dataset.uploadTarget));
    assert.deepEqual(await visibleTargets(), ["SQA", "DEV", "PPD"]);
    assert.match(await window.locator("#upload-subtitle").textContent(), /PROD is not available for Referral Files/);
    await assertControlSystem(window);

    // LEIE workflow
    await window.locator("[data-main-tab='leie']").click();
    assert.match(await window.locator("#workflow-title").textContent(), /LEIE Data Processing/);
    // The guide is the first item on the module, ahead of the Source section.
    const guideTop = (await window.locator("#leie-guide-banner").boundingBox()).y;
    const sourceTop = (await window.locator("#source-card").boundingBox()).y;
    assert.equal(guideTop < sourceTop, true);
    assert.deepEqual(
      await window.locator("#leie-environment-reference [data-leie-environment]").evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => cell.textContent.trim()).join(" "))),
      ["SQA VAC10SQLCCN816.va.gov ccrsdb", "DEV VAC10SQLCCN802.va.gov ccrsdb", "PPD VAC10SQLCCN404.va.gov ccrsdb"]
    );
    await window.locator("#leie-validation-batch-id").fill("LEIE_E2E_BATCH");
    await window.locator("#copy-leie-validation-sql").click();
    await waitForText(window, "#leie-validation-copy-status", "SQL copied");
    assert.match(await electronApp.evaluate(({ clipboard }) => clipboard.readText()), /where etl_batch_id = 'LEIE_E2E_BATCH'/);
    await window.locator("#leie-validation-batch-id").fill("");
    assert.equal(await window.locator("[data-main-tab]").count(), 3);
    assert.equal(await window.locator("[data-main-tab='leie'][aria-selected='true']").count(), 1);
    assert.match(await uploadDirectoryNote.textContent(), /LEIE Data uploads default to \/in\/manual_process\//);
    assert.deepEqual(await visibleTargets(), ["SQA", "DEV", "PPD", "PROD"]);
    assert.equal(await window.locator("#output-help").count(), 0);
    assert.equal(await window.locator("#leie-output-help").isVisible(), true);
    assert.match(await window.locator("#leie-output-help button").first().textContent(), /LEIE output naming and safety/);
    await window.locator("#upload-help button").first().click();
    assert.match(await window.locator("#upload-help").textContent(), /Production is available only for LEIE/);
    assert.equal(await window.locator("#leie-duplicate-card").isVisible(), true);
    assert.equal(await window.locator("#referral-details-card").count(), 0);
    assert.equal(await window.locator("#archive-naming-card").count(), 0);
    assert.equal((await window.locator("#run-process").textContent()).trim(), "Save Processed File");
    assert.equal(await window.locator("#run-process").isDisabled(), true);
    assert.match(await window.locator("#leie-validation-sql").textContent(), /CLAIM_BATCH_LOG/);
    await window.locator("#leie-validation-batch-id").fill("LEIE_E2E_BATCH");
    await waitForText(window, "#leie-validation-sql", "LEIE_E2E_BATCH");
    await assertControlSystem(window);

    await window.locator("[data-main-tab='other']").click();
    assert.equal(await window.locator("#future-card").isVisible(), true);
    assert.equal(await window.locator("#run-card").count(), 0);

    // Back to Referral Files: the generate settings are still in place.
    await window.locator("[data-main-tab='referral']").click();
    await window.locator("[data-sub-tab='generate']").click();
    assert.equal(await window.locator("#output-help").isVisible(), true);
    await chooseRadio(window, "#referral-prefix-va");
    await window.locator("#referral-code").fill("26S6-00001_TEST");
    await waitForText(window, "#referral-preview", "VA26S6-00001");
    await waitForText(window, "#icn-preview", "TEST000026S600001");
    assert.match(await window.locator("#referral-prefix-help").textContent(), /hyphens \(-\).*underscores \(_\)/);
    await window.locator("#referral-code").fill("12345678901234567890");
    await waitForText(window, "#referral-preview", "VA1234567890");
    await waitForText(window, "#icn-preview", "TEST0001234567890");
    if (process.env.CCRS_E2E_SCREENSHOT) {
      await window.screenshot({ path: process.env.CCRS_E2E_SCREENSHOT, fullPage: true });
    }

    // Narrow window: no horizontal scrolling and single-column option cards.
    await window.setViewportSize({ width: 800, height: 700 });
    const hasHorizontalOverflow = await window.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(hasHorizontalOverflow, false);
    await window.setViewportSize({ width: 560, height: 700 });
    assert.equal(
      await window.locator("#archive-naming-card [role='radiogroup']").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
      1
    );
    assert.equal(await window.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await window.setViewportSize({ width: 800, height: 600 });

    // A validation error blocks the run before the review dialog.
    await window.locator("#file-count").fill("0");
    await window.locator("#run-generate").click();
    await waitForText(window, "#status-message", "Please fix the highlighted fields before running.");
    assert.equal(await window.locator("#pre-run-overlay").count(), 0);
    assert.match(await window.locator("#generator-card").textContent(), /must be greater than zero/);
    await window.locator("#file-count").fill("2");

    // Real generate run through the safety review dialog.
    await chooseRadio(window, 'input[name="archive-naming-mode"][value="referral-number"]');
    await window.locator("#replacement-code").fill("e2e_referral");
    await window.locator("#master-file-name").fill("");
    await window.locator("#output-dir").fill(outputDir);
    await window.locator("#run-generate").click();
    const confirmButton = window.locator("#pre-run-confirm");
    await confirmButton.waitFor({ state: "visible" });
    assert.equal(await window.locator("#prod-confirm-wrap").count(), 0);
    assert.match(await window.locator("#pre-run-summary").textContent(), /Generate Referral Files/);
    assert.match(await window.locator("#pre-run-summary").textContent(), /Local output only/);
    await assertReachable(electronApp, window, confirmButton, "Generate confirmation");
    await window.locator("#pre-run-cancel").click();
    await confirmButton.waitFor({ state: "detached" });
    await waitForText(window, "#status-message", "The run was not started.");
    assert.equal(fs.readdirSync(outputDir).length, 0);

    await window.setViewportSize({ width: 1280, height: 900 });
    await window.locator("#run-generate").click();
    await confirmButton.waitFor({ state: "visible" });
    await confirmButton.click();
    await window.waitForFunction(() => document.querySelector("#status-badge")?.textContent === "Completed", null, { timeout: 60000 });
    assert.match(await window.locator("#status-message").textContent(), /Completed safely\. Processed 2 files/);
    assert.equal(await window.locator("#cancel-job").count(), 0);
    assert.equal(await window.locator("#job-progress-wrap").count(), 0);
    assert.equal(await window.locator('#workflow-stepper [data-state="complete"]').count(), 5);
    assert.equal(await window.locator("#result-actions").isVisible(), true);
    assert.equal(await window.locator("#retry-failed-uploads").count(), 0);
    assert.equal(fs.readdirSync(outputDir).some((name) => name.endsWith(".gz")), true);
    const outputJsonPaths = fs.readdirSync(outputDir)
      .map((name) => path.join(outputDir, name))
      .filter((filePath) => filePath.toLowerCase().endsWith(".json") && !filePath.toLowerCase().endsWith(".manifest.json") && !filePath.endsWith("_Master.json"));
    assert.deepEqual(outputJsonPaths.map((filePath) => path.basename(filePath)).sort(), ["e2e_referral_1.json", "e2e_referral_2.json"]);
    assert.equal(fs.readdirSync(outputDir).some((name) => name.endsWith("_Master.json")), true);
    assert.equal(fs.readdirSync(outputDir).some((name) => name.endsWith(".manifest.json")), false);
    await window.locator("#open-batch-manifest").click();
    await waitForText(window, "#status-message", "Manifest generated in the output folder.");
    assert.equal(fs.readdirSync(outputDir).some((name) => name.endsWith(".manifest.json")), true);

    const generatedReferrals = outputJsonPaths.flatMap(
      (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")).Referrals
    );
    // Situational SEOCs are identified by the Number and ID pair. A regular SEOC may share a
    // Number with a Situational one (several regular entries use 67), so compare the pair.
    const appInfo = await window.evaluate(() => window.ccrs.getInfo());
    const situationalSeocPairs = new Set(appInfo.situationalSeocOptions.map((option) => `${option.seocKey}::${option.seocId}`));
    assert.equal(situationalSeocPairs.size > 0, true);
    assert.equal(generatedReferrals.length, 4);
    assert.equal(new Set(generatedReferrals.map((referral) => referral.Patient.SSN)).size, 4);
    for (const referral of generatedReferrals) {
      const stationId = referral.ProgramAuthority?.StationID || referral.StationID;
      const seocKey = referral.ProgramAuthority?.SeocKey || referral.SeocKey;
      assert.match(referral.Patient.SSN, /^999-\d{2}-\d{4}$/);
      assert.equal(stationId, "508GS");
      const seocId = referral.ProgramAuthority?.SeocID || referral.SeocID;
      assert.equal(situationalSeocPairs.has(`${seocKey}::${seocId}`), false);
    }

    // Saved settings are restored after a reload.
    await window.waitForFunction(async (expectedOutputDir) => {
      const info = await window.ccrs.getInfo();
      return info.uiSettings.outputDir === expectedOutputDir && info.uiSettings.subTab === "generate";
    }, outputDir);
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await window.locator("#run-generate").waitFor({ state: "visible" });
    assert.equal(await window.locator("#release-announcement-accept").count(), 0);
    assert.equal(await window.locator("#output-dir").inputValue(), outputDir);
    assert.equal(await window.locator("#optional-fields").isVisible(), true);
    assert.equal(await chips(window, "selected-payment-codes").count(), 1);
    assert.match(await chips(window, "selected-payment-codes").first().textContent(), /21/);
    assert.equal(await window.locator("#use-all-payment-codes").isChecked(), false);
    assert.equal(await chips(window, "selected-stations").filter({ hasText: "508GS" }).count(), 1);
    assert.match(await window.locator("#match-suffix-length").textContent(), /Match last 4 characters/);
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    const state = await window?.evaluate(() => ({
      badge: document.querySelector("#status-badge")?.textContent,
      message: document.querySelector("#status-message")?.textContent,
      dialog: document.querySelector("[role='dialog']")?.textContent.slice(0, 200),
      invalid: [...document.querySelectorAll("[aria-invalid='true'], [data-invalid]")].map((element) => `${element.id || element.tagName}=${element.value ?? ""}`),
      errors: [...document.querySelectorAll(".text-error-primary")].map((element) => element.textContent.slice(0, 160)),
    })).catch(() => null);
    console.error("UI state at failure:", JSON.stringify(state));
    throw error;
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
