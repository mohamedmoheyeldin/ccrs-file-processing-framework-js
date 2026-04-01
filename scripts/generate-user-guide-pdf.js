const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const markdownPath = path.join(repoRoot, "docs", "USER_GUIDE.md");
const outputPath = path.join(repoRoot, "docs", "USER_GUIDE.pdf");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInlineMarkdown(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function flushParagraph(paragraphLines, parts) {
  if (paragraphLines.length === 0) {
    return;
  }
  const text = paragraphLines.join(" ").trim();
  if (text) {
    parts.push(`<p>${renderInlineMarkdown(text)}</p>`);
  }
  paragraphLines.length = 0;
}

function closeList(parts, state) {
  if (state.inList) {
    parts.push("</ul>");
    state.inList = false;
  }
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const parts = [];
  const paragraphLines = [];
  const state = {
    inList: false,
    inCode: false,
    codeLines: [],
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph(paragraphLines, parts);
      closeList(parts, state);
      if (state.inCode) {
        parts.push(`<pre><code>${escapeHtml(state.codeLines.join("\n"))}</code></pre>`);
        state.codeLines = [];
        state.inCode = false;
      } else {
        state.inCode = true;
      }
      continue;
    }

    if (state.inCode) {
      state.codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph(paragraphLines, parts);
      closeList(parts, state);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph(paragraphLines, parts);
      closeList(parts, state);
      const level = headingMatch[1].length;
      parts.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = trimmed.match(/^-\s+(.+)$/);
    if (listMatch) {
      flushParagraph(paragraphLines, parts);
      if (!state.inList) {
        parts.push("<ul>");
        state.inList = true;
      }
      parts.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    closeList(parts, state);
    paragraphLines.push(trimmed);
  }

  flushParagraph(paragraphLines, parts);
  closeList(parts, state);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>CCRS File Processing Framework User Guide</title>
    <style>
      :root {
        color-scheme: light;
        --text: #172033;
        --muted: #56627a;
        --accent: #0d6efd;
        --border: #d8e0eb;
        --panel: #ffffff;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        color: var(--text);
        background: #f3f6fb;
      }
      main {
        max-width: 900px;
        margin: 0 auto;
        padding: 40px 48px 56px;
        background: var(--panel);
      }
      h1, h2, h3, h4, h5, h6 {
        color: var(--text);
        margin: 1.2em 0 0.45em;
        page-break-after: avoid;
      }
      h1 {
        font-size: 28px;
        border-bottom: 2px solid var(--border);
        padding-bottom: 12px;
      }
      h2 {
        font-size: 22px;
        color: var(--accent);
      }
      h3 {
        font-size: 18px;
      }
      p, li {
        font-size: 14px;
        line-height: 1.65;
      }
      p {
        margin: 0 0 12px;
      }
      ul {
        margin: 0 0 14px 20px;
        padding: 0;
      }
      li {
        margin: 0 0 8px;
      }
      code {
        font-family: "Cascadia Code", "Consolas", monospace;
        font-size: 0.92em;
        background: #eef3fb;
        padding: 1px 5px;
        border-radius: 6px;
      }
      pre {
        margin: 14px 0 18px;
        padding: 14px 16px;
        background: #0f172a;
        color: #f8fbff;
        border-radius: 12px;
        overflow: hidden;
        white-space: pre-wrap;
        word-break: break-word;
      }
      pre code {
        background: transparent;
        padding: 0;
        color: inherit;
      }
      @page {
        margin: 18mm 14mm;
      }
    </style>
  </head>
  <body>
    <main>
      ${parts.join("\n")}
    </main>
  </body>
</html>`;
}

function getBrowserPath() {
  const candidates = [
    process.env.CCRS_PDF_BROWSER,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function toFileUrl(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, "/");
  return `file:///${normalized}`;
}

function main() {
  if (!fs.existsSync(markdownPath)) {
    throw new Error(`User guide markdown not found: ${markdownPath}`);
  }

  const browserPath = getBrowserPath();
  if (!browserPath) {
    if (fs.existsSync(outputPath)) {
      console.warn("No supported browser found for PDF generation. Keeping the existing USER_GUIDE.pdf.");
      return;
    }
    throw new Error("Unable to generate USER_GUIDE.pdf because Microsoft Edge or Google Chrome was not found.");
  }

  const html = markdownToHtml(fs.readFileSync(markdownPath, "utf8"));
  const tempHtmlPath = path.join(os.tmpdir(), "ccrs-user-guide-print.html");
  fs.writeFileSync(tempHtmlPath, html, "utf8");

  const result = spawnSync(
    browserPath,
    [
      "--headless=new",
      "--disable-gpu",
      "--allow-file-access-from-files",
      "--disable-software-rasterizer",
      "--no-pdf-header-footer",
      `--print-to-pdf=${outputPath}`,
      toFileUrl(tempHtmlPath),
    ],
    {
      encoding: "utf8",
      windowsHide: true,
    }
  );

  if (result.status !== 0 || !fs.existsSync(outputPath)) {
    throw new Error(
      [
        "Failed to generate USER_GUIDE.pdf.",
        result.stderr?.trim(),
        result.stdout?.trim(),
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  console.log(`Generated ${path.relative(repoRoot, outputPath)}.`);
}

main();
