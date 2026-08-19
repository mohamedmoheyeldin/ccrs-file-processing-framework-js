# LEIE Data Upload and Validation Guide

## Purpose

This document explains how to upload LEIE data, validate the database load, and confirm the results in the CCRS UI.

## Recommended File Name

`LEIE_UPLOAD_VALIDATION_GUIDE.md`

## Prerequisites

Before starting, make sure you have:

- The current LEIE source file in `.xlsx` format.
- Access to WinSCP.
- Access to the `ediuser` account.
- Access to the `/in` directory in each environment.
- Access to the `ccrsdb` database in the target environment.
- Access to the CCRS Table Viewer UI.

## Load Order

Load LEIE data in this order:

1. Lower environments first:
   - `SQA`
   - `DEV`
   - `PPD`
2. Production last:
   - `PROD`

## Environment Reference

| Environment | Database Server | Database |
|---|---|---|
| `SQA` | `VAC10SQLCCN816.va.gov` | `ccrsdb` |
| `PPD` | `VAC10SQLCCN402.va.gov` | `ccrsdb` |
| `New PPD` | `VAC10SQLCCN404.va.gov` | `ccrsdb` |
| `DEV` | `VAC10SQLCCN802.va.gov` | `ccrsdb` |

## CCRS Table Viewer URLs

Use the correct URL for each environment:

- `https://preprod.ccrs.va.gov/tableviewer`
- `https://dev.ccrs.va.gov/tableviewer`
- `https://sqa.ccrs.va.gov/tableviewer`
- `https://ccrs.va.gov/tableviewer`

## Step 1: Prepare the LEIE File

1. Confirm you have the correct LEIE `.xlsx` file.
2. Verify the file is the final version to be loaded.
3. Count the number of records in the `.xlsx` file because you will compare that count to the database load count later.

## Step 2: Upload the File with WinSCP

1. Open WinSCP.
2. Connect using user `ediuser`.
3. Go to the target environment's manual-processing directory: `/in/manual_process/`.
4. Upload the LEIE `.xlsx` file.
5. Confirm the file was transferred successfully.

Repeat this process for each environment in the required load order.

## Step 3: Check the Batch Log to Find the ETL Batch ID

After the file is loaded, connect to the environment's `ccrsdb` database and run:

```sql
select * from CLAIM_BATCH_LOG order by last_updated_date desc;
-- First get the etl_batch_id
```

Find the correct LEIE load entry and copy the `etl_batch_id` value.

Example:

```sql
LEIE0731202606153013
```

## Step 4: Validate the LEIE Load in the Database

Use the `etl_batch_id` from Step 3 and run the following SQL. Replace the example batch ID with the batch ID for the file you loaded.

```sql
Use ccrsdb;

select * from CLAIM_BATCH_LOG order by last_updated_date desc;-- First get the etl_batch_id

Select File_Name, *
from CLAIM_BATCH_LOG
where etl_batch_id = 'LEIE0731202606153013'
order by Start_date_time desc;

select count(*)
from dbo.LKUP_PROVIDER_SANCTION
where etl_batch_id = 'LEIE0731202606153013';

Select count(*)
from dbo.LKUP_PROVIDER_SANCTION
where etl_batch_id <> 'LEIE0731202606153013'
  and is_current = 'Y';

select * from dbo.LKUP_PROVIDER_SANCTION;
```

The queries identify the latest batch, verify the correct file and batch record, count loaded rows, confirm no older batch remains current, and provide a full LEIE data view.

## Step 5: Validate in CCRS UI

1. Open the correct CCRS Table Viewer URL for the environment.
2. Choose the `CLAIM_BATCH_LOG` table.
3. Search for the latest LEIE batch.
4. Confirm the file name, `etl_batch_id`, and timestamps match the database results.
5. Confirm the load status shows the LEIE file was loaded successfully.
6. Verify the LEIE data loaded successfully.

## Validation Checklist

Use this checklist for each environment:

- The correct `.xlsx` file was uploaded.
- The file was uploaded to `/in` using `ediuser`.
- The correct `etl_batch_id` was identified.
- The row count in `LKUP_PROVIDER_SANCTION` matches the source `.xlsx` record count.
- No previous batch remains `is_current = 'Y'`.
- The load is visible in `CLAIM_BATCH_LOG`.
- The load is visible in the CCRS Table Viewer UI.

## Suggested Execution Sequence

Use this sequence when performing the work:

1. Upload and validate in `SQA`.
2. Upload and validate in `DEV`.
3. Upload and validate in `PPD`.
4. Upload and validate in `PROD` after approval.

## Notes

- Always validate lower environments before moving to production.
- Always save the `etl_batch_id` for each environment.
- Always compare the database row count to the source `.xlsx` record count.
- If the counts do not match, stop and investigate before moving to the next environment.
- Notify the team before deploying or loading the file in `PROD`.
