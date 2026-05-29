#!/usr/bin/env node
/**
 * Render docs/Match_Hire_Project_Prompt_Commands_Documentation.md
 * to a polished PDF using:
 *
 *   - `marked` for Markdown → HTML conversion (devDep at root).
 *   - Playwright's bundled Chromium (already installed for QA) to
 *     load the HTML and emit an A4 PDF with header / footer.
 *
 * Why Playwright instead of the existing puppeteer-core script
 * (`docs/render-pdf.js`): puppeteer-core isn't installed in any
 * workspace and would require a separate dependency, whereas
 * Playwright + Chromium ship with the QA suite. We use
 * `playwright`'s headless Chromium directly here (no test
 * runner) so the script can run from a plain `node`.
 *
 * Output:
 *   docs/Match_Hire_Project_Prompt_Commands_Documentation.pdf
 *
 * Run with:
 *   node docs/render-prompts-pdf.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { marked } = require('marked');
const { chromium } = require('playwright');

const SRC = path.join(__dirname, 'Match_Hire_Project_Prompt_Commands_Documentation.md');
const OUT = path.join(__dirname, 'Match_Hire_Project_Prompt_Commands_Documentation.pdf');

// GitHub-flavoured tables + a generated id on every heading so an
// inline TOC could link to sections later if we add one.
marked.use({
  gfm: true,
  breaks: false,
});

const TITLE = 'MatchHire · Prompt Commands Documentation';

const CSS = `
  @page { size: A4; margin: 18mm 14mm 22mm 14mm; }
  :root{
    --ink:#0E1116;
    --ink-soft:#2A2823;
    --muted:#6B6258;
    --muted-2:#8B8278;
    --line:#E2D9C7;
    --line-soft:#EDE5D5;
    --bone:#F5F0E6;
    --bone-2:#FBF6EC;
    --paper:#FFFFFF;
    --coral:#E85D3C;
    --coral-deep:#C73E1D;
    --sage:#3F6B4F;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:10.5pt;line-height:1.55}
  body{padding:6mm 0}
  h1,h2,h3,h4{font-family:'Fraunces','Georgia',serif;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
  h1{font-size:26pt;line-height:1.15;margin:0 0 8pt;border-bottom:1.5pt solid var(--coral);padding-bottom:8pt}
  h2{font-size:16pt;line-height:1.25;margin:22pt 0 8pt;color:var(--ink);page-break-after:avoid}
  h2::before{content:"";display:inline-block;width:6pt;height:6pt;background:var(--coral);border-radius:2pt;margin-right:8pt;vertical-align:middle;transform:translateY(-2pt)}
  h3{font-size:12pt;margin:14pt 0 6pt;color:var(--ink-soft);page-break-after:avoid}
  h4{font-size:10.5pt;font-family:'Inter',sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:12pt 0 4pt;font-weight:700}
  p{margin:0 0 8pt}
  ul,ol{margin:0 0 10pt 18pt;padding:0}
  li{margin:3pt 0}
  code{font-family:'JetBrains Mono','Menlo',monospace;font-size:9pt;background:var(--bone-2);border:0.5pt solid var(--line);border-radius:3pt;padding:1pt 4pt;color:var(--ink-soft)}
  pre{font-family:'JetBrains Mono','Menlo',monospace;font-size:9pt;background:var(--bone-2);border:0.5pt solid var(--line);border-left:3pt solid var(--coral);border-radius:4pt;padding:10pt 12pt;overflow-x:auto;line-height:1.45;color:var(--ink-soft)}
  pre code{background:none;border:none;padding:0}
  blockquote{margin:8pt 0;padding:6pt 12pt;border-left:3pt solid var(--coral);background:var(--bone-2);color:var(--ink-soft);font-size:10pt}
  table{width:100%;border-collapse:collapse;margin:8pt 0 12pt;font-size:9.5pt;page-break-inside:avoid}
  th,td{border:0.5pt solid var(--line);padding:5pt 7pt;text-align:left;vertical-align:top}
  th{background:var(--bone);color:var(--ink-soft);font-weight:700;font-size:9pt;letter-spacing:.02em;text-transform:uppercase}
  tr{page-break-inside:avoid}
  hr{border:0;border-top:0.5pt solid var(--line);margin:18pt 0}
  a{color:var(--coral-deep);text-decoration:none}
  strong{color:var(--ink)}

  /* The Prompt-Command "card" — every h3 step renders inside a
     visually distinct block so the doc reads like a log of
     decisions, not a wall of headings. We achieve the card look by
     wrapping each H3..next-H3 region with a class via a custom
     renderer in the JS side. */
  .prompt-card{
    border:0.5pt solid var(--line);
    border-left:3pt solid var(--coral);
    border-radius:5pt;
    padding:10pt 14pt 8pt;
    margin:10pt 0 14pt;
    background:#FFFEFB;
    page-break-inside:avoid;
  }
  .prompt-card h3{margin-top:0;color:var(--coral-deep)}
  .prompt-card p{margin:4pt 0}
  .prompt-card strong{color:var(--ink)}
  .status-completed{color:var(--sage);font-weight:700}
  .status-pending{color:var(--coral-deep);font-weight:700}
  .status-progress{color:#9C6B14;font-weight:700}

  .cover{
    padding:60pt 20pt 30pt;
    border-bottom:0.5pt solid var(--line);
    margin-bottom:18pt;
  }
  .cover .eyebrow{
    font-family:'JetBrains Mono',monospace;
    font-size:9pt;letter-spacing:.18em;text-transform:uppercase;
    color:var(--coral);margin-bottom:14pt;
  }
  .cover h1{border:none;padding:0;font-size:36pt;line-height:1.1;margin-bottom:10pt}
  .cover p.lead{font-size:13pt;color:var(--muted);max-width:520pt;line-height:1.55}
  .cover .meta{margin-top:24pt;font-size:9.5pt;color:var(--muted);display:flex;gap:24pt;flex-wrap:wrap}
  .cover .meta strong{color:var(--ink-soft)}
`;

function colourStatus(html) {
  // Colourise the "Status: Completed/Pending/In Progress" line
  // wherever it appears in the body.
  return html
    .replace(/Status:\s*Completed/g, 'Status: <span class="status-completed">Completed</span>')
    .replace(/Status:\s*Pending/g, 'Status: <span class="status-pending">Pending</span>')
    .replace(/Status:\s*In Progress/g, 'Status: <span class="status-progress">In Progress</span>');
}

/**
 * Wrap every "### Step N" block (until the next H2 or the next H3
 * that introduces a new step) in a `.prompt-card` div so the PDF
 * renders each step as a distinct card. We split on the H3 tag
 * boundary and re-emit.
 */
function wrapPromptCards(html) {
  // Match each <h3> that starts a Step block AND grab everything
  // up to the next <h3> or <h2>. Non-greedy regex.
  return html.replace(
    /(<h3[^>]*>Step\s+\d+[^<]*<\/h3>[\s\S]*?)(?=<h3[^>]*>Step\s+\d+|<h2[^>]*>|<hr[^>]*>|$)/g,
    (block) => `<div class="prompt-card">${block}</div>`
  );
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`Missing source markdown: ${SRC}`);
  }
  const md = fs.readFileSync(SRC, 'utf-8');

  let bodyHtml = marked.parse(md);
  bodyHtml = wrapPromptCards(bodyHtml);
  bodyHtml = colourStatus(bodyHtml);

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${TITLE}</title>
<style>${CSS}</style>
</head><body>
<div class="cover">
  <div class="eyebrow">MatchHire · Internal documentation</div>
  <h1>Prompt Commands Documentation</h1>
  <p class="lead">Every prompt-driven task on the MatchHire codebase, in execution order, with the business reason, developer notes, and verification status for each one.</p>
  <div class="meta">
    <span><strong>Audience:</strong> Developers · Business stakeholders · Future contributors</span>
    <span><strong>Source of truth:</strong> docs/Match_Hire_Project_Prompt_Commands_Documentation.md</span>
  </div>
</div>
${bodyHtml}
</body></html>`;

  // Persist the rendered HTML next to the PDF for inspection.
  const HTML_OUT = OUT.replace(/\.pdf$/, '.rendered.html');
  fs.writeFileSync(HTML_OUT, html, 'utf-8');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  const FOOTER = `
    <div style="width:100%;padding:0 14mm;font-family:'Inter',Arial,sans-serif;font-size:8pt;color:#6B6258;display:flex;justify-content:space-between;align-items:center;border-top:0.5pt solid #E2D9C7;padding-top:3mm;">
      <span style="font-family:'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;font-size:7pt;color:#8B8278">MatchHire · Prompt Commands Documentation</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:8pt;color:#0E1116;font-weight:600"><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;

  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: FOOTER,
    margin: { top: '12mm', bottom: '20mm', left: '0mm', right: '0mm' },
  });

  await browser.close();
  // Keep the rendered HTML as an inspection artefact so we can
  // diff what marked produced if a future styling tweak misbehaves.
  // (Not committed — see .gitignore in docs/.)
  console.log(`✓ Rendered ${OUT}`);
  console.log(`  ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error('Render failed:', err);
  process.exit(1);
});
