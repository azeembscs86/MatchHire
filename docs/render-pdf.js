// Render the MatchHire project document HTML to a polished PDF
// using the system Chrome via puppeteer-core. Custom footer with
// page numbers; TOC right-column shows section category.
const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTML = 'file:///Users/azeemakram/MatchHire/MatchHire/docs/MatchHire-Project-Document.html';
const OUT  = '/Users/azeemakram/MatchHire/MatchHire/docs/MatchHire-Project-Document.pdf';

const FOOTER = `
  <div style="
    width:100%;
    padding:0 18mm;
    font-family:'Inter','Helvetica Neue',Arial,sans-serif;
    font-size:8pt;
    color:#6B6258;
    display:flex;
    justify-content:space-between;
    align-items:center;
    border-top:0.5pt solid #E2D9C7;
    padding-top:4mm;
  ">
    <span style="font-family:'JetBrains Mono',monospace;letter-spacing:0.12em;text-transform:uppercase;font-size:7pt;color:#8B8278">
      MatchHire · Project Document v1.0
    </span>
    <span style="font-family:'JetBrains Mono',monospace;font-size:8pt;color:#0E1116;font-weight:600">
      <span class="pageNumber"></span> / <span class="totalPages"></span>
    </span>
  </div>`;

const HEADER = `<span></span>`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto(HTML, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluateHandle('document.fonts.ready');

  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: HEADER,
    footerTemplate: FOOTER,
    margin: { top: '12mm', bottom: '18mm', left: '0mm', right: '0mm' },
    preferCSSPageSize: true,
  });

  await browser.close();
  console.log('PDF rendered:', OUT);
})().catch((err) => { console.error(err); process.exit(1); });
