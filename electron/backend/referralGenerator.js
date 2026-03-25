const fs = require("fs");
const os = require("os");
const path = require("path");
const { bundlePath } = require("./appPaths");

const TEMPLATE_DIRECTORY = bundlePath("templates", "referrals");
const ROTATE_ALL_TEMPLATES = "Rotate bundled examples";

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

function getReferralTemplateOptions() {
  return [ROTATE_ALL_TEMPLATES, ...getReferralTemplatePaths().map((templatePath) => path.basename(templatePath))];
}

function getReferralTemplateMetadata() {
  return getReferralTemplatePaths().map((templatePath) => {
    const data = JSON.parse(fs.readFileSync(templatePath, "utf8"));
    const referrals = Array.isArray(data.Referrals) ? data.Referrals : [];
    const firstReferral = referrals[0] || {};
    return {
      name: path.basename(templatePath),
      path: templatePath,
      referralCount: referrals.length,
      network: firstReferral.Network || "",
      category: firstReferral.ReferralCategory || "",
    };
  });
}

function buildGeneratedReferralSources(templateOption, fileCount, referralsPerFile) {
  const templatePaths = getReferralTemplatePaths();
  if (templatePaths.length === 0) {
    throw new Error("No bundled referral templates were found.");
  }

  let selectedPaths = templatePaths;
  if (templateOption && templateOption !== ROTATE_ALL_TEMPLATES) {
    selectedPaths = templatePaths.filter((templatePath) => path.basename(templatePath) === templateOption);
    if (selectedPaths.length === 0) {
      throw new Error("The selected referral template was not found.");
    }
  }

  const generatedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs_referral_generator_"));
  for (let fileIndex = 0; fileIndex < fileCount; fileIndex += 1) {
    const templatePath = selectedPaths[fileIndex % selectedPaths.length];
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
  ROTATE_ALL_TEMPLATES,
  buildGeneratedReferralSources,
  getReferralTemplateMetadata,
  getReferralTemplateOptions,
};
