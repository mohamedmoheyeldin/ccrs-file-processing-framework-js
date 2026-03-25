const fs = require("fs");
const os = require("os");
const path = require("path");
const { bundlePath } = require("./appPaths");

const TEMPLATE_DIRECTORY = bundlePath("templates", "referrals");

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

function buildGeneratedReferralSources(fileCount, referralsPerFile) {
  const templatePaths = getReferralTemplatePaths();
  if (templatePaths.length === 0) {
    throw new Error("No bundled referral templates were found.");
  }

  const generatedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs_referral_generator_"));
  for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
    const templatePath = templatePaths[fileIndex % templatePaths.length];
    const templateData = JSON.parse(fs.readFileSync(templatePath, "utf8"));
    const referrals = Array.isArray(templateData.Referrals) ? templateData.Referrals : [];
    if (referrals.length === 0) {
      throw new Error(`The selected template does not contain any Referrals: ${path.basename(templatePath)}`);
    }

    const generatedData = JSON.parse(JSON.stringify(templateData));
    generatedData.Referrals = [];
    for (let referralIndex = 0; referralIndex < referralsPerFile; referralIndex += 1) {
      generatedData.Referrals.push(JSON.parse(JSON.stringify(referrals[referralIndex % referrals.length])));
    }

    fs.writeFileSync(
      path.join(generatedDirectory, `generated_template_${fileIndex + 1}.json`),
      JSON.stringify(generatedData, null, 4),
      "utf8"
    );
  }

  return generatedDirectory;
}

module.exports = {
  buildGeneratedReferralSources,
  getGeneratorDefaults,
};
