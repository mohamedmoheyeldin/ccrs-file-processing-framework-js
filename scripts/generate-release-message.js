const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config/app_version.json"), "utf8"));
const highlights = config.teamHighlights || config.releaseNotes;
const text = `Hi team,

**Release Update — CCRS File Processing Framework v${config.version}**

${highlights.map((line) => `- ${line}`).join("\n")}

**Download:** [Version ${config.version} — Windows Setup installer](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/${config.releaseTag})

**Please use Google Chrome to download the installer. Microsoft Edge may block the download.** Choose the Setup .exe under Assets and confirm the version is **${config.version}**.

Please share any issues with the steps and a screenshot. Thank you!
`;
fs.writeFileSync(path.join(root, "docs/RELEASE_UPDATE.md"), text);
