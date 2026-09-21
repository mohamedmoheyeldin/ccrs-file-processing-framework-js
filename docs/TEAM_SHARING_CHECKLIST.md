# Team sharing checklist

## What to include in OneDrive

Use a versioned folder such as `CCRS File Processing Framework/1.5.3` containing:

- The Version 1.5.3 Windows Setup `.exe` (approximately 109 MB as displayed by Windows).
- `STAKEHOLDER_OVERVIEW.pdf`: an introduction for project managers, Scrum Masters, and team members.
- `USER_GUIDE.pdf`: installation and day-to-day instructions.
- `LEIE_UPLOAD_VALIDATION_GUIDE.pdf`: checks after LEIE uploads.
- `RELEASE_UPDATE.md`: the short announcement to copy into Teams.
- `RELEASE_NOTES.md`: detailed version history.
- `PROJECT_VISION.md`: the broader automation mission and future-work intake process.
- This checklist and `SHA256SUMS.txt` for file integrity checks.

Editable Markdown copies of the three PDF guides can also be included for document maintainers. Source code, developer tools, build caches, personal settings, credentials, and generated referral data are not needed in the team distribution folder.

## Before sending the folder link

1. Upload the complete package to the team's approved OneDrive location.
2. Grant access to intended team members and confirm a recipient can open the folder and download its files.
3. Copy the actual OneDrive sharing link into your Teams message next to the download instructions. No personal repository link is needed.
4. Confirm the installer and release message show the same version. Keep older versions in separate folders.
5. Use Google Chrome if Microsoft Edge blocks the installer; follow organizational software approval procedures.
6. Identify the team contact for installation help, environment access, and issue reporting. Environment access is separate from OneDrive access.

## Maintaining future packages

Refresh the PDFs, release announcement, release notes, and checksums for each new package. Distinguish available functions from future automation ideas. The shared package is for using and understanding the application; technical maintainers can keep developer documentation separately.
