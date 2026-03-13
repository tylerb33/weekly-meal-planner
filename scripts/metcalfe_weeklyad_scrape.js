#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const TARGET_URL = process.argv[2] || 'https://www.shopmetcalfes.com/online/metcalfeshilldale/pages/weeklyad';
const OUT_DIR = process.argv[3] || path.join(process.cwd(), 'out');

function uniq(arr) {
  return [...new Set(arr)];
}

function extractCandidates(text) {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => l.length <= 160);

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const priceMatch = line.match(/\$\s?\d{1,3}(?:[.,]\d{2})?/);
    if (!priceMatch) continue;

    let item = '';
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const cand = lines[j];
      if (/\$\s?\d/.test(cand)) continue;
      if (/^(weekly ad|specials|shop|home|login|add to cart|view all)$/i.test(cand)) continue;
      if (cand.length < 3) continue;
      item = cand;
      break;
    }

    if (item) {
      out.push({ item, price: priceMatch[0].replace(/\s+/g, ''), rawPriceLine: line });
    }
  }

  // de-dupe by item+price
  const seen = new Set();
  const deduped = [];
  for (const c of out) {
    const key = `${c.item}__${c.price}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 2200 } });
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);

  // Gather visible text from top page + frames
  const frameTexts = [];
  for (const f of page.frames()) {
    try {
      const t = await f.evaluate(() => document.body ? document.body.innerText : '');
      if (t && t.trim()) frameTexts.push(t);
    } catch (_) {
      // ignore inaccessible frame failures
    }
  }

  const allText = uniq(frameTexts).join('\n\n===== FRAME =====\n\n');
  const candidates = extractCandidates(allText).slice(0, 120);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const txtPath = path.join(OUT_DIR, `metcalfe-weeklyad-${ts}.txt`);
  const jsonPath = path.join(OUT_DIR, `metcalfe-weeklyad-${ts}.json`);
  const pngPath = path.join(OUT_DIR, `metcalfe-weeklyad-${ts}.png`);

  fs.writeFileSync(txtPath, allText);
  fs.writeFileSync(jsonPath, JSON.stringify({
    url: TARGET_URL,
    scrapedAt: new Date().toISOString(),
    candidates
  }, null, 2));

  await page.screenshot({ path: pngPath, fullPage: true });
  await browser.close();

  console.log(JSON.stringify({
    ok: true,
    url: TARGET_URL,
    txtPath,
    jsonPath,
    screenshot: pngPath,
    candidateCount: candidates.length,
    sample: candidates.slice(0, 10)
  }, null, 2));
})().catch(err => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
