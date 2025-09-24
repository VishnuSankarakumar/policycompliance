// server/src/unifier.ts
import { Hypothesis } from './types';
import path from 'path';
import fs from 'fs';

type Seed = { canonical: Record<string, string[]>, units: Record<string, string[]> };

// Resolve to repo-root/tools/seed-variables.json no matter where we run from
const seedPathCandidates = [
  // when running with ts-node: __dirname = server/src
  path.resolve(__dirname, '..', '..', 'tools', 'seed-variables.json'),
  // when running built code: __dirname = server/dist
  path.resolve(__dirname, '..', '..', 'tools', 'seed-variables.json')
];

let seedPath = seedPathCandidates.find(p => fs.existsSync(p));
if (!seedPath) {
  // final fallback: try cwd/tools
  const cwdPath = path.resolve(process.cwd(), 'tools', 'seed-variables.json');
  if (fs.existsSync(cwdPath)) seedPath = cwdPath;
}
if (!seedPath) {
  throw new Error(
    `seed-variables.json not found. Expected at one of:\n` +
    seedPathCandidates.concat(path.resolve(process.cwd(), 'tools', 'seed-variables.json')).join('\n')
  );
}

const seed: Seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const canonicalList = Object.keys(seed.canonical);

/** Build bigrams for a string (lowercased, alnum only) */
function bigrams(s: string): string[] {
  const t = (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const parts = t.split(/\s+/).filter(Boolean);
  const grams: string[] = [];
  for (const p of parts) {
    if (p.length === 1) grams.push(p);
    for (let i = 0; i < p.length - 1; i++) grams.push(p.slice(i, i + 2));
  }
  return grams.length ? grams : [t];
}

/** Dice coefficient 0..1 using bigrams */
function dice(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  const bag = new Map<string, number>();
  for (const x of A) bag.set(x, (bag.get(x) ?? 0) + 1);
  let overlap = 0;
  for (const x of B) {
    const v = bag.get(x);
    if (v && v > 0) { overlap++; bag.set(x, v - 1); }
  }
  return (2 * overlap) / (A.length + B.length || 1);
}

/** Find best fuzzy match in target list */
function findBestMatch(main: string, targets: string[]) {
  let best = { target: targets[0] ?? '', rating: 0 };
  for (const t of targets) {
    const r = dice(main, t);
    if (r > best.rating) best = { target: t, rating: r };
  }
  return { bestMatch: best };
}

function canonicalizeVarName(name: string): string {
  // exact alias hit
  for (const [canon, alts] of Object.entries(seed.canonical)) {
    if (alts.includes(name)) return canon;
  }
  // fuzzy to known canonical keys
  const { bestMatch } = findBestMatch(name, canonicalList);
  if (bestMatch.rating >= 0.6) return bestMatch.target;
  return name;
}

export function unifyVariables(hyps: Hypothesis[]): Hypothesis[] {
  return hyps.map(h => ({
    ...h,
    canonicalVars: Array.from(new Set(h.variables.map(v => canonicalizeVarName(v))))
  }));
}
