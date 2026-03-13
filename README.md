# weekly-meal-planner

Automation project for weekly family meal planning with sale-aware grocery optimization.

## Current capability

### 1) Sync weekly specials once
- Script: `scripts/sync_specials.js`
- Opens the weekly ad page in a browser-rendered context
- Detects the underlying Flipp products API URL
- Saves normalized results to:
  - `data/latest-specials.json`
  - `data/specials-<timestamp>.json`

### 2) Query local specials cache instantly
- Script: `scripts/query_specials.js`
- Reads `data/latest-specials.json`
- Returns best fuzzy matches for a requested item name

## Requirements

- Node.js 18+
- Chromium installed at `/usr/bin/chromium`

## Setup

```bash
npm install
```

## Commands

Sync latest specials:

```bash
npm run specials:sync
```

Query an item price locally:

```bash
npm run specials:query -- "Bob's Red Mill Extra Thick Rolled Oats"
```

Run weekly planner (sync + meals + shopping list):

```bash
cp config/meal_profile.example.json config/meal_profile.json
cp config/favorites.example.json config/favorites.json
# edit both config files for your household
npm run weekly:run
```

Run fully automated weekly email flow (uses bws secrets):

```bash
npm run weekly:auto
```

This will:
1) run `weekly:run`
2) read latest plan markdown from `out/`
3) email it via Gmail SMTP using `GMAIL_USERNAME` + `GMAIL_APP_PASSWORD` from `bws`

Example output includes:
Run full weekly pipeline (sync + meal plan + shopping list):

```bash
cp config/meal_profile.example.json config/meal_profile.json
# edit config/meal_profile.json with your household preferences
npm run weekly:run
```

The weekly runner writes files to `out/`:
- `weekly-plan-<timestamp>.json`
- `weekly-plan-<timestamp>.md`

Example query output includes:
- matching item names
- price
- validity dates

## Legacy script

The original exploratory scraper is still available:
- `scripts/metcalfe_weeklyad_scrape.js`

## Notes

- Sale-aware, not sale-exclusive.
- Intended to feed weekly meal ideas + consolidated grocery list generation.
