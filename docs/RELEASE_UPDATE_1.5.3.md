# Release Update — Version 1.5.3

> **Draft — not yet ready to announce availability.** As of September 21, 2026, GitHub's latest published release is 1.4.2. Publish and verify the 1.5.3 installer before sharing the message below. The latest-release link will then direct the team to the new release.

## Microsoft Teams message

Hi team,

**Release Update — CCRS File Processing Framework v1.5.3**

This update includes the following fixes and improvements:

- **Correct dropdown values:** Stations, Payment Authority Codes, Networks, and SEOC values stay within the available or selected options. Payment codes use the team's 43 unique values and no longer increment automatically.
- **Simpler choices:** Referral Number offers VA or Custom. ICN offers Default, Custom, or Referral Number. Payment codes have a searchable, numbers-only dropdown.
- **Flexible output:** Keep individual JSON files, one combined master JSON, or just the .gz file. Repeated runs replace matching filenames without duplicate-name errors.
- **Current dates:** New referrals use current dates, with expiration based on Referral Period. Custom dates remain available.
- **Improved uploads:** Referral and LEIE uploads use a shared process that handles servers one at a time, avoids duplicate destinations, and continues if a server fails.
- **Easier to use:** Smaller date controls, scrollable dialogs at higher zoom, and automatic output checks. Manifest files are optional—click **Generate Manifest** after the job if needed.

**Download:** [Latest release and Windows installer](https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/latest)

**Please use Google Chrome to download the installer. Microsoft Edge may block the download.** Choose the Setup `.exe` under **Assets** and confirm the version is **1.5.3**.

Please share any issues you encounter, along with the steps and a screenshot. Thank you!