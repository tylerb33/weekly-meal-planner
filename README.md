# weekly-meal-planner

Automation project for weekly family meal planning with sale-aware grocery optimization.

## Current capability

- Browser-rendered scraper for Metcalfe weekly ad page:
  - `scripts/metcalfe_weeklyad_scrape.js`
- Extracts candidate sale item/price pairs from rendered page content.
- Writes outputs to local `out/` directory (gitignored):
  - raw text capture
  - parsed JSON candidates
  - screenshot for debugging

## Requirements

- Node.js 18+
- Chromium installed at `/usr/bin/chromium`

## Setup

```bash
npm install
```

## Run scraper

```bash
node scripts/metcalfe_weeklyad_scrape.js
```

Optional URL argument:

```bash
node scripts/metcalfe_weeklyad_scrape.js "https://www.shopmetcalfes.com/online/metcalfeshilldale/pages/weeklyad"
```

## Notes

- This is intentionally sale-aware (not sale-exclusive) and will feed weekly meal plan generation.
