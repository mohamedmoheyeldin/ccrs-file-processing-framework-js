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
    const seocKey = String(rawOption?.seocKey || rawOption?.SeocKey || "").trim();
    const seocId = String(rawOption?.seocId || rawOption?.SeocID || "").trim();
    const pairKey = `${seocKey}\u0000${seocId}`;
    if (!seocKey || !seocId || seen.has(pairKey)) return;
    seen.add(pairKey);
    options.push({ seocKey, seocId, selectionOnly: Boolean(selectionOnly) });
  }

  for (const templatePath of getReferralTemplatePaths()) {
    const templateData = JSON.parse(fs.readFileSync(templatePath, "utf8"));
    for (const referral of Array.isArray(templateData.Referrals) ? templateData.Referrals : []) {
      const authority = referral.ProgramAuthority || referral;
      addOption(authority, false);
    }
  }

  for (const optionsPath of [
    dataPath("config", SEOC_OPTIONS_FILE),
    bundlePath("config", SEOC_OPTIONS_FILE),
  ]) {
    try {
      if (!fs.existsSync(optionsPath)) continue;
      const configuredOptions = JSON.parse(fs.readFileSync(optionsPath, "utf8"));
      for (const configuredOption of Array.isArray(configuredOptions) ? configuredOptions : []) {
        addOption(configuredOption, configuredOption.selectionOnly !== false);
      }
      break;
    } catch (_error) {
      // Ignore an invalid runtime file and fall back to the bundled options.
    }
  }

  return options.sort((left, right) => Number(left.seocKey) - Number(right.seocKey));
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
};
