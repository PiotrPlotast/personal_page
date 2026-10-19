// Renders the default social preview image (public/og/default.png, 1200×630) from HTML with
// Playwright, using the site's own fonts and colours. Re-run with `pnpm og` after changing it.
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a pre-installed Chromium.
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
// Fonts are inlined as data URLs: a page created from a string may not load file:// resources.
const font = async (pkg, file) => {
  const data = await readFile(new URL(`node_modules/@fontsource-variable/${pkg}/files/${file}`, root));
  return `data:font/woff2;base64,${data.toString('base64')}`;
};
const bricolage = await font('bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2');
const bricolageExt = await font('bricolage-grotesque', 'bricolage-grotesque-latin-ext-wght-normal.woff2');
const dmSans = await font('dm-sans', 'dm-sans-latin-wght-normal.woff2');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: Bricolage; src: url(${bricolage}); font-weight: 200 800; }
  @font-face { font-family: Bricolage; src: url(${bricolageExt}); font-weight: 200 800; unicode-range: U+0100-024F; }
  @font-face { font-family: DMSans; src: url(${dmSans}); font-weight: 100 1000; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #eceef1; font-family: DMSans, sans-serif; color: #16171a; padding: 40px;
         display: grid; grid-template-columns: 1.35fr 1fr; grid-template-rows: 1fr 1fr; gap: 20px; }
  .tile { border-radius: 36px; background: #fff; border: 1px solid #dcdfe4; padding: 44px; }
  .hero { grid-row: span 2; display: flex; flex-direction: column; justify-content: space-between; }
  .badge { display: inline-flex; align-items: center; gap: 10px; background: #d9f99d; color: #1a2e05; font-weight: 700;
           font-size: 22px; padding: 10px 20px; border-radius: 999px; align-self: flex-start; }
  .badge::before { content: ''; width: 10px; height: 10px; border-radius: 50%; background: #1a2e05; }
  h1 { font-family: Bricolage; font-weight: 800; font-size: 88px; line-height: 0.95; letter-spacing: -0.045em; }
  .role { margin-top: 18px; font-size: 30px; color: #555a63; }
  .ink { background: #16171a; color: #f4f4f5; border-color: #16171a; display: flex; flex-direction: column; justify-content: space-between; }
  .ink .label { font-family: Bricolage; font-weight: 700; font-size: 34px; }
  .bubble { background: #26282d; border-radius: 22px 22px 22px 8px; padding: 18px 22px; font-size: 22px; color: #f4f4f5; }
  .lime { background: #d9f99d; border-color: #d9f99d; color: #1a2e05; display: flex; flex-direction: column; justify-content: flex-end; }
  .lime p { font-family: Bricolage; font-weight: 800; font-size: 40px; line-height: 1.05; letter-spacing: -0.02em; }
</style></head><body>
  <div class="tile hero">
    <span class="badge">Open to internships</span>
    <div><h1>Piotr Płotast</h1><p class="role">Frontend developer · Poland</p></div>
  </div>
  <div class="tile ink"><span class="label">Ask Byte</span><p class="bubble">Ask me anything about Piotr.</p></div>
  <div class="tile lime"><p>Projects, writing &amp; an AI sidekick</p></div>
</body></html>`;

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const out = new URL('public/og/', root);
await mkdir(out, { recursive: true });
await page.screenshot({ path: fileURLToPath(new URL('default.png', out)) });
await browser.close();
console.log('Wrote public/og/default.png');
