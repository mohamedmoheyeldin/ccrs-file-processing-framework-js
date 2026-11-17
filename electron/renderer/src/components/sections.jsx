import { AlertTriangle, BookOpen01, CheckCircle, Copy01, FolderSearch, LinkExternal01, Minus, Plus, RefreshCw01, UploadCloud01, Wifi } from "@untitledui/icons";
import { Table } from "@/components/application/table/table";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { InputBase, TextField } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Select as BaseSelect } from "@/components/base/select/select";
import { cx } from "@/utils/cx";
import {
  ARCHIVE_CUSTOM_VALUES,
  DATE_PARTS,
  LEIE_DATABASE_ENVIRONMENTS,
  NETWORK_VALUES,
  SEOC_RESULT_LIMIT,
  STATION_RESULT_LIMIT,
  formatUploadProfileSummary,
  getIcnConstants,
  getIcnPlaceholder,
  getReferralPrefixLabel,
  plural,
  seocVisibleName,
} from "../lib/logic";
import { SearchMultiSelect } from "./SearchMultiSelect";
import {
  Button,
  CheckCard,
  Checkbox,
  ChoiceCards,
  FieldGroup,
  FieldLabel,
  HelpDisclosure,
  Hint,
  Panel,
  Preview,
  Section,
  Select,
  TextInput,
  Toggle,
  useBusy,
} from "./primitives";

const { buildLeieValidationSql, highlightSql } = window.ccrsLeieSql;

const TABLE_VIEWER_LINKS = [
  "https://sqa.ccrs.va.gov/tableviewer",
  "https://dev.ccrs.va.gov/tableviewer",
  "https://preprod.ccrs.va.gov/tableviewer",
  "https://ccrs.va.gov/tableviewer",
];

// -------------------------------------------------------------------------------------------------
// Source
// -------------------------------------------------------------------------------------------------

/** Shown first on the LEIE module so the guide is the first thing people see. */
export function LeieGuideBanner({ app }) {
  const { actions } = app;
  return (
    <div id="leie-guide-banner" className="flex flex-col gap-3 rounded-xl bg-brand-primary_alt p-4 ring-1 ring-brand_alt ring-inset sm:flex-row sm:items-center sm:justify-between md:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <BookOpen01 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-brand-primary" />
        <div className="min-w-0">
          <p className="text-md font-semibold text-brand-secondary">LEIE Data Upload and Validation Guide</p>
          <p className="text-sm text-brand-tertiary">Start here. The PDF covers the load order, upload steps, database validation, and the CCRS UI check.</p>
        </div>
      </div>
      <Button id="open-leie-validation-guide" color="primary" size="md" iconLeading={BookOpen01} onClick={actions.openLeieGuide}>
        Open PDF Guide
      </Button>
    </div>
  );
}

export function SourceSection({ app }) {
  const { form, flags, sourceSummary, actions } = app;
  return (
    <Section
      id="source-card"
      titleId="source-title"
      subtitleId="source-subtitle"
      title="Source"
      subtitle={flags.isLeie
        ? "Pick an incoming LEIE Excel file or a folder containing LEIE Excel files."
        : "Pick the folder that contains the incoming JSON files."}
    >
      <div id="source-folder-field" className="flex flex-col gap-1.5">
        <div className="flex items-end gap-3">
          <TextInput
            id="input-dir"
            label="Source Folder"
            describedBy="source-folder-help"
            className="flex-1"
            value={form.inputDir}
            onChange={(value) => actions.setField("inputDir", value)}
            onBlur={actions.commitInputDir}
            onKeyDown={(event) => {
              if (event.key === "Enter") actions.commitInputDir();
            }}
            placeholder={flags.isLeie
              ? "Choose a LEIE Excel file (.xlsx, .xls, .xlsm, .xlsb) or a source folder"
              : "Choose the folder that contains source JSON files"}
          />
          <Button color="secondary" size="md" iconLeading={FolderSearch} data-pick="input-dir" onClick={() => actions.pickPath("inputDir")}>
            Browse
          </Button>
        </div>
        <Hint id="source-folder-help">
          The app reads supported files from this folder but never changes the originals. New files are written to the Output folder.
        </Hint>
      </div>
      <div className="flex flex-wrap gap-2">
        <span id="source-file-count"><Badge type="color" color="gray" size="md">{sourceSummary.fileCountText}</Badge></span>
        <span id="list-date-source-value" className="min-w-0"><Badge type="color" color="gray" size="md" className="break-all whitespace-normal">{sourceSummary.detailText}</Badge></span>
      </div>
    </Section>
  );
}

// -------------------------------------------------------------------------------------------------
// LEIE duplicate detection
// -------------------------------------------------------------------------------------------------

