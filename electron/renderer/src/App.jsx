import { useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen01,
  Check,
  Copy01,
  Database01,
  Download01,
  File06,
  FolderSearch,
  Moon01,
  PlayCircle,
  RefreshCw01,
  ShieldTick,
  Stars02,
  Sun,
  XClose,
  Zap,
} from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Tab, TabList, Tabs } from "@/components/application/tabs/tabs";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cx } from "@/utils/cx";
import { BusyContext, Button, HelpDisclosure, TextInput } from "./components/primitives";
import {
  GeneratorSection,
  LeieDuplicateSection,
  LeieGuideBanner,
  OutputSection,
  ReferralDetailsSection,
  SourceSection,
  UploadSection,
} from "./components/sections";
import { plural, progressDisplay, statusTone, summarizeUploadResults, workflowProgress } from "./lib/logic";
import { useController } from "./lib/useController";

const APP_ICON = "../../assets/icons/ccrs_app_icon.png";

const WORKFLOW_STEPS = [
  { key: "source", title: "Select", copy: "Choose the source folder or generation template. Source files are never edited." },
  { key: "configure", title: "Configure", copy: "Set the fields you want to change. Leave optional overrides blank to keep source values." },
  { key: "validate", title: "Validate", copy: "Check the live previews and correct any highlighted fields before continuing." },
  { key: "process", title: "Process", copy: "Review the run summary, then create the new files in the selected output folder." },
  { key: "upload", title: "Upload", copy: "Upload is optional and runs only when you enable it and choose a configured target." },
];

const STATUS_COLORS = { idle: "gray", working: "brand", completed: "success", failed: "error" };

// The selected referral mode is solid green so it is obvious which mode is active.
const SELECTED_MODE_CLASS =
  "selected:z-10 selected:bg-success-solid selected:font-semibold selected:text-white selected:ring-success-600 selected:hover:bg-success-solid selected:hover:text-white selected:[&_svg]:text-white";

function Header({ app }) {
  const { form, info, actions, busy } = app;
  return (
    <header className="z-40 border-b border-secondary bg-primary [@media(min-height:600px)]:sticky [@media(min-height:600px)]:top-0">
      <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8 2xl:px-12">
        <div className="flex min-w-0 items-center gap-3">
          <img src={APP_ICON} alt="CCRS FPF logo" className="size-10 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="hero-title" className="text-lg font-semibold text-primary">CCRS File Processing</h1>
              {info?.appVersionLabel && (
                <span id="app-version-badge"><Badge type="pill-color" color="brand" size="sm">{info.appVersionLabel}</Badge></span>
              )}
              {info?.releaseAnnouncement?.releaseKey && (
                <Button id="open-release-notes" allowWhileBusy color="link-color" size="sm" iconLeading={Stars02} onClick={actions.openReleaseNotes}>
                  What's new
                </Button>
              )}
            </div>
            <p id="hero-subtitle" className="hidden text-sm text-tertiary lg:block">
              Use the tabs below to work with referral files and related CCRS processing workflows.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button id="open-user-guide" color="secondary" size="sm" iconLeading={BookOpen01} onClick={actions.openUserGuide}>
            User Guide
          </Button>
          <Button id="export-diagnostics" color="secondary" size="sm" iconLeading={Download01} onClick={actions.exportDiagnostics}>
            Export Diagnostics
          </Button>
          <ButtonGroup
            aria-label="Theme"
            size="sm"
            disallowEmptySelection
            isDisabled={busy}
            selectedKeys={[form.theme]}
            onSelectionChange={(keys) => {
              const [theme] = [...keys];
              if (theme) actions.setField("theme", theme);
            }}
          >
            <ButtonGroupItem id="light" data-theme="light" iconLeading={Sun}>Light</ButtonGroupItem>
            <ButtonGroupItem id="dark" data-theme="dark" iconLeading={Moon01}>Dark</ButtonGroupItem>
          </ButtonGroup>
        </div>
      </div>
    </header>
  );
}

