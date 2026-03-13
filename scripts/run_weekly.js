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
  if (r.status !== 0) throw new Error('specials:sync failed');
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
    const nameTokens = new Set(tokenize(item.name || ''));
    const hits = qTokens.reduce((acc, t) => acc + (nameTokens.has(t) ? 1 : 0), 0);
    const score = hits / qTokens.length;
    if (score < 0.5) continue;
    if (!best || score > best.score) best = { score, item };
  }
  return best?.item || null;
}

function pickFavoriteMeals(profile) {
  const all = profile.favorites || [];
  const take = Math.min(profile.favoritesPerWeek || 2, all.length);
  if (!take) return [];

  const weekNumber = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
  const start = weekNumber % all.length;
  const rotated = [...all.slice(start), ...all.slice(0, start)];
  return rotated.slice(0, take).map(m => ({ ...m, source: 'favorite' }));
}

function generateSaleMeals(count, specialsItems, existingNames = []) {
  const taken = new Set(existingNames.map(n => n.toLowerCase()));
  const proteins = specialsItems.filter(i => {
    const n = (i.name || '').toLowerCase();
    return /(salmon|chicken|beef|pork|shrimp|turkey|tilapia|trout|catfish)/.test(n);
  });

  const templates = [
    {
      mkName: (p) => `${p} Rice Bowl`,
      ingredients: (p) => [p, 'frozen rice', 'cucumber', 'shredded carrots', 'frozen edamame']
    },
    {
      mkName: (p) => `Sheet Pan ${p} + Veggies`,
      ingredients: (p) => [p, 'broccoli', 'baby potatoes', 'olive oil', 'garlic']
    },
    {
      mkName: (p) => `${p} Wrap Night`,
      ingredients: (p) => [p, 'tortillas', 'shredded lettuce', 'tomato', 'shredded cheese']
    }
  ];

  const meals = [];
  for (const item of proteins) {
    const proteinName = item.name
      .replace(/^fresh\s+/i, '')
      .replace(/^frozen\s+/i, '')
      .replace(/fillets?/i, '')
      .trim();

    for (const t of templates) {
      const name = t.mkName(proteinName);
      if (taken.has(name.toLowerCase())) continue;
      taken.add(name.toLowerCase());
      meals.push({ name, ingredients: t.ingredients(proteinName), source: 'generated' });
      if (meals.length >= count) return meals;
    }
  }

  while (meals.length < count) {
    const idx = meals.length + 1;
    const fallbackName = `Quick Weeknight Dinner ${idx}`;
    meals.push({
      name: fallbackName,
      ingredients: ['protein of choice', 'frozen veggies', 'rice or pasta', 'sauce of choice'],
      source: 'generated'
    });
  }

  return meals;
}

function pickMeals(profile, specialsItems) {
  const mealsPerWeek = profile.mealsPerWeek || 5;
  const favorites = pickFavoriteMeals(profile);
  const remaining = Math.max(0, mealsPerWeek - favorites.length);
  const generated = generateSaleMeals(remaining, specialsItems, favorites.map(m => m.name));
  return [...favorites, ...generated].slice(0, mealsPerWeek);
}

function buildShoppingList(meals, staples, specialsItems) {
  const ingredientMap = new Map();

  function addIngredient(name, sourceMeal) {
    const key = name.trim().toLowerCase();
    if (!key) return;
    if (!ingredientMap.has(key)) {
      ingredientMap.set(key, {
        name,
        meals: new Set([sourceMeal]),
        sale: bestSaleMatch(name, specialsItems),
      });
    } else {
      ingredientMap.get(key).meals.add(sourceMeal);
    }
  }

  for (const m of meals) for (const ing of m.ingredients || []) addIngredient(ing, m.name);
  for (const s of staples || []) addIngredient(s, 'Weekly staple');

  return [...ingredientMap.values()].map((x) => ({
    name: x.name,
    usedIn: [...x.meals],
    sale: x.sale
      ? { name: x.sale.name, price: x.sale.price, validTo: x.sale.validTo }
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
  lines.push('## Meals');
  payload.meals.forEach((m, idx) => {
    lines.push(`${idx + 1}. **${m.name}**`);
    lines.push(`   - Ingredients: ${m.ingredients.join(', ')}`);
  });
  lines.push('');
  lines.push('## Shopping List');
  payload.shoppingList.forEach((i) => {
    const saleTag = i.sale?.price ? ' (Sale Item)' : '';
    lines.push(`- ${i.name}${saleTag}`);
  });

  fs.writeFileSync(mdPath, lines.join('\n') + '\n');
  return { jsonPath, mdPath };
}

function main() {
  if (!fs.existsSync(PROFILE_PATH)) {
    console.error(`Missing ${PROFILE_PATH}. Copy ${PROFILE_EXAMPLE_PATH} and edit.`);
    process.exit(1);
  }

  runSpecialsSync();
  const profile = loadJson(PROFILE_PATH);
  const specials = loadJson(DATA_PATH);
  const specialsItems = specials.items || [];
  const meals = pickMeals(profile, specialsItems);
  const shoppingList = buildShoppingList(meals, profile.weeklyStaples || [], specialsItems);

  const payload = {
    generatedAt: new Date().toISOString(),
    profile: {
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