export function LeieDuplicateSection({ app }) {
  const { form, leie, actions } = app;
  const inspection = leie.inspection;
  const duplicates = inspection?.duplicates || [];
  const validationErrors = inspection?.validationErrors || [];
  const hasDuplicates = Boolean(inspection?.hasDuplicates);

  let tone = "gray";
  let result = "No LEIE source folder selected.";
  let summary = "Pick a source file and click Rescan to run duplicate detection.";
  if (leie.scanning) {
    tone = "brand";
    result = "Scanning duplicate rows...";
    summary = "Running full-row duplicate scan...";
  } else if (leie.error) {
    tone = "error";
    result = "LEIE scan failed";
    summary = leie.error;
  } else if (inspection?.fileCount && validationErrors.length > 0) {
    tone = "error";
    result = `${validationErrors.length} file validation ${plural(validationErrors.length, "issue")} found`;
    summary = "Please fix the file issues and run Rescan.";
  } else if (inspection?.fileCount && hasDuplicates) {
    tone = "error";
    result = `${duplicates.length} duplicate ${plural(duplicates.length, "row")} found`;
    summary = "Exact full-row duplicates were detected. Review rows in the table below.";
  } else if (inspection?.fileCount) {
    tone = "success";
    result = "No duplicate rows found";
    summary = "Scan complete. Every row is unique across all columns.";
  }
  const hintTone = tone === "error" ? "error" : tone === "success" ? "success" : tone === "brand" ? "working" : "neutral";

  return (
    <Section
      id="leie-duplicate-card"
      title="Duplicate Detection"
      subtitle="Duplicate results from the selected LEIE source folder will appear below."
      actions={<Button id="leie-rescan" color="secondary" size="sm" iconLeading={RefreshCw01} onClick={actions.rescanLeie}>Rescan</Button>}
    >
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Current Result</FieldLabel>
        <div>
          <span id="leie-duplicate-result" data-tone={tone}>
            <BadgeWithDot type="modern" color={tone} size="lg">{result}</BadgeWithDot>
          </span>
        </div>
        <Hint id="leie-duplicate-summary" tone={hintTone}>{summary}</Hint>
      </div>

      {hasDuplicates && (
        <Panel id="leie-duplicate-actions" title="Resolve Duplicates">
          <ChoiceCards
            label="Duplicate resolution"
            name="leie-duplicate-action"
            value={form.leieDuplicateHandling}
            onChange={(value) => actions.setField("leieDuplicateHandling", value)}
            options={[
              { value: "auto-remove", id: "leie-action-auto", title: "Remove automatically", description: "Keep the first matching row and remove later matches." },
              { value: "manual", id: "leie-action-manual", title: "Review manually", description: "Pause processing so the source data can be corrected and rescanned." },
            ]}
          />
          <Hint id="leie-action-help">
            Progress is blocked until duplicates are removed automatically or fixed manually and rescanned.
          </Hint>
          <div>
            <Button id="leie-cancel-process" color="secondary-destructive" size="sm" onClick={actions.cancelLeieProcess}>
              Cancel Process
            </Button>
          </div>
        </Panel>
      )}

      {duplicates.length > 0 && (
        <div id="leie-duplicate-table-wrap" className="max-h-96 overflow-auto rounded-xl ring-1 ring-secondary ring-inset">
          <Table aria-label="Duplicate rows" size="sm">
            <Table.Header>
              <Table.Head id="file" label="File Name" isRowHeader />
              <Table.Head id="row" label="Row" />
              <Table.Head id="value" label="Duplicate Value" />
              <Table.Head id="column" label="Column" />
            </Table.Header>
            <Table.Body items={duplicates.map((duplicate, index) => ({ ...duplicate, id: index }))}>
              {(duplicate) => (
                <Table.Row id={duplicate.id}>
                  <Table.Cell className="font-medium text-primary">{duplicate.fileName}</Table.Cell>
                  <Table.Cell>{duplicate.rowNumber}</Table.Cell>
                  <Table.Cell>{duplicate.duplicateValue || "(blank)"}</Table.Cell>
                  <Table.Cell>{duplicate.columnName}</Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        </div>
      )}
    </Section>
  );
}

// -------------------------------------------------------------------------------------------------
// Generator setup
// -------------------------------------------------------------------------------------------------

function StatCard({ id, label, value, copy, accent }) {
  return (
    <div className={cx("rounded-xl p-4 ring-1 ring-inset", accent ? "bg-brand-primary_alt ring-brand_alt" : "bg-primary ring-secondary")}>
      <p className="text-sm font-medium text-tertiary">{label}</p>
      <p id={id} className={cx("mt-1 text-display-sm font-semibold", accent ? "text-brand-secondary" : "text-primary")}>{value}</p>
      <p className="mt-1 text-sm text-tertiary">{copy}</p>
    </div>
  );
}

export function GeneratorSection({ app }) {
  const { form, info, fieldErrors, generatedSize, actions } = app;
  const fileCount = Math.max(Number(form.fileCount || 1), 1);
  const referralsPerFile = Math.max(Number(form.referralsPerFile || 1), 1);
  const limits = info?.constants?.processingLimits || {};
  return (
    <Section
      id="generator-card"
      title="Generator Setup"
      subtitle="Pick a template, choose the output shape, then fine tune the exact counts below."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard id="generator-file-count-display" label="JSON files" value={fileCount} copy="How many JSON files will be created in this run." />
        <StatCard id="generator-referrals-per-file-display" label="Per file" value={referralsPerFile} copy="How many referrals each generated JSON file will contain." />
        <StatCard id="generator-total-referrals-display" label="Total referrals" value={fileCount * referralsPerFile} copy="Total referrals created across all generated JSON files." accent />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          id="file-count"
          type="number"
          label="Number of JSON files to generate"
          inputMode="numeric"
          value={form.fileCount}
          onChange={(value) => actions.setField("fileCount", value)}
          error={fieldErrors.fileCount}
          hint={limits.maxGeneratedFiles
            ? `Maximum ${Number(limits.maxGeneratedFiles).toLocaleString()} files per run.`
            : "Set this to 1 for a single JSON file, or higher for multiple files."}
        />
        <TextInput
          id="referrals-per-file"
          type="number"
          label="Number of referrals per file"
          inputMode="numeric"
          value={form.referralsPerFile}
          onChange={(value) => actions.setField("referralsPerFile", value)}
          error={fieldErrors.referralsPerFile}
          hint={limits.maxReferralsPerFile
            ? `Maximum ${Number(limits.maxReferralsPerFile).toLocaleString()} referrals per file.`
            : "Set this to 1 for one referral in each file, or higher for multiple referrals."}
        />
      </div>
      {generatedSize && (
        <div
          id="generated-size-estimate"
          role={generatedSize.overLimit ? "alert" : undefined}
          data-over-limit={generatedSize.overLimit || undefined}
          className={cx(
            "flex items-start gap-3 rounded-xl p-4 ring-1 ring-inset",
            generatedSize.overLimit ? "bg-warning-primary ring-secondary" : "bg-secondary ring-secondary"
          )}
        >
          <AlertTriangle
            aria-hidden="true"
            className={cx("mt-0.5 size-5 shrink-0", generatedSize.overLimit ? "text-fg-warning-primary" : "hidden")}
          />
          <div className="min-w-0">
            <p className={cx("text-sm font-semibold", generatedSize.overLimit ? "text-warning-primary" : "text-secondary")}>
              {generatedSize.overLimit
                ? `Too large: this run would create about ${generatedSize.label} of JSON. The limit is ${generatedSize.limitLabel}.`
                : `Estimated size: about ${generatedSize.label} of JSON (limit ${generatedSize.limitLabel}).`}
            </p>
            {generatedSize.overLimit && (
              <p className="mt-0.5 text-sm text-tertiary">
                Lower the number of JSON files or the referrals per file, or split the work into several runs. Generate Files stays blocked until the estimate is under the limit.
              </p>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

// -------------------------------------------------------------------------------------------------
// Referral details
// -------------------------------------------------------------------------------------------------

function ListDateField({ app }) {
  const busy = useBusy();
  const { listDate, actions } = app;
  return (
    <FieldGroup>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <FieldLabel>List Date</FieldLabel>
        <span className="text-sm text-tertiary">Current date and time stays live until you edit any segment below.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {DATE_PARTS.map((part) => (
          <div key={part.key} data-date-part={part.key} className="flex flex-col gap-1.5">
            <Label htmlFor={`list-date-${part.key}`}>{part.label}</Label>
            <div className="flex items-center gap-1 rounded-lg bg-primary p-1 shadow-xs ring-1 ring-primary ring-inset focus-within:ring-2 focus-within:ring-brand">
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={Minus}
                tooltip={`Decrease ${part.key}`}
                aria-label={`Decrease ${part.key}`}
                isDisabled={busy}
                onClick={() => actions.stepDatePart(part.key, -1)}
              />
              <TextField
                aria-label={part.label}
                id={`list-date-${part.key}`}
                value={listDate[part.key]}
                maxLength={part.width}
                inputMode="numeric"
                isDisabled={busy}
                onChange={(value) => actions.editDatePart(part.key, value)}
                onBlur={() => actions.blurDatePart(part.key)}
                className="min-w-0 flex-1"
              >
                <InputBase
                  size="sm"
                  wrapperClassName="bg-transparent shadow-none ring-0!"
                  inputClassName="px-0 text-center font-medium tabular-nums"
                />
              </TextField>
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={Plus}
                tooltip={`Increase ${part.key}`}
                aria-label={`Increase ${part.key}`}
                isDisabled={busy}
                onClick={() => actions.stepDatePart(part.key, 1)}
              />
            </div>
          </div>
        ))}
      </div>
    </FieldGroup>
  );
}

function stationMatch(app) {
  const { form, catalogs, stationQuery } = app;
  if (form.randomizeStationId) {
    return { tone: "success", text: `Random selection will use the ${catalogs.stationSelectableCount.toLocaleString()} rows that have a station_id.` };
  }
  if (form.selectedStationIds.length > 0) {
    const count = form.selectedStationIds.length;
    return { tone: "success", text: `${count.toLocaleString()} ${plural(count, "station")} selected. Referrals will be assigned randomly from this selected set.` };
  }
  const query = stationQuery.trim();
  if (!query) {
    return { tone: "neutral", text: `Loaded all ${catalogs.stationCount.toLocaleString()} station rows. Selection is optional; search any of the five displayed fields.` };
  }
  const match = catalogs.stationById.get(query.toUpperCase());
  if (match) {
    return { tone: "success", text: `Selected: station_key ${match.station_key} | station_id ${match.station_id} | VISN ${match.visn_id || "—"} | ${match.station_name || "Unnamed station"} | parent ${match.parent_station_id || "—"}` };
  }
  return { tone: "error", text: "Search results are shown above. Choose a station to apply its station_id, or clear this optional field." };
}

function seocMatchText(label, form, selectedKey, useAllKey, total, kind) {
  if (form[useAllKey]) return `All ${total.toLocaleString()} available ${label} values will be used.`;
  const count = form[selectedKey].length;
  if (count > 0) return `${count.toLocaleString()} ${label} ${plural(count, "value")} selected.`;
  if (kind === "payment") return "Automatic mode mixes only team-approved payment codes.";
  if (kind === "situational") return "Manual only: no Situational SEOC is added unless you select one here.";
  return "Automatic mode mixes approved SEOC Number and ID pairs from the reference list.";
}

function networkMatchText(form) {
  if (form.useAllNetworks) return "All five Network values will be mixed across the referrals.";
  if (form.selectedNetworks.length === 1) return `${form.selectedNetworks[0]} will be used for every referral.`;
  if (form.selectedNetworks.length > 1) return `Each referral will receive a value mixed from the ${form.selectedNetworks.length} selected Networks.`;
  return "Automatic mode keeps each referral's source Network.";
}

function AdditionalFields({ app }) {
  const { form, info, catalogs, fieldErrors, previews, flags, actions } = app;
  const icnConstants = getIcnConstants(info);
  const match = stationMatch(app);

  const stationIndex = catalogs.stationIndex.map((entry, position) => ({
    key: entry.option.station_id || `row-${position}`,
    searchText: entry.searchText,
    title: entry.option.station_name || "Unnamed station",
    isDisabled: !entry.option.station_id,
    tooltip: entry.option.station_id
      ? `${entry.option.station_id} - ${entry.option.station_name || "Unnamed station"}`
      : "This source row has no station_id and cannot be selected.",
    details: [
      ["station_key", entry.option.station_key],
      ["station_id", entry.option.station_id],
      ["visn_id", entry.option.visn_id],
      ["station_name", entry.option.station_name],
      ["parent_station_id", entry.option.parent_station_id],
    ],
  }));
  const seocIndex = (catalog, withNumber = true) => catalog.index.map((entry) => ({
    key: entry.option.selectorKey,
    searchText: entry.searchText,
    title: seocVisibleName(entry.option),
    copy: withNumber ? `SEOC Number: ${entry.option.seocNumber}` : undefined,
  }));
  const networkIndex = NETWORK_VALUES.map((value) => ({
    key: value,
    searchText: value.toLowerCase(),
    title: value,
    copy: form.selectedNetworks.includes(value) ? "Selected — choose again to remove" : "Choose this Network",
  }));
  const hasSituationalChoice = form.selectedSituationalSeocKeys.length > 0 || form.useAllSituationalSeocs;
  const dateHint = (key, fallback) => fieldErrors[key] ? undefined : fallback;

  return (
    <div id="optional-fields" className="grid gap-x-5 gap-y-6 border-t border-secondary pt-6 md:grid-cols-2">
      <FieldGroup label="ICN" className="md:col-span-2">
        <ChoiceCards
          label="ICN naming mode"
          name="icn-mode"
          columns={3}
          value={form.icnMode}
          onChange={(value) => actions.setField("icnMode", value)}
          options={[
            { value: "test-dynamic", id: "icn-mode-test-dynamic", title: "Default", description: "Keep TEST and generate the rest." },
            { value: "custom-full", id: "icn-mode-custom-full", title: "Custom", description: "Enter a custom full ICN base." },
            { value: "referral-match", id: "icn-mode-referral-match", title: "Referral Number", description: "Build each ICN from its Referral Number." },
          ]}
        />
        <Hint>Choose how generated ICNs are named. Custom values accept both lowercase and uppercase letters.</Hint>
      </FieldGroup>

      <div className="flex flex-col gap-1.5">
        <TextInput
          id="icn-custom-value"
          label="ICN Custom Value"
          value={form.icnCustomValue}
          onChange={(value) => actions.setField("icnCustomValue", value)}
          isDisabled={form.icnMode === "test-dynamic" || form.icnMode === "referral-match"}
          placeholder={getIcnPlaceholder(form.icnMode, icnConstants)}
        />
        <Preview id="icn-preview" error={fieldErrors.icnValue}>{previews.icn}</Preview>
      </div>

      <Select
        id="match-suffix-length"
        label="Referral / ICN Match"
        hint="The selected ending of each Referral Number is copied to its ICN."
        value={form.matchSuffixLength}
        onChange={(key) => key && actions.setField("matchSuffixLength", String(key))}
        items={[
          { id: "3", label: "Match last 3 characters" },
          { id: "4", label: "Match last 4 characters" },
          { id: "5", label: "Match last 5 characters" },
        ]}
      >
        {(item) => <BaseSelect.Item id={item.id} label={item.label} />}
      </Select>

      <SearchMultiSelect
        id="station-id-combobox"
        inputId="override-station-id"
        menuId="station-id-menu"
        selectedId="selected-stations"
        matchId="station-id-match"
        label="Stations"
        listLabel="Stations"
        ariaLabel="Search stations"
        placeholder="Search station key, ID, VISN, name, or parent ID"
        index={stationIndex}
        limit={STATION_RESULT_LIMIT}
        selectedKeys={form.selectedStationIds}
        onChange={(keys) => actions.setField("selectedStationIds", keys)}
        onQueryChange={actions.setStationQuery}
        chipLabel={(stationId) => `${stationId} — ${catalogs.stationById.get(stationId)?.station_name || "Selected station"}`}
        emptyText="No matching station found. Search by station key, ID, VISN, name, or parent station ID."
        summaryText={(limit, total, hasQuery) => hasQuery
          ? `Showing the first ${limit} of ${total.toLocaleString()} matches. Keep typing to narrow the list.`
          : `Showing ${limit} of ${total.toLocaleString()} stations. Type to search the complete catalog.`}
        matchText={match.text}
        matchTone={match.tone}
        useAll={{
          id: "randomize-station-id",
          isSelected: form.randomizeStationId,
          onChange: (value) => actions.setField("randomizeStationId", value),
          label: "Use all available station IDs instead of a selected subset",
        }}
        preview={{ id: "station-id-preview", text: previews.station }}
        error={fieldErrors.StationID}
      />

      <SearchMultiSelect
        id="payment-code-combobox"
        inputId="override-payment-authority-code"
        menuId="payment-code-menu"
        selectedId="selected-payment-codes"
        matchId="payment-code-match"
        label="Payment Authority Code"
        listLabel="Payment Authority Codes"
        ariaLabel="Search Payment Authority Code"
        placeholder="Search Payment Authority Code"
        index={seocIndex(catalogs.payment, false)}
        limit={SEOC_RESULT_LIMIT}
        selectedKeys={form.selectedPaymentCodes}
        onChange={(keys) => actions.setField("selectedPaymentCodes", keys)}
        chipLabel={(key) => key}
        emptyText="No matching Payment Authority Code values."
        matchText={seocMatchText("Payment Authority Code", form, "selectedPaymentCodes", "useAllPaymentCodes", catalogs.payment.byKey.size, "payment")}
        useAll={{
          id: "use-all-payment-codes",
          isSelected: form.useAllPaymentCodes,
          onChange: (value) => actions.setField("useAllPaymentCodes", value),
          label: "Use all available Payment Authority Codes instead of a selected subset",
        }}
        preview={{ id: "payment-authority-code-preview", text: previews.payment }}
        error={fieldErrors.PaymentAuthorityCode}
      />

      <TextInput
        id="override-referral-period"
        label="Referral Period"
        value={form.overrideReferralPeriod}
        onChange={(value) => actions.setField("overrideReferralPeriod", value)}
      />

      <SearchMultiSelect
        id="network-combobox"
        inputId="network-search"
        menuId="network-menu"
        selectedId="selected-networks"
        matchId="network-match"
        label="Network"
        listLabel="Network values"
        ariaLabel="Search Network values"
        placeholder="Search or choose Network values"
        index={networkIndex}
        selectedKeys={form.selectedNetworks}
        onChange={(keys) => actions.setField("selectedNetworks", keys)}
        chipLabel={(key) => key}
        emptyText="No matching Network values."
        matchText={networkMatchText(form)}
        useAll={{
          id: "use-all-networks",
          isSelected: form.useAllNetworks,
          onChange: (value) => actions.setField("useAllNetworks", value),
          label: "Use all available Network values",
        }}
      />

      <SearchMultiSelect
        id="seoc-combobox"
        inputId="seoc-search"
        menuId="seoc-menu"
        selectedId="selected-seocs"
        matchId="seoc-match"
        label="SEOC Number - SEOC ID"
        labelTitle="Controls the paired SEOC Number and SEOC ID values used for referral generation."
        listLabel="SEOC"
        ariaLabel="Search SEOC Number and SEOC ID"
        placeholder="Search SEOC Number or SEOC ID"
        index={seocIndex(catalogs.seoc)}
        limit={SEOC_RESULT_LIMIT}
        selectedKeys={form.selectedSeocKeys}
        onChange={(keys) => actions.setField("selectedSeocKeys", keys)}
        chipLabel={(key) => seocVisibleName(catalogs.seoc.byKey.get(key))}
        emptyText="No matching SEOC values."
        matchText={seocMatchText("SEOC", form, "selectedSeocKeys", "useAllSeocs", catalogs.seoc.byKey.size, "seoc")}
        useAll={{
          id: "use-all-seocs",
          isSelected: form.useAllSeocs,
          onChange: (value) => actions.setField("useAllSeocs", value),
          label: "Use all available SEOC values instead of a selected subset",
        }}
      />

      <SearchMultiSelect
        id="situational-seoc-combobox"
        inputId="situational-seoc-search"
        menuId="situational-seoc-menu"
        selectedId="selected-situational-seocs"
        matchId="situational-seoc-match"
        label={<><span data-situational-label className="text-warning-primary">Situational</span> SEOC Number - SEOC ID</>}
        labelTitle="Controls the paired Situational SEOC Number and SEOC ID values used for referral generation."
        listLabel="Situational SEOC"
        ariaLabel="Search Situational SEOC Number and SEOC ID"
        placeholder="Search Situational SEOC Number or SEOC ID"
        index={seocIndex(catalogs.situationalSeoc)}
        limit={SEOC_RESULT_LIMIT}
        selectedKeys={form.selectedSituationalSeocKeys}
        onChange={(keys) => actions.setField("selectedSituationalSeocKeys", keys)}
        chipLabel={(key) => seocVisibleName(catalogs.situationalSeoc.byKey.get(key))}
        emptyText="No matching Situational SEOC values."
        matchText={seocMatchText("Situational SEOC", form, "selectedSituationalSeocKeys", "useAllSituationalSeocs", catalogs.situationalSeoc.byKey.size, "situational")}
        useAll={{
          id: "use-all-situational-seocs",
          isSelected: form.useAllSituationalSeocs,
          onChange: (value) => actions.setField("useAllSituationalSeocs", value),
          label: "Use all available Situational SEOC values instead of a selected subset",
        }}
      />

      {hasSituationalChoice && (
        <div id="seoc-override-warning" role="status" aria-live="polite" className="rounded-xl bg-warning-primary p-4 ring-1 ring-warning_subtle ring-inset md:col-span-2">
          <p className="text-sm font-semibold text-warning-primary">Confirm this manual SEOC choice</p>
          <p className="mt-0.5 text-sm text-warning-primary">
            Most referrals use regular SEOC only. Confirm the required SEOC ID and Number before running, and choose Situational SEOC only when specifically instructed.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <TextInput
          id="override-dob"
          label="DOB"
          placeholder="YYYY-MM-DD"
          value={form.overrideDob}
          onChange={(value) => actions.setField("overrideDob", value)}
          isDisabled={form.randomizeDob}
          error={fieldErrors.DOB}
          hint="Uncheck random generation to use an optional fixed date in YYYY-MM-DD format."
        />
        <Checkbox id="randomize-dob" isSelected={form.randomizeDob} onChange={(value) => actions.setField("randomizeDob", value)} label="Generate a random DOB for every patient" />
      </div>

      <TextInput
        id="override-referral-category"
        label="Referral Category"
        value={form.overrideReferralCategory}
        onChange={(value) => actions.setField("overrideReferralCategory", value)}
      />

      {flags.isGenerate && (
        <div id="current-referral-dates-control" className="md:col-span-2">
          <Checkbox
            id="use-current-referral-dates"
            isSelected={form.useCurrentReferralDates}
            onChange={(value) => actions.setField("useCurrentReferralDates", value)}
            label="Use current dates"
            hint="Expiration follows Referral Period. Edit any date to customize."
          />
        </div>
      )}

      <TextInput
        id="override-referral-date"
        label="Referral Date"
        placeholder="YYYY-MM-DD"
        value={form.overrideReferralDate}
        onChange={(value) => actions.setField("overrideReferralDate", value)}
        error={fieldErrors.ReferralDate}
        hint={dateHint("ReferralDate", "Use the format YYYY-MM-DD.")}
      />
      <TextInput
        id="override-referral-date-time"
        label="Referral DateTime"
        placeholder="YYYY-MM-DD HH:mm:ss"
        value={form.overrideReferralDateTime}
        onChange={(value) => actions.setField("overrideReferralDateTime", value)}
        error={fieldErrors.ReferralDateTime}
        hint={dateHint("ReferralDateTime", "Use the format YYYY-MM-DD HH:mm:ss.")}
      />
      <TextInput
        id="override-referral-expiration-date"
        label="Referral Expiration Date"
        placeholder="YYYY-MM-DD"
        value={form.overrideReferralExpirationDate}
        onChange={(value) => actions.setField("overrideReferralExpirationDate", value)}
        error={fieldErrors.ReferralExpirationDate}
        hint={dateHint("ReferralExpirationDate", "Use the format YYYY-MM-DD.")}
      />
      <TextInput
        id="override-referral-last-update-date"
        label="Referral Last Update Date"
        placeholder="YYYY-MM-DD"
        value={form.overrideReferralLastUpdateDate}
        onChange={(value) => actions.setField("overrideReferralLastUpdateDate", value)}
        error={fieldErrors.ReferralLastUpdateDate}
        hint={dateHint("ReferralLastUpdateDate", "Use the format YYYY-MM-DD.")}
      />
      <TextInput
        id="override-referral-consult-id"
        label="Referral Consult ID"
        value={form.overrideReferralConsultId}
        onChange={(value) => actions.setField("overrideReferralConsultId", value)}
      />
    </div>
  );
}

export function ReferralDetailsSection({ app }) {
  const { form, fieldErrors, previews, actions } = app;
  const prefix = getReferralPrefixLabel(form.referralPrefixMode, form.customReferralPrefix.trim());
  const referralError = fieldErrors.referralPrefix || fieldErrors.referralReplacementCode || app.previewError;
  return (
    <Section
      id="referral-details-card"
      title="Referral Details"
      subtitle="Set the first referral number and ListDate behavior for this run."
      actions={
        <Button
          id="toggle-optional-fields"
          color={form.optionalFieldsVisible ? "primary" : "secondary"}
          size="sm"
          onClick={() => actions.setField("optionalFieldsVisible", !form.optionalFieldsVisible)}
        >
          {form.optionalFieldsVisible ? "Hide Additional Fields" : "Show Additional Fields"}
        </Button>
      }
    >
      <HelpDisclosure
        id="referral-help"
        summary="How Referral Numbers, ICNs, SEOCs, and optional fields work"
        items={[
          ["Referral Number", "Choose a prefix and enter the body once. The live preview shows the first value; larger batches continue the sequence automatically."],
          ["ICN", "Open Additional Fields to control ICNs. Referral Number mode keeps the required 17-character TEST format and keeps every generated ICN unique."],
          ["Optional overrides", "Leave a field blank to keep its source or default behavior. Selected subsets are mixed across the batch; “use all” uses the complete reference list."],
          ["SEOC choices", "Regular SEOC values are mixed automatically from the approved catalog. Select a subset to restrict the values. Situational SEOC is manual-only and should be selected only when specifically required."],
        ]}
      />

      <div className="grid gap-x-5 gap-y-6 md:grid-cols-2">
        <FieldGroup label="Referral Number" className="gap-3">
          <ChoiceCards
            label="Referral Number prefix"
            name="referral-prefix-mode"
            value={form.referralPrefixMode}
            onChange={(value) => actions.setField("referralPrefixMode", value)}
            options={[
              { value: "va", id: "referral-prefix-va", title: "VA", description: "Use VA for every referral." },
              { value: "custom", id: "referral-prefix-custom", title: "Custom", description: "Enter your own letters or numbers." },
            ]}
          />
          {form.referralPrefixMode === "custom" && (
            <div id="custom-referral-prefix-row">
              <TextInput
                id="custom-referral-prefix"
                label="Custom prefix"
                maxLength={8}
                placeholder="Example: VA-TEST_"
                value={form.customReferralPrefix}
                onChange={(value) => actions.setField("customReferralPrefix", value)}
                error={fieldErrors.referralPrefix ? " " : undefined}
              />
            </div>
          )}
          <TextInput
            id="referral-code"
            label="Starting number or body"
            placeholder={`Enter the part after ${prefix}`}
            value={form.referralCode}
            onChange={(value) => actions.setField("referralCode", value)}
            error={fieldErrors.referralReplacementCode ? " " : undefined}
          />
          <Hint id="referral-prefix-help">
            {prefix} will be added automatically. Every Referral Number is exactly 12 characters: the app completes short bodies, shortens long ones, and keeps each number unique. The body can include letters, numbers, hyphens (-), and underscores (_).
          </Hint>
          <Preview id="referral-preview" error={referralError}>{previews.referral}</Preview>
        </FieldGroup>

        <div className="flex flex-col gap-2">
          <TextInput
            id="ssn-value"
            label="SSN"
            value={form.ssnValue}
            onChange={(value) => actions.setField("ssnValue", value)}
            isDisabled={form.randomizeSsn}
            error={fieldErrors.ssnValue}
            hint="Generated test SSNs always start with 999 and differ for each patient. Uncheck random generation to use the fixed value above."
          />
          <Checkbox id="randomize-ssn" isSelected={form.randomizeSsn} onChange={(value) => actions.setField("randomizeSsn", value)} label="Generate a random test SSN for every patient" />
        </div>
      </div>

      <ListDateField app={app} />

      {form.optionalFieldsVisible && <AdditionalFields app={app} />}
    </Section>
  );
}

// -------------------------------------------------------------------------------------------------
// Output
// -------------------------------------------------------------------------------------------------

export function OutputSection({ app }) {
  const { form, flags, fieldErrors, previews, leieBlocking, actions } = app;
  const isCustomArchive = form.archiveNamingMode === "custom";
  const selectedCustomCount = form.archiveCustomValues.length;
  const allCustomSelected = selectedCustomCount === ARCHIVE_CUSTOM_VALUES.length;

  return (
    <Section
      id="output-card"
      title="Output"
      subtitleId="output-subtitle"
      isDimmed={flags.isLeie && leieBlocking}
      subtitle={flags.isGenerate
        ? "Choose where the generated referral JSON files should be saved and how the final output should be kept."
        : flags.isLeie
          ? "Choose where the processed LEIE Excel file should be saved."
          : "Choose where the processed JSON files should be saved and how the final output should be kept."}
    >
      {flags.isLeie ? (
        <HelpDisclosure
          id="leie-output-help"
          summary="Understand LEIE output naming and safety"
          items={[
            ["Processed workbook", "Leave the name blank to keep the source base name, or enter a new base name. The app adds .xlsx automatically."],
            ["Source safety", "The source workbook remains unchanged. The processed copy is written only to the selected Output folder."],
            ["No Referral archive", "LEIE produces a processed .xlsx file. JSON naming, .gz Archive naming, and Referral retention choices do not apply."],
          ]}
        />
      ) : (
        <HelpDisclosure
          id="output-help"
          summary="Understand JSON names, Archive names, and output safety"
          items={[
            ["Processed JSON name", "Changes the names of individual JSON files. Leave it blank to keep source names when editing existing files."],
            ["Archive name", "Controls the final .gz package. Custom values are joined in the order shown, and the filename preview updates immediately."],
            ["Existing files", "Matching filenames are overwritten after validation. Unrelated files stay in place."],
          ]}
        />
      )}

      <div className="flex items-end gap-3">
        <TextInput
          id="output-dir"
          label="Save processed files to"
          className="flex-1"
          value={form.outputDir}
          onChange={(value) => actions.setField("outputDir", value)}
          placeholder={flags.isLeie ? "Choose where processed .xlsx files should be written" : "Choose where JSON and .gz files should be written"}
          error={fieldErrors.outputDir}
        />
        <Button
          color="secondary"
          size="md"
          iconLeading={FolderSearch}
          data-pick="output-dir"
          className={fieldErrors.outputDir ? "mb-6.5" : undefined}
          onClick={() => actions.pickPath("outputDir")}
        >
          Save To
        </Button>
      </div>
      {!fieldErrors.outputDir && <Hint id="output-dir-help" className="-mt-4.5">Use a separate folder from the source folder.</Hint>}

      <div className="flex flex-col gap-1.5 md:max-w-2xl">
        {flags.isLeie ? (
          <TextInput
            id="replacement-code"
            label="Output File Name"
            placeholder="Original source file name"
            value={form.leieOutputFileName}
            onChange={(value) => actions.setField("leieOutputFileName", value)}
            hint="Defaults to the original source file name. You can enter a different base name; the app saves as .xlsx automatically."
          />
        ) : (
          <TextInput
            id="replacement-code"
            label="Name for the processed JSON files"
            placeholder="Leave blank to keep original JSON names"
            value={form.replacementCode}
            onChange={(value) => actions.setField("replacementCode", value)}
            hint="Type any name. When a run creates more than one file, the app adds _1, _2, _3 and so on, so every file has its own name. Leave blank to use the archive name."
          />
        )}
        <Preview id="output-json-preview">{previews.outputJson}</Preview>
      </div>

      {!flags.isLeie && (
        <Panel
          id="archive-naming-card"
          title="Archive naming"
          description="Choose a ready-made filename or build a Custom name from the values that matter to this run."
        >
          <ChoiceCards
            label="Archive naming mode"
            name="archive-naming-mode"
            value={form.archiveNamingMode}
            onChange={(value) => actions.setField("archiveNamingMode", value)}
            options={[
              { value: "referral-number", title: "Referral Number", description: "Example: VA0000012345" },
              { value: "network", title: "Network Name", description: "Add Network before the Referral Number." },
              { value: "referral-date-time", title: "Referral DateTime", description: "Add a filesystem-safe date and time." },
              { value: "custom", title: "Custom", description: "Choose any combination of filename values." },
            ]}
          />
          {isCustomArchive && (
            <div id="archive-custom-fields" className="flex flex-col gap-4 rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset">
              <div>
                <p className="text-sm font-semibold text-primary">Choose what appears in the filename</p>
                <p className="mt-0.5 text-sm text-tertiary">
                  Select any values or select them all. Values use the order shown below, are separated by underscores, and update the preview immediately.
                </p>
              </div>
              <Checkbox
                id="archive-custom-select-all"
                isSelected={allCustomSelected}
                isIndeterminate={selectedCustomCount > 0 && !allCustomSelected}
                onChange={actions.setAllArchiveCustomValues}
                label="Select all available values"
              />
              <div role="group" aria-label="Custom archive filename values" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {ARCHIVE_CUSTOM_VALUES.map((entry) => (
                  <CheckCard
                    key={entry.value}
                    id={entry.id}
                    value={entry.value}
                    inputClassName="archive-custom-value"
                    title={entry.label}
                    description={`{${entry.value}}`}
                    isSelected={form.archiveCustomValues.includes(entry.value)}
                    onChange={(selected) => actions.setArchiveCustomValue(entry.value, selected)}
                  />
                ))}
              </div>
              <div id="archive-custom-text-row">
                <TextInput
                  id="archive-custom-text"
                  label="Custom text"
                  maxLength={48}
                  placeholder="Example: CCRS"
                  value={form.archiveCustomText}
                  onChange={(value) => actions.setField("archiveCustomText", value)}
                  isDisabled={!form.archiveCustomValues.includes("customText")}
                  hint="Used only when Custom Text is selected above."
                />
              </div>
              <Hint id="archive-name-help" tone={fieldErrors.archiveBasename ? "error" : "neutral"}>
                {fieldErrors.archiveBasename || "Available values: {referralNumber}, {referralPrefix}, {networkName}, {date}, {dateTime}, {customText}."}
              </Hint>
            </div>
          )}
          <TextInput
            id="master-file-name"
            label="Name for the combined JSON file"
            maxLength={120}
            placeholder="Leave blank to use the archive name followed by _Master"
            value={form.masterFileName}
            onChange={(value) => actions.setField("masterFileName", value)}
            hint="Type any name you want for the single file that holds every referral. Leave it blank and the app names it for you. If a name is already taken by another generated file, the app adds _Master so nothing is overwritten."
          />
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Combined JSON and archive preview</FieldLabel>
            <Preview id="archive-preview" error={form.archiveNamingMode !== "custom" ? fieldErrors.archiveBasename : ""}>{previews.archive}</Preview>
          </div>
        </Panel>
      )}

      {!flags.isLeie && (
        <Panel
          id="output-retention-card"
          title="If the save folder already has files"
          description="Matching filenames are overwritten automatically after the new batch passes validation."
        >
          <div>
            <p className="text-sm font-semibold text-primary">Files to keep after creating the .gz archive</p>
            <p className="mt-0.5 text-sm text-tertiary">The archive is always kept.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckCard
              id="keep-master-json"
              title="Keep formatted master JSON"
              description="All referrals in one file. Clear both JSON options to keep only gzip. Generate a manifest after the job if needed."
              isSelected={form.keepMasterJson}
              onChange={(value) => actions.setField("keepMasterJson", value)}
            />
            <CheckCard
              id="keep-processed-json"
              title="Keep individual formatted JSON files"
              description="Each source file remains available to inspect."
              isSelected={form.keepProcessedJson}
              onChange={(value) => actions.setField("keepProcessedJson", value)}
            />
          </div>
        </Panel>
      )}
    </Section>
  );
}

// -------------------------------------------------------------------------------------------------
// Upload
// -------------------------------------------------------------------------------------------------

function LeieValidationPanel({ app }) {
  const { form, sqlCopy, actions } = app;
  const sqlText = buildLeieValidationSql(form.leieValidationBatchId);
  return (
    <Panel id="leie-upload-validation-card" title="Step 4: Validate the LEIE Load in the Database">
      <p className="-mt-3 text-sm text-tertiary">
        After the LEIE file is loaded, connect to the database server for the environment you loaded, paste your <code className="font-mono text-secondary">etl_batch_id</code>, copy the SQL below, and run it in <code className="font-mono text-secondary">ccrsdb</code>.
      </p>
      <div id="leie-environment-reference" className="flex flex-col gap-1.5">
        <FieldLabel>Environment Reference</FieldLabel>
        <div className="overflow-hidden rounded-lg bg-primary ring-1 ring-secondary ring-inset">
          <Table aria-label="LEIE database environments" size="sm">
            <Table.Header>
              <Table.Head id="environment" label="Environment" isRowHeader />
              <Table.Head id="server" label="Database Server" />
              <Table.Head id="database" label="Database" />
            </Table.Header>
            <Table.Body items={LEIE_DATABASE_ENVIRONMENTS.map((row) => ({ ...row, id: row.environment }))}>
              {(row) => (
                <Table.Row id={row.id} data-leie-environment={row.environment}>
                  <Table.Cell className="font-semibold text-primary">{row.environment}</Table.Cell>
                  <Table.Cell className="font-mono text-secondary select-all">{row.server}</Table.Cell>
                  <Table.Cell className="font-mono text-secondary select-all">{row.database}</Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        </div>
      </div>
      <TextInput
        id="leie-validation-batch-id"
        label="ETL Batch ID"
        autoComplete="off"
        placeholder="Example: LEIE0731202606153013"
        value={form.leieValidationBatchId}
        onChange={(value) => actions.setField("leieValidationBatchId", value)}
        hint="Use the batch ID from CLAIM_BATCH_LOG (Step 3 in the guide)."
      />
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Validation SQL</FieldLabel>
        <pre
          id="leie-validation-sql"
          tabIndex={0}
          role="region"
          aria-label="Syntax-highlighted LEIE validation SQL"
          className="sql-code-block max-h-80 overflow-auto rounded-lg bg-primary p-4 font-mono text-xs leading-5 text-secondary ring-1 ring-secondary ring-inset"
        >
          <code dangerouslySetInnerHTML={{ __html: highlightSql(sqlText) }} />
        </pre>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button id="copy-leie-validation-sql" color="secondary" size="sm" iconLeading={Copy01} onClick={() => actions.copySql(sqlText)}>
          Copy SQL
        </Button>
        <Hint id="leie-validation-copy-status" tone={sqlCopy.tone}>{sqlCopy.message}</Hint>
      </div>
      <div className="border-t border-secondary pt-4">
        <p className="text-sm font-semibold text-primary">Step 5: Validate in CCRS UI</p>
        <p className="mt-0.5 text-sm text-tertiary">After running the SQL checks, confirm the same batch in the CCRS Table Viewer:</p>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-tertiary">
          <li>Open the correct environment URL:</li>
          {TABLE_VIEWER_LINKS.map((href) => (
            <li key={href}>
              <Button color="link-color" size="sm" iconTrailing={LinkExternal01} onClick={() => actions.openExternal(href)}>
                {href}
              </Button>
            </li>
          ))}
          <li>Select <code className="font-mono text-secondary">CLAIM_BATCH_LOG</code> and confirm file name, <code className="font-mono text-secondary">etl_batch_id</code>, and timestamps.</li>
          <li>Confirm the LEIE load completed successfully before moving to the next environment.</li>
        </ul>
      </div>
    </Panel>
  );
}

function UploadTarget({ app, target }) {
  const { form, flags, fieldErrors, uploadStatus, defaults, actions } = app;
  const settings = form.uploadTargets[target.name] || { enabled: false, userName: "", remoteDirectory: "" };
  const active = form.uploadEnabled && settings.enabled;
  const status = uploadStatus[target.name];
  const statusColor = status?.tone === "success" ? "success" : status?.tone === "error" ? "error" : status?.tone === "working" ? "brand" : "gray";
  const pathHelp = flags.isLeie
    ? `LEIE Data uploads default to ${defaults.LEIE_DEFAULT_UPLOAD_DIRECTORY}. This is separate from the CCRS Referral default ${defaults.REFERRAL_DEFAULT_UPLOAD_DIRECTORY}.`
    : `CCRS Referral uploads default to ${defaults.REFERRAL_DEFAULT_UPLOAD_DIRECTORY}. This is separate from the LEIE Data default ${defaults.LEIE_DEFAULT_UPLOAD_DIRECTORY}.`;

  return (
    <div
      data-upload-target={target.name}
      className={cx("flex flex-col gap-4 rounded-xl bg-primary p-4 ring-1 ring-inset md:p-5", active ? "ring-2 ring-brand" : "ring-secondary")}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary">
            <Badge type="color" color={target.name === "PROD" ? "error" : "brand"} size="sm">{target.name}</Badge>
            <span className="break-all">Server: {target.serverDisplay || "No server found yet"}</span>
          </p>
          <p className="mt-1 text-sm text-tertiary">Choose the account and remote destination for {target.name}.</p>
        </div>
        <Toggle
          data-upload-enabled
          isSelected={settings.enabled}
          isDisabled={!form.uploadEnabled}
          onChange={(value) => actions.setUploadTarget(target.name, { enabled: value })}
          label={`Upload to ${target.name}`}
        />
      </div>
      <div data-upload-grid className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Select
          data-upload-user
          label="User"
          placeholder="No account available"
          value={settings.userName || null}
          isDisabled={!active}
          onChange={(key) => key && actions.setUploadTarget(target.name, { userName: String(key) })}
          items={(target.users || []).map((user) => ({ id: user, label: user }))}
          error={fieldErrors[`upload:${target.name}:user_name`]}
          hint="Choose the account for this upload target."
        >
          {(item) => <BaseSelect.Item id={item.id} label={item.label} />}
        </Select>
        <TextInput
          data-upload-path
          label="Remote Directory"
          value={settings.remoteDirectory}
          isDisabled={!active}
          onChange={(value) => actions.setUploadTarget(target.name, { remoteDirectory: value })}
          error={fieldErrors[`upload:${target.name}:remote_directory`]}
          hint={<span data-upload-path-help>{pathHelp}</span>}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          data-upload-test
          color="secondary"
          size="sm"
          iconLeading={Wifi}
          isDisabled={!active}
          isLoading={status?.tone === "working" && status?.message === "Testing connection..."}
          showTextWhileLoading
          onClick={() => actions.testUploadTarget(target.name)}
        >
          Test Connection
        </Button>
        <span data-upload-status data-tone={status?.tone || "idle"} className="min-w-0">
          <BadgeWithDot type="modern" color={statusColor} size="md" className="break-all whitespace-normal">
            {status?.message || "Not tested yet."}
          </BadgeWithDot>
        </span>
      </div>
    </div>
  );
}

export function UploadSection({ app }) {
  const { form, info, flags, uploadImportState, actions } = app;
  const targets = (info?.uploadTargets || []).filter((target) => actions.isTargetAvailable(target.name, form.mainTab));

  let pillColor = "gray";
  let pillText = "No upload config imported";
  let PillIcon = UploadCloud01;
  if (uploadImportState === "importing") {
    pillColor = "brand";
    pillText = "Importing upload config...";
  } else if (uploadImportState === "failed") {
    pillColor = "error";
    pillText = "Upload config import failed";
  } else if (info?.profileSource?.path) {
    pillColor = "success";
    PillIcon = CheckCircle;
    const summaryText = formatUploadProfileSummary(info.uploadProfileSummary);
    pillText = summaryText ? `Upload profiles imported: ${summaryText}` : "Upload profiles imported";
  }

  return (
    <Section
      id="upload-card"
      title="Upload"
      subtitleId="upload-subtitle"
      subtitle={flags.isLeie
        ? "Optionally upload the processed LEIE .xlsx file to one or more saved environment profiles."
        : "Optionally upload the final .gz file to the DEV, PPD, or SQA Server. PROD is not available for Referral Files."}
      actions={
        <Toggle
          id="upload-enabled"
          isSelected={form.uploadEnabled}
          onChange={(value) => actions.setField("uploadEnabled", value)}
          label={<span id="upload-enabled-label">{flags.isLeie ? "Upload the .xlsx file after processing" : "Upload the .gz file after processing"}</span>}
        />
      }
    >
      <HelpDisclosure
        id="upload-help"
        summary="How optional uploads work"
        items={[
          ["Import", "Importing a configuration only saves connection profiles in the app. It does not upload any file."],
          ["Choose and test", "Enable upload, select the intended environment, and test its connection before starting the run."],
          ["Finish safely", "The app uploads only completed output. Keep it open until every selected target succeeds. Production is available only for LEIE and requires confirmation."],
        ]}
      />
      <div className="flex flex-col gap-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset sm:flex-row sm:items-center sm:justify-between">
        <span id="upload-ready-pill" data-state={pillColor} className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-secondary">
          <PillIcon aria-hidden="true" className={cx("size-5 shrink-0", pillColor === "success" ? "text-fg-success-primary" : pillColor === "error" ? "text-fg-error-primary" : "text-fg-quaternary")} />
          {pillText}
        </span>
        <Button id="import-upload-source" color="primary" size="sm" iconLeading={UploadCloud01} onClick={actions.importUploadSource}>
          Import To Config
        </Button>
      </div>
      {targets.length > 0 && (
        <div id="upload-targets" className="flex flex-col gap-4">
          {targets.map((target) => <UploadTarget key={target.name} app={app} target={target} />)}
        </div>
      )}
      {/* Validation happens after the upload, so it follows the server list. */}
      {flags.isLeie && <LeieValidationPanel app={app} />}
    </Section>
  );
}
