#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const PROFILE_PATH = path.join(ROOT, 'config', 'meal_profile.json');
const PROFILE_EXAMPLE_PATH = path.join(ROOT, 'config', 'meal_profile.example.json');
const DATA_PATH = path.join(ROOT, 'data', 'latest-specials.json');
const OUT_DIR = path.join(ROOT, 'out');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function runSpecialsSync() {
  const r = spawnSync('npm', ['run', 'specials:sync'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) {
    throw new Error('specials:sync failed');
  }
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function bestSaleMatch(ingredient, items) {
  const qTokens = tokenize(ingredient);
  if (!qTokens.length) return null;

  let best = null;
  for (const item of items) {
    const name = (item.name || '').toLowerCase();
    const nameTokens = new Set(tokenize(name));
    const tokenHits = qTokens.reduce((acc, t) => acc + (nameTokens.has(t) ? 1 : 0), 0);
    const score = tokenHits / qTokens.length;
    if (score < 0.5) continue;
    if (!best || score > best.score) {
      best = { score, item };
    }
  }
  return best?.item || null;
}

function pickMeals(profile) {
  const all = profile.favorites || [];
  const mealsPerWeek = profile.mealsPerWeek || 5;
  const favoritesPerWeek = Math.min(profile.favoritesPerWeek || 2, all.length);

  // deterministic for now: rotate by week number
  const weekNumber = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
  const start = weekNumber % (all.length || 1);
  const rotated = all.length ? [...all.slice(start), ...all.slice(0, start)] : [];

  const selected = [];
  for (let i = 0; i < Math.min(mealsPerWeek, rotated.length); i++) {
    selected.push(rotated[i]);
  }

  // ensure at least favoritesPerWeek present (already true from selected subset)
  return selected;
}

function buildShoppingList(meals, staples, specialsItems) {
  const ingredientMap = new Map();

  function addIngredient(name, sourceMeal) {
    const key = name.trim().toLowerCase();
    if (!key) return;
    if (!ingredientMap.has(key)) {
      const sale = bestSaleMatch(name, specialsItems);
      ingredientMap.set(key, {
        name,
        meals: new Set([sourceMeal]),
        sale,
      });
    } else {
      ingredientMap.get(key).meals.add(sourceMeal);
    }
  }

  for (const m of meals) {
    for (const ing of m.ingredients || []) addIngredient(ing, m.name);
  }

  for (const s of staples || []) addIngredient(s, 'Weekly staple');

  return [...ingredientMap.values()].map((x) => ({
    name: x.name,
    usedIn: [...x.meals],
    sale: x.sale
      ? {
          name: x.sale.name,
          price: x.sale.price,
          validTo: x.sale.validTo,
        }
      : null,
  }));
}

function saveOutput(payload) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(OUT_DIR, `weekly-plan-${ts}.json`);
  const mdPath = path.join(OUT_DIR, `weekly-plan-${ts}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const lines = [];
  lines.push(`# Weekly Meal Plan (${payload.generatedAt.split('T')[0]})`);
  lines.push('');
  lines.push(`- Household: ${payload.profile.household}`);
  lines.push(`- Meals: ${payload.profile.mealsPerWeek} dinners`);
  lines.push(`- Budget target: $${payload.profile.budgetPerWeek}`);
  lines.push(`- Max prep time: ${payload.profile.maxPrepMinutes} min`);
  lines.push('');
  lines.push('## Meals');
  payload.meals.forEach((m, idx) => {
    lines.push(`${idx + 1}. **${m.name}**`);
    lines.push(`   - Ingredients: ${m.ingredients.join(', ')}`);
  });
  lines.push('');
  lines.push('## Shopping List (sale-aware)');
  for (const i of payload.shoppingList) {
    if (i.sale?.price) {
      lines.push(`- ${i.name} — SALE MATCH: ${i.sale.name} (${i.sale.price})`);
    } else {
      lines.push(`- ${i.name}`);
    }
  }

  fs.writeFileSync(mdPath, lines.join('\n') + '\n');
  return { jsonPath, mdPath };
}

function main() {
  if (!fs.existsSync(PROFILE_PATH)) {
    console.error(`Missing ${PROFILE_PATH}. Copy ${PROFILE_EXAMPLE_PATH} to meal_profile.json and edit.`);
    process.exit(1);
  }

  runSpecialsSync();

  const profile = loadJson(PROFILE_PATH);
  const specials = loadJson(DATA_PATH);
  const specialsItems = specials.items || [];

  const meals = pickMeals(profile);
  const shoppingList = buildShoppingList(meals, profile.weeklyStaples || [], specialsItems);

  const payload = {
    generatedAt: new Date().toISOString(),
    profile: {
      household: profile.household,
      mealsPerWeek: profile.mealsPerWeek,
      budgetPerWeek: profile.budgetPerWeek,
      maxPrepMinutes: profile.maxPrepMinutes,
      sendSchedule: profile.sendSchedule,
    },
    specialsSource: specials.sourceApiUrl,
    meals,
    shoppingList,
  };

  const saved = saveOutput(payload);
  console.log(JSON.stringify({ ok: true, ...saved, meals: meals.length, shoppingItems: shoppingList.length }, null, 2));
}

main();
