#!/usr/bin/env node
/**
 * screenshot.mjs — headless screenshots of a preview page (tier 3).
 *
 * Usage:
 *   node screenshot.mjs <servedRoot> <pagePath> [options]
 *     <servedRoot>  directory to serve (the dir containing the app + mockups/)
 *     <pagePath>    path under that root, e.g. mockups/preview.html
 *   --out <file>          output PNG (default mockups/screenshots/preview.png under servedRoot)
 *   --width n --height n  viewport (default 390x844 — phone)
 *   --wait-for <css>      wait for a selector before capturing
 *   --delay <ms>          extra settle time (default 250)
 *   --full-page           capture full page height
 *   --param k=v           extra query param (repeatable), e.g. --param ref_id=001...
 *
 * Requires puppeteer, resolved from the CURRENT PROJECT (npm i -D puppeteer) or from
 * $PUPPETEER_DIR. Without it, exits with code 2 and a message — fall back to opening
 * the preview in a browser via serve.mjs (tier 2).
 */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { startServer } from './serve.mjs';

function resolvePuppeteer() {
  const bases = [process.cwd(), process.env.PUPPETEER_DIR].filter(Boolean);
  for (const base of bases) {
    try { return createRequire(join(resolve(base), 'package.json'))('puppeteer'); }
    catch { /* try next */ }
  }
  return null;
}

const args = process.argv.slice(2);
const positional = [];
const opts = { width: 390, height: 844, delay: 250, params: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opts.out = args[++i];
  else if (a === '--width') opts.width = Number(args[++i]);
  else if (a === '--height') opts.height = Number(args[++i]);
  else if (a === '--wait-for') opts.waitFor = args[++i];
  else if (a === '--delay') opts.delay = Number(args[++i]);
  else if (a === '--full-page') opts.fullPage = true;
  else if (a === '--param') opts.params.push(args[++i]);
  else positional.push(a);
}
const [servedRoot, pagePath] = positional;
if (!servedRoot || !pagePath) {
  console.error('usage: node screenshot.mjs <servedRoot> <pagePath> [--out f] [--width n --height n] [--wait-for sel] [--delay ms] [--full-page] [--param k=v]');
  process.exit(1);
}

const puppeteer = resolvePuppeteer();
if (!puppeteer) {
  console.error('puppeteer not installed (checked project cwd and $PUPPETEER_DIR).');
  console.error('Fall back to tier 2: node <skill-dir>/scripts/serve.mjs ' + servedRoot + '  then open the preview in your browser.');
  process.exit(2);
}

const { server, port } = await startServer(servedRoot);
const url = new URL(`http://localhost:${port}/${pagePath.replace(/^\/+/, '')}`);
url.searchParams.set('clean', '1');
for (const kv of opts.params) {
  const eq = kv.indexOf('=');
  if (eq < 1) { console.error(`--param must be k=v, got "${kv}"`); process.exit(1); }
  url.searchParams.set(kv.slice(0, eq), kv.slice(eq + 1));
}

const out = opts.out || join(servedRoot, 'mockups/screenshots/preview.png');
await mkdir(dirname(out), { recursive: true });

// The preview page hosts the app in an IFRAME — selectors must be searched in every frame.
async function waitForSelectorInAnyFrame(page, selector, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const frame of page.frames()) {
      const found = await frame.$(selector).catch(() => null);
      if (found) return;
    }
    if (Date.now() > deadline) throw new Error(`selector "${selector}" not found in any frame within ${timeout}ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 2 });
  page.on('console', (m) => {
    const t = m.text();
    if ((/\[pulsar-mock\]/.test(t) && m.type() === 'warning') || m.type() === 'error') console.error('PAGE:', t);
  });
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.goto(url.href, { waitUntil: 'networkidle0', timeout: 30000 });
  if (opts.waitFor) await waitForSelectorInAnyFrame(page, opts.waitFor, 15000);
  await new Promise((r) => setTimeout(r, opts.delay));
  await page.screenshot({ path: out, fullPage: !!opts.fullPage });
  console.log('screenshot written:', resolve(out));
} finally {
  await browser.close();
  server.close();
}
