#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const query = (process.argv[2] || '').trim().toLowerCase();
if (!query) {
  console.error('Usage: node scripts/query_specials.js "search terms"');
  process.exit(1);
}

const latestPath = path.join(process.cwd(), 'data', 'latest-specials.json');
if (!fs.existsSync(latestPath)) {
  console.error('No local specials cache found. Run: npm run specials:sync');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
const items = payload.items || [];

const tokens = query.split(/\s+/).filter(Boolean);
const minScore = Math.max(1, Math.ceil(tokens.length * 0.6));

const matches = items
  .map((item) => {
    const name = (item.name || '').toLowerCase();
    const tokenScore = tokens.reduce((acc, token) => acc + (name.includes(token) ? 1 : 0), 0);
    const exactBoost = name.includes(query) ? 100 : 0;
    const score = exactBoost + tokenScore;
    return { ...item, score, tokenScore };
  })
  .filter((item) => item.tokenScore >= minScore)
  .sort((a, b) => b.score - a.score || (a.name || '').localeCompare(b.name || ''))
  .slice(0, 10);

console.log(JSON.stringify({
  query,
  generatedAt: payload.generatedAt,
  totalItems: items.length,
  matches,
}, null, 2));