const MODULES = [
  { id: "referral", title: "Referral Files", description: "Edit or generate referral JSON files.", icon: File06 },
  { id: "leie", title: "LEIE Data Processing", description: "Clean, save, upload and validate LEIE data.", icon: Database01 },
  { id: "other", title: "More Features Coming Soon", description: "Future CCRS file types will appear here.", icon: Stars02 },
];

function WorkflowTabs({ app }) {
  const { form, flags, actions, busy } = app;
  return (
    <div className="flex flex-col gap-4">
      <p id="module-heading" className="text-xs font-semibold tracking-wide text-quaternary uppercase">Application modules</p>
      <Tabs selectedKey={form.mainTab} onSelectionChange={(key) => actions.setMainTab(String(key))} isDisabled={busy}>
        <TabList aria-label="Application modules" type="button-minimal" size="md" className="grid gap-3 md:grid-cols-3">
          {MODULES.map((module) => (
            <Tab
              key={module.id}
              id={module.id}
              data-main-tab={module.id}
              className={({ isSelected, isHovered }) =>
                cx(
                  "h-full w-full justify-start gap-3 rounded-xl bg-primary p-4 text-left whitespace-normal shadow-xs ring-1 ring-secondary ring-inset",
                  isHovered && !isSelected && "bg-primary_hover ring-primary",
                  isSelected && "bg-brand-primary_alt ring-2 ring-brand"
                )
              }
            >
              {({ isSelected }) => (
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={cx(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                      isSelected ? "bg-brand-solid text-white ring-transparent" : "bg-secondary text-fg-quaternary ring-secondary"
                    )}
                  >
                    <module.icon className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className={cx("text-md font-semibold", isSelected ? "text-brand-secondary" : "text-primary")}>{module.title}</span>
                    <span className="text-sm font-normal text-tertiary">{module.description}</span>
                  </span>
                </span>
              )}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id="main-tab-copy" className="text-sm text-tertiary">
          {flags.isReferral ? "Choose how you want to work with Referral Files:" : ""}
        </p>
        {flags.isReferral && (
          <div id="subtab-row">
            <ButtonGroup
              aria-label="Referral workflow mode"
              size="md"
              disallowEmptySelection
              isDisabled={busy}
              selectedKeys={[form.subTab]}
              onSelectionChange={(keys) => {
                const [subTab] = [...keys];
                if (subTab) actions.setSubTab(subTab);
              }}
            >
              <ButtonGroupItem id="edit" data-sub-tab="edit" iconLeading={File06} className={SELECTED_MODE_CLASS}>Edit Existing Files</ButtonGroupItem>
              <ButtonGroupItem id="generate" data-sub-tab="generate" iconLeading={Zap} className={SELECTED_MODE_CLASS}>Generate New Files</ButtonGroupItem>
            </ButtonGroup>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowIntro({ app }) {
  const { form, flags } = app;
  const fileCount = Math.max(Number(form.fileCount || 1), 1);
  const referralsPerFile = Math.max(Number(form.referralsPerFile || 1), 1);
  const total = fileCount * referralsPerFile;
  const title = flags.isGenerate
    ? "CCRS Referral Generation"
    : flags.isReferral ? "CCRS Referral Processing" : flags.isLeie ? "LEIE Data Processing" : "Other CCRS File Processing";
  const subtitle = flags.isGenerate
    ? "Create fresh referral JSON files, then process and package them."
    : flags.isReferral
      ? "Choose source files, apply targeted JSON updates, and export clean output in one pass."
      : flags.isLeie
        ? "Choose an Excel file or folder, scan for duplicate rows, and resolve duplicates before saving."
        : "This area is reserved for future CCRS workflow implementations.";
  return (
    <div id="workflow-card" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="workflow-title" className="text-display-xs font-semibold text-primary">{title}</h2>
          <p id="workflow-subtitle" className="mt-1 text-md text-tertiary">{subtitle}</p>
        </div>
        {flags.isGenerate && (
          <span id="template-summary-pill">
            <Badge type="color" color="brand" size="lg">
              {`Generation setup: ${fileCount} JSON ${plural(fileCount, "file")} | ${referralsPerFile} ${plural(referralsPerFile, "referral")} per file | ${total} total ${plural(total, "referral")}`}
            </Badge>
          </span>
        )}
      </div>
      <HelpDisclosure
        id="workflow-help"
        columns={5}
        summary="New here? See how the five steps work"
        items={WORKFLOW_STEPS.map((step, index) => [`${index + 1}. ${step.title}`, step.copy])}
      />
    </div>
  );
}

function WorkflowStepper({ app }) {
  const { activeStep, complete } = workflowProgress(app.status.label, app.phase);
  return (
    <ol id="workflow-stepper" aria-label="Workflow progress" className="flex flex-col">
      {WORKFLOW_STEPS.map((step, index) => {
        const isComplete = index < activeStep || complete;
        const isActive = index === activeStep && !complete;
        const isLast = index === WORKFLOW_STEPS.length - 1;
        return (
          <li
            key={step.key}
            data-workflow-step={step.key}
            data-state={isComplete ? "complete" : isActive ? "active" : "upcoming"}
            aria-current={isActive ? "step" : undefined}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <span
                className={cx(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-inset",
                  isComplete && "bg-brand-solid text-white",
                  isActive && "bg-primary text-brand-secondary shadow-xs ring-2 ring-brand",
                  !isComplete && !isActive && "bg-primary text-quaternary ring-1 ring-primary"
                )}
              >
                {isComplete ? <Check aria-hidden="true" className="size-3.5 stroke-3" /> : index + 1}
              </span>
              {!isLast && <span className={cx("my-1 w-0.5 flex-1 rounded-full", isComplete ? "bg-brand-solid" : "bg-quaternary")} />}
            </div>
            <p className={cx("pb-4 text-sm font-semibold", isActive ? "text-brand-secondary" : isComplete ? "text-secondary" : "text-tertiary", isLast && "pb-0")}>
              {step.title}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

const UPLOAD_RESULT_COLORS = {
  pending: "gray",
  uploading: "brand",
  completed: "success",
  failed: "error",
  skipped: "gray",
};

/** One row per selected server, so it is clear which uploads passed, failed or were skipped. */
function UploadResults({ results }) {
  const { rows, summary } = summarizeUploadResults(results);
  if (rows.length === 0) return null;
  return (
    <div id="upload-results" aria-live="polite" className="flex flex-col gap-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-primary">Upload results</p>
        <p id="upload-results-summary" className="text-sm text-tertiary">{summary}</p>
      </div>
      <ul id="upload-results-list" className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.key} data-upload-result={row.status} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-secondary">{row.serverName}</span>
              <BadgeWithDot type="pill-color" color={UPLOAD_RESULT_COLORS[row.status]} size="sm">{row.label}</BadgeWithDot>
            </div>
            {row.message && <p className="text-sm break-words text-tertiary">{row.message}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunPanel({ app }) {
  const { status, activityActive, progress, busy, cancellable, cancelRequested, flags, lastRun, manifestPending, leieBlocking, uploadResults, actions } = app;
  const tone = statusTone(status.label, activityActive);
  const display = progressDisplay(progress.current, progress.total);
  const hasRun = Boolean(lastRun?.outputDir || lastRun?.archivePath || lastRun?.manifestPath);
  const canRetry = Boolean(lastRun?.retryable || lastRun?.status === "upload-failed");

  return (
    <aside id="run-card" className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset min-[900px]:sticky min-[900px]:top-32 min-[900px]:max-h-[calc(100dvh-9rem)] min-[900px]:overflow-y-auto xl:top-24 xl:max-h-[calc(100dvh-7rem)]">
      <div className="border-b border-secondary px-5 py-4">
        <p className="text-md font-semibold text-primary">Run</p>
        <p className="text-sm text-tertiary">Progress and status for this workflow.</p>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">
        <WorkflowStepper app={app} />

        <div role="status" aria-live="polite" aria-atomic="true" className="flex flex-col items-start gap-2 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
          <BadgeWithDot type="pill-color" color={STATUS_COLORS[tone]} size="md">
            <span id="status-badge" data-tone={tone}>{status.label}</span>
          </BadgeWithDot>
          <p id="status-message" className="text-sm text-secondary">{status.message}</p>
        </div>

        {activityActive && (
          <div id="job-progress-wrap" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span id="job-progress-label" className="font-medium text-secondary">{display.label}</span>
              <span id="job-progress-value" className="text-tertiary">{display.value}</span>
            </div>
            {display.determinate ? (
              <div id="job-progress" aria-valuetext={display.valueText}>
                <ProgressBarBase value={display.percent} />
              </div>
            ) : (
              <div id="job-progress" role="progressbar" aria-valuetext="Work is in progress" className="h-2 w-full overflow-hidden rounded-md bg-quaternary">
                <div className="ccrs-progress-indeterminate h-full w-2/5 rounded-md bg-fg-brand-primary" />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {flags.isGenerate ? (
            <Button key="run-generate" id="run-generate" color="primary" size="lg" className="w-full" iconLeading={PlayCircle} isLoading={busy} showTextWhileLoading onClick={actions.runGenerate}>
              Generate Files
            </Button>
          ) : (
            <Button
              key="run-process"
              id="run-process"
              color="primary"
              size="lg"
              className="w-full"
              iconLeading={PlayCircle}
              isLoading={busy}
              showTextWhileLoading
              isDisabled={flags.isLeie && leieBlocking}
              onClick={actions.runProcess}
            >
              {flags.isLeie ? "Save Processed File" : "Run Processing"}
            </Button>
          )}
          {cancellable && (
            <Button id="cancel-job" allowWhileBusy color="secondary-destructive" size="lg" className="w-full" iconLeading={XClose} isDisabled={cancelRequested} onClick={actions.cancelJob}>
              Cancel
            </Button>
          )}
        </div>

        <UploadResults results={uploadResults} />

        {hasRun && (
          <div id="result-actions" className="flex flex-col gap-2 border-t border-secondary pt-5">
            <p className="text-sm font-semibold text-primary">Last run</p>
            <Button id="open-output-folder" color="secondary" size="sm" className="w-full" iconLeading={FolderSearch} isDisabled={!lastRun?.outputDir} onClick={actions.openOutputFolder}>
              Open Output Folder
            </Button>
            <Button id="open-batch-manifest" color="secondary" size="sm" className="w-full" iconLeading={File06} isDisabled={!lastRun?.manifestData || manifestPending} onClick={actions.generateManifest}>
              Generate Manifest
            </Button>
            <Button id="copy-archive-path" color="secondary" size="sm" className="w-full" iconLeading={Copy01} isDisabled={!lastRun?.archivePath} onClick={actions.copyArchivePath}>
              Copy Output Path
            </Button>
            {canRetry && (
              <Button id="retry-failed-uploads" color="primary" size="sm" className="w-full" iconLeading={RefreshCw01} onClick={actions.retryFailedUploads}>
                Retry Failed Uploads
              </Button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function PreRunModal({ app }) {
  const { preRun, actions } = app;
  const [prodText, setProdText] = useState("");
  const isOpen = Boolean(preRun);
  useEffect(() => {
    if (isOpen) setProdText("");
  }, [isOpen]);
  const confirmDisabled = Boolean(preRun?.needsProd) && prodText.trim().toUpperCase() !== "PROD";

  return (
    <ModalOverlay isOpen={isOpen} isDismissable={false} isKeyboardDismissDisabled={false} onOpenChange={(open) => !open && actions.closePreRun(false)}>
      <Modal className="max-w-160">
        <Dialog id="pre-run-overlay" aria-labelledby="pre-run-title">
          <div id="pre-run-panel" className="flex max-h-[inherit] flex-col">
            <div className="flex items-start gap-4 px-6 pt-6">
              <FeaturedIcon icon={ShieldTick} color="brand" theme="light" size="lg" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-secondary">Safety Review</p>
                <h2 id="pre-run-title" className="text-lg font-semibold text-primary">Review this run</h2>
                <p className="mt-0.5 text-sm text-tertiary">Confirm the business settings and exact destinations before the app changes or uploads files.</p>
              </div>
            </div>
            <dl id="pre-run-summary" className="mx-6 mt-5 min-h-0 flex-1 divide-y divide-secondary overflow-y-auto rounded-xl ring-1 ring-secondary ring-inset">
              {(preRun?.items || []).map(([label, value]) => (
                <div
                  key={label}
                  data-review-item
                  data-review-warning={/warning|caution/i.test(label) || undefined}
                  className={cx("grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4", /warning/i.test(label) && "bg-warning-primary")}
                >
                  <dt className={cx("text-sm font-semibold", /warning/i.test(label) ? "text-warning-primary" : "text-secondary")}>{label}</dt>
                  <dd className="text-sm break-all text-tertiary">{value}</dd>
                </div>
              ))}
            </dl>
            {preRun?.needsProd && (
              <div id="prod-confirm-wrap" className="mx-6 mt-5">
                <TextInput
                  id="prod-confirm-input"
                  label="Production confirmation"
                  autoComplete="off"
                  autoFocus
                  placeholder="Type PROD to confirm"
                  value={prodText}
                  onChange={setProdText}
                  hint="Production upload remains blocked until you type PROD."
                />
              </div>
            )}
            <div className="flex flex-col-reverse gap-3 px-6 pt-6 pb-6 sm:flex-row sm:justify-end">
              <Button id="pre-run-cancel" color="secondary" size="lg" onClick={() => actions.closePreRun(false)}>Go Back</Button>
              <Button id="pre-run-confirm" color="primary" size="lg" autoFocus={!preRun?.needsProd} isDisabled={confirmDisabled} onClick={() => actions.closePreRun(true)}>
                Start Safely
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function ReleaseNoteList({ id, notes }) {
  return (
    <ul id={id} className="flex flex-col gap-3">
      {notes.map((note) => (
        <li key={note} className="flex gap-3 text-sm text-secondary">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" />
          <span>{note}</span>
        </li>
      ))}
    </ul>
  );
}

function ReleaseModal({ app }) {
  const { info, releaseOpen, releaseMode, actions } = app;
  const announcement = info?.releaseAnnouncement || null;
  const notes = Array.isArray(announcement?.notes) ? announcement.notes : [];
  const highlights = Array.isArray(announcement?.highlights) ? announcement.highlights : [];
  // Opened from the header link, the dialog can be closed freely and opened again at any time.
  const isView = releaseMode === "view";
  return (
    <ModalOverlay
      isOpen={releaseOpen}
      isDismissable={isView}
      isKeyboardDismissDisabled={!isView}
      onOpenChange={(open) => { if (!open && isView) actions.closeReleaseNotes(); }}
    >
      <Modal className="max-w-180">
        <Dialog id="release-announcement-overlay" aria-labelledby="release-announcement-title" aria-describedby="release-announcement-copy">
          <div id="release-announcement-panel" className="grid max-h-[inherit] grid-rows-[auto_minmax(0,1fr)_auto]">
            <div className="flex items-start gap-4 px-6 pt-6">
              <img src={APP_ICON} alt="CCRS FPF logo" className="size-12 shrink-0 rounded-xl" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-secondary">
                  <Stars02 aria-hidden="true" className="size-4" />
                  Release Update
                </p>
                <h2 id="release-announcement-title" className="text-lg font-semibold text-primary">
                  {announcement?.label ? `What's new in ${announcement.label}` : "What's new in this release"}
                </h2>
                <p id="release-announcement-version" className="sr-only">{announcement?.label || ""}</p>
                <p id="release-announcement-copy" className="mt-0.5 text-sm text-tertiary">
                  {isView
                    ? "What this version changed, followed by the full list of changes including earlier versions."
                    : "Review the changes below. Scroll through the updates, then start using the app when you are ready."}
                </p>
              </div>
            </div>
            <div data-release-scroll tabIndex={0} aria-label="Release notes" className="mx-6 mt-5 flex flex-col gap-5 overflow-y-auto rounded-xl bg-secondary p-4 ring-1 ring-secondary outline-focus-ring ring-inset focus-visible:outline-2">
              {highlights.length > 0 && (
                <section id="release-highlights">
                  <h3 className="mb-3 text-sm font-semibold text-primary">New in this version</h3>
                  <ReleaseNoteList id="release-highlights-list" notes={highlights} />
                </section>
              )}
              <section>
                {highlights.length > 0 && (
                  <h3 className="mb-3 text-sm font-semibold text-primary">All changes, including earlier versions</h3>
                )}
                <ReleaseNoteList id="release-announcement-list" notes={notes} />
              </section>
            </div>
            <div className="flex flex-col gap-3 px-6 pt-5 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-tertiary">
                {isView
                  ? "Open this anytime from What's new next to the version."
                  : "You can reopen these notes anytime from What's new next to the version."}
              </span>
              {isView ? (
                <Button key="release-close" id="release-announcement-close" allowWhileBusy color="primary" size="lg" autoFocus onClick={actions.closeReleaseNotes}>
                  Close
                </Button>
              ) : (
                <Button key="release-accept" id="release-announcement-accept" allowWhileBusy color="primary" size="lg" autoFocus onClick={actions.acknowledgeRelease}>
                  Start Using The App
                </Button>
              )}
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function FutureCard() {
  return (
    <section id="future-card" className="flex flex-col items-center gap-4 rounded-xl bg-primary px-6 py-16 text-center shadow-xs ring-1 ring-secondary ring-inset">
      <FeaturedIcon icon={Stars02} color="gray" theme="modern" size="lg" />
      <div>
        <h2 className="text-lg font-semibold text-primary">More Features Coming Soon</h2>
        <p className="mt-1 text-sm text-tertiary">This area is reserved for future implementations.</p>
      </div>
    </section>
  );
}

export function App() {
  const app = useController();
  const { flags, ready } = app;

  if (!ready) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-secondary">
        {app.status.label === "Failed" ? (
          <>
            <FeaturedIcon icon={AlertCircle} color="error" theme="light" size="lg" />
            <p id="status-message" className="max-w-md text-center text-sm text-secondary">{app.status.message}</p>
          </>
        ) : (
          <p className="text-sm font-medium text-tertiary">Loading CCRS File Processing...</p>
        )}
      </div>
    );
  }

  return (
    <BusyContext.Provider value={app.busy}>
      <div className="min-h-dvh bg-secondary">
        <Header app={app} />
        <main className="flex w-full flex-col gap-6 px-4 py-6 md:px-8 md:py-8 2xl:px-12">
          <WorkflowTabs app={app} />
          {flags.isOther ? (
            <FutureCard />
          ) : (
            <div className="grid items-start gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <WorkflowIntro app={app} />
                {flags.isLeie && <LeieGuideBanner app={app} />}
                {!flags.isGenerate && <SourceSection app={app} />}
                {flags.isLeie && <LeieDuplicateSection app={app} />}
                {flags.isGenerate && <GeneratorSection app={app} />}
                {flags.isReferral && <ReferralDetailsSection app={app} />}
                <OutputSection app={app} />
                <UploadSection app={app} />
              </div>
              <RunPanel app={app} />
            </div>
          )}
        </main>
        <PreRunModal app={app} />
        <ReleaseModal app={app} />
      </div>
    </BusyContext.Provider>
  );
}
