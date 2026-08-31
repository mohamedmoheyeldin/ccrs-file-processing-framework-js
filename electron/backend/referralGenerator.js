const fs = require("fs");
const os = require("os");
const path = require("path");
const { bundlePath, dataPath } = require("./appPaths");
const { registerTemporaryPath, removePath } = require("./runtimeCleanup");

const TEMPLATE_DIRECTORY = bundlePath("templates", "referrals");
const SEOC_OPTIONS_FILE = "seoc_options.json";

function getReferralTemplatePaths() {
  if (!fs.existsSync(TEMPLATE_DIRECTORY)) {
    return [];
  }

  return fs
    .readdirSync(TEMPLATE_DIRECTORY)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => path.join(TEMPLATE_DIRECTORY, name))
    .sort();
}

function getGeneratorDefaults() {
  const [firstTemplatePath] = getReferralTemplatePaths();
  if (!firstTemplatePath) {
    return {};
  }

  const templateData = JSON.parse(fs.readFileSync(firstTemplatePath, "utf8"));
  const firstReferral = Array.isArray(templateData.Referrals) ? templateData.Referrals[0] || {} : {};
  const patient = firstReferral.Patient || {};

  return {
    DOB: patient.DOB || "",
    Network: firstReferral.Network || "",
    ReferralCategory: firstReferral.ReferralCategory || "",
    ReferralConsultId: firstReferral.ReferralConsultId || "",
    ReferralDate: firstReferral.ReferralDate || "",
    ReferralDateTime: firstReferral.ReferralDateTime || "",
    ReferralExpirationDate: firstReferral.ReferralExpirationDate || "",
    ReferralLastUpdateDate: firstReferral.ReferralLastUpdateDate || "",
    ReferralNumber: firstReferral.ReferralNumber || "",
    ReferralPeriod: firstReferral.ReferralPeriod || "",
  };
}

function getSeocOptions() {
  const options = [];
  const seen = new Set();

  function addOption(rawOption, selectionOnly = false) {
    const seocKey = String(rawOption?.seocNumber || rawOption?.seocKey || rawOption?.SeocKey || "").trim();
    const seocId = String(rawOption?.seocId || rawOption?.SeocID || "").trim();
    const pairKey = `${seocKey}\u0000${seocId}`;
    if (!seocKey || !seocId || seen.has(pairKey)) return;
    seen.add(pairKey);
    const name = String(rawOption?.name || seocId.replace(/_\d+(?:\.\d+){1,3}(?:_[A-Za-z0-9_]+)?$/, "")).trim();
    options.push({
      seocNumber: seocKey,
      seocKey,
      seocId,
      name,
      displayName: String(rawOption?.displayName || `${name} - ${seocKey}`).trim(),
      selectorKey: `${encodeURIComponent(seocKey)}::${encodeURIComponent(seocId)}`,
      selectionOnly: Boolean(rawOption?.selectionOnly ?? selectionOnly),
    });
  }

  for (const optionsPath of [
    dataPath("config", SEOC_OPTIONS_FILE),
    bundlePath("config", SEOC_OPTIONS_FILE),
  ]) {
    try {
      if (!fs.existsSync(optionsPath)) continue;
      const configuredOptions = JSON.parse(fs.readFileSync(optionsPath, "utf8"));
      for (const configuredOption of Array.isArray(configuredOptions) ? configuredOptions : []) {
        addOption(configuredOption, configuredOption.selectionOnly === true);
      }
      break;
    } catch (_error) {
      // Ignore an invalid runtime file and fall back to the bundled options.
    }
  }

  return options.sort((left, right) =>
    left.name.localeCompare(right.name, "en", { numeric: true, sensitivity: "base" }) ||
    left.seocKey.localeCompare(right.seocKey, "en", { numeric: true })
  );
}

function resolveSeocSelection(selectorKeys = [], useAll = false) {
  const options = getSeocOptions();
  const bySelectorKey = new Map(options.map((option) => [option.selectorKey, option]));
  const requestedKeys = useAll ? options.map((option) => option.selectorKey) : selectorKeys;
  const selections = [];
  const seen = new Set();
  for (const rawKey of Array.isArray(requestedKeys) ? requestedKeys : []) {
    const selectorKey = String(rawKey || "");
    if (!selectorKey || seen.has(selectorKey)) continue;
    const option = bySelectorKey.get(selectorKey);
    if (!option) throw new Error("A selected SEOC value is no longer available in the installed SEOC data.");
    seen.add(selectorKey);
    selections.push({ seocKey: option.seocKey, seocId: option.seocId });
  }

  if (options.length === 0) {
    for (const templatePath of getReferralTemplatePaths()) {
      const templateData = JSON.parse(fs.readFileSync(templatePath, "utf8"));
      for (const referral of Array.isArray(templateData.Referrals) ? templateData.Referrals : []) {
        addOption(referral.ProgramAuthority || referral, false);
      }
    }
  }
  return selections;
}

function buildGeneratedReferralSources(fileCount, referralsPerFile) {
  const templatePaths = getReferralTemplatePaths();
  if (templatePaths.length === 0) {
    throw new Error("No bundled referral templates were found.");
  }

  const generatedDirectory = registerTemporaryPath(
    fs.mkdtempSync(path.join(os.tmpdir(), "ccrs_referral_generator_"))
  );
  try {
    for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
      const templatePath = templatePaths[fileIndex % templatePaths.length];
      const templateData = JSON.parse(fs.readFileSync(templatePath, "utf8"));
      const referrals = Array.isArray(templateData.Referrals) ? templateData.Referrals : [];
      if (referrals.length === 0) {
        throw new Error(`The selected template does not contain any Referrals: ${path.basename(templatePath)}`);
      }

      const generatedData = structuredClone(templateData);
      generatedData.Referrals = [];
      for (let referralIndex = 0; referralIndex < referralsPerFile; referralIndex += 1) {
        generatedData.Referrals.push(structuredClone(referrals[referralIndex % referrals.length]));
      }

      fs.writeFileSync(
        path.join(generatedDirectory, `generated_template_${fileIndex + 1}.json`),
        JSON.stringify(generatedData, null, 4),
        "utf8"
      );
    }
    return generatedDirectory;
  } catch (error) {
    removePath(generatedDirectory);
    throw error;
  }
}

module.exports = {
  buildGeneratedReferralSources,
  getGeneratorDefaults,
  getSeocOptions,
  resolveSeocSelection,
};
