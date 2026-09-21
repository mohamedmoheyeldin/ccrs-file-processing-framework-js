# CCRS File Processing Framework

## Stakeholder overview

Version 1.5.3 | September 21, 2026

For project managers, Scrum Masters, QA teams, and new team members.

## What the project solves

The CCRS File Processing Framework is a Windows desktop application that helps the team prepare referral test data, process LEIE data, and deliver files to configured CCRS environments. It brings repetitive file preparation, customization, validation, and upload steps into one guided workflow.

Instead of manually editing files and repeating transfers, team members select the required data and destinations, review the settings, and let the application process the batch. This supports faster test preparation and more repeatable execution across team members.

## Two workflows with immediate team value

| Workflow | What the application does | Team value |
| --- | --- | --- |
| LEIE data preparation and upload | Reads the source workbook, checks duplicates, produces the processed output, and uploads to selected environments. | Reduces repeated workbook preparation and manual transfers. |
| Referral file generation and editing | Creates one referral or thousands, applies supported custom values, validates output, and packages files for upload. | Helps testers prepare scenario-specific data without editing each referral manually. |

## A practical time-saving example

The project owner reports processing and uploading LEIE data to SQA, DEV, PPD, and PROD in less than 30 seconds in their workflow, replacing manual preparation and transfers. This is a reported operational example, not a guaranteed service level or independently measured benchmark. Duration depends on file size, network speed, server response, and configured access.

<!-- pagebreak -->

## How the application supports delivery

### LEIE data workflow

- Select the source workbook and review detected duplicates before processing.
- Generate the processed workbook and upload it to one or more configured destinations: SQA, DEV, PPD, and PROD.
- Process destinations sequentially, avoid duplicate destinations in the queue, and continue to the next server if one fails.
- Review transfer results and use the LEIE validation guide for database and CCRS Table Viewer checks. A successful transfer alone does not confirm downstream loading.

### Referral data workflow

- Generate a single referral or batches containing thousands, or update existing referral JSON files.
- Customize supported fields such as referral numbers, ICNs, patient test identifiers, dates, stations, payment codes, networks, and regular or optional Situational SEOC pairs.
- Use one selected value, mix a selected subset, or use the available catalog where supported. Selection rules keep generated values within the chosen options.
- Retain individual formatted JSON, a combined master JSON, or only the gzip package. Matching output filenames can be replaced after validation.
- Upload directly to the selected referral environments: SQA, DEV, and PPD. Referral uploads to PROD are not enabled.

### Controls that improve consistency

The application validates file structure and supported values before final output. New referrals default to current dates, with expiration based on Referral Period; custom dates remain available. An optional Generate Manifest action provides batch counts, file hashes, and recorded upload outcomes after completion.

Review dialogs, progress messages, failure isolation, and retry of failed destinations make the workflow easier to follow. Authorized accounts, correct destination settings, and team production procedures remain necessary.

<!-- pagebreak -->

## Value for project managers and Scrum Masters

- Reduce repetitive preparation work so the team can spend more time executing and reviewing test scenarios.
- Support sprint testing with repeatable data generation and consistent environment delivery.
- Make handovers easier through shared workflows, documented settings, and visible results.
- Assess outcomes using preparation time, manual steps avoided, upload success, and time needed for a new team member to complete a first run. These are suggested measures, not claimed results.

## Designed for practical team adoption

The application uses a modern JavaScript desktop stack, including Electron, Node.js, and automated Playwright UI checks. Version 1.5.3 passed automated code and workflow tests, a production dependency audit, and Windows installer and installed-application launch checks in GitHub Actions.

The published installer is 114,312,755 bytes: approximately 109 MiB, often displayed as about 109 MB by Windows. This gives the team one installer to share and use for installation or upgrade. Installer size is not the installed disk footprint or a measure of runtime memory. CPU, memory, and large-batch performance on team Government Furnished Equipment (GFE) should be measured with representative workloads. The design goal is a responsive, practical tool for daily team use.

<!-- pagebreak -->

## Documentation for new and experienced team members

The documentation is maintained alongside the application so team members can understand the supported CCRS workflows, learn the tool, and revisit validation steps. It explains the functions covered by this framework; it is not a complete specification of all CCRS business rules or services.

| Document | When to use it |
| --- | --- |
| STAKEHOLDER_OVERVIEW.pdf | Share the project's purpose, benefits, scope, and adoption considerations with delivery stakeholders. |
| USER_GUIDE.pdf | Learn installation, referral customization, LEIE processing, output choices, and upload workflows. |
| LEIE_UPLOAD_VALIDATION_GUIDE.pdf | Follow post-upload validation using database queries and CCRS Table Viewer. |
| RELEASE_UPDATE.md | Copy the current short release announcement into the team chat. |
| RELEASE_NOTES.md | Review changes by release. |
| ARCHITECTURE.md, DEVELOPMENT.md, TESTING.md | Support technical ownership, maintenance, and verification. |

## Getting started and keeping information current

1. Download Version 1.5.3 from the release page below. Use Google Chrome; Microsoft Edge may block the installer download. Follow organizational software policies.
2. Read USER_GUIDE.pdf, confirm authorized environment access, and start with a small representative batch.
3. Review the resulting files and transfer status, then complete the relevant downstream validation.
4. Report issues with the application version, reproduction steps, and suitable screenshots. Avoid including sensitive data or credentials.

Release: https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/releases/tag/v1.5.3

Documentation: https://github.com/mohamedmoheyeldin/ccrs-file-processing-framework-js/tree/main/docs


