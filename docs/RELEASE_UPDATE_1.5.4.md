Hi team,

**Release Update — CCRS File Processing Framework v1.5.4**

This framework is intended to grow beyond LEIE and referrals, automating more repetitive team work so we can focus on testing and preventing production defects. These are its first two supported workflows.

- Reliable uploads: each file goes to each server exactly once, and a stalled or unreachable server no longer holds up the run.
- Clear results: a new Upload results list shows every server as Passed, Failed, or Skipped with the reason.
- LEIE uploads: a file picked up right away by the server's inbound folder now counts as delivered, and Retry Failed Uploads never sends a second copy.
- Referral Numbers: always exactly 12 characters including the prefix, and unique across the batch. Custom prefixes can be up to 8 characters.
- Simpler names: archive names no longer end in _Final, and the combined JSON file name can be edited.
- Maintenance: Electron and other dependencies were updated to patched releases.

**Download:** Open our team-shared OneDrive folder and download the Version 1.5.4 Windows Setup installer.

**Please use Google Chrome to download the installer. Microsoft Edge may block the download.** Choose the Setup .exe in the shared folder and confirm the version is **1.5.4**.

Please share any issues with the steps and a screenshot. Thank you!
