#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const PAGE_URL = process.argv[2] || 'https://www.shopmetcalfes.com/online/metcalfeshilldale/pages/weeklyad';
const OUT_DIR = path.join(process.cwd(), 'data');

function normalizeProducts(products, sourceUrl) {
  return products.map((p) => ({
    id: p.id,
    name: p.name || '',
    price: p.price_text ? `$${String(p.price_text).replace(/^\$/, '')}` : null,
    priceText: p.price_text || null,
    validFrom: p.valid_from_timestamp || null,
    validTo: p.valid_to_timestamp || null,
    imageUrl: p.image_url || null,
    sourceUrl,
  }));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });

  const productApiUrls = new Set();
  page.on('response', async (res) => {
    const u = res.url();
    if (/dam\.flippenterprise\.net\/flyerkit\/publication\/\d+\/products/i.test(u)) {
      productApiUrls.add(u);
    }
  });

  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);
  await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(5000);

  await browser.close();

  if (!productApiUrls.size) {
    throw new Error('Could not detect products API URL from weekly ad page');
  }

  // Prefer URL containing display_type=all if present
  const selectedUrl =
    [...productApiUrls].find((u) => /display_type=all/i.test(u)) || [...productApiUrls][0];

  const res = await fetch(selectedUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch products API: ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error('Unexpected products API payload (expected array)');
  }

  const normalized = normalizeProducts(raw, selectedUrl);

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const snapshotPath = path.join(OUT_DIR, `specials-${stamp}.json`);
  const latestPath = path.join(OUT_DIR, 'latest-specials.json');

  const payload = {
    generatedAt: now.toISOString(),
    pageUrl: PAGE_URL,
    sourceApiUrl: selectedUrl,
    itemCount: normalized.length,
    items: normalized,
  };

  fs.writeFileSync(snapshotPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2));

  console.log(JSON.stringify({
    ok: true,
    itemCount: normalized.length,
    sourceApiUrl: selectedUrl,
    snapshotPath,
    latestPath,
  }, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
