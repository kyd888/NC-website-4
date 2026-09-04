/**
 * Regenerates public/og-card.png — the image every shared link shows as its
 * thumbnail. It is the NC star on the site's paper background, sized 1200x630
 * because that is what Facebook, iMessage, WhatsApp and X all crop toward.
 *
 * The star is read from the frontend's public folder so there is exactly one
 * copy of the mark in the repo. Run it after changing the logo:
 *
 *   node scripts/make-og-card.mjs
 *
 * Set PLAYWRIGHT_MODULE to an absolute path if playwright lives outside this
 * package (a global install, say) rather than in node_modules.
 *
 * Needs Chromium via Playwright, which is a dev-only dependency of this task —
 * the generated PNG is committed, so a deploy never runs this.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const star = path.resolve(here, "../../frontend/public/nc-star.png");
// Written to both origins: the share page is served by the API but reached
// through the site's domain, so either host may end up resolving the URL.
const outputs = [
  path.resolve(here, "../public/og-card.png"),
  path.resolve(here, "../../frontend/public/og-card.png"),
];

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const dataUri = `data:image/png;base64,${fs.readFileSync(star).toString("base64")}`;

const html = `<!doctype html><meta charset="utf-8" />
<style>
  html,body{margin:0;height:100%}
  body{background:#f2f2ee;display:grid;place-items:center}
  img{width:420px;height:auto;display:block}
</style>
<img src="${dataUri}" alt="" />`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
const png = await page.screenshot({ type: "png" });
await browser.close();

for (const out of outputs) {
  fs.writeFileSync(out, png);
  console.log(`Wrote ${out}`);
}
