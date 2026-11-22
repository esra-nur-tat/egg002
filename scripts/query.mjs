#!/usr/bin/env node
// my-data/ altindaki normalize kayitlari sorgular — ajansal "API" katmani.
// Kullanim:
//   node scripts/query.mjs --platform instagram --type message --q "kahve"
//   node scripts/query.mjs --platform claude --from 2026-06-01 --to 2026-11-30
//   node scripts/query.mjs --stats                        # platform/period ozeti
//   node scripts/query.mjs --platform instagram --type post --limit 20
//   node scripts/query.mjs --id "<tam-id>"               # tek kayit getir
//
// Tum filtreler AND lenir. Cikti: JSONL (her satir bir kayit) — pipe'lanabilir.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "my-data");

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--stats") opt.stats = true;
  else if (a.startsWith("--")) opt[a.slice(2)] = args[++i];
}

const limit = Number(opt.limit ?? 50);
const from = opt.from ? new Date(opt.from).getTime() : -Infinity;
const to = opt.to ? new Date(opt.to).getTime() : Infinity;

function* iterItems(platform) {
  const file = join(DATA_DIR, platform, "items.jsonl");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* bozuk satir atla */ }
  }
}

function platforms() {
  return readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name);
}

if (opt.stats) {
  for (const p of platforms()) {
    const mFile = join(DATA_DIR, p, "manifest.json");
    if (existsSync(mFile)) {
      const m = JSON.parse(readFileSync(mFile, "utf8"));
      const pf = m.platforms?.[0] ?? {};
      console.log(JSON.stringify({ platform: p, total: pf.item_count, by_type: pf.counts_by_type, by_period: pf.counts_by_period }));
    }
  }
  process.exit(0);
}

const targets = opt.platform ? [opt.platform] : platforms();
let found = 0;

for (const p of targets) {
  for (const it of iterItems(p)) {
    if (opt.id && it.id !== opt.id) continue;
    if (opt.type && it.type !== opt.type) continue;
    const t = it.timestamp ? new Date(it.timestamp).getTime() : null;
    if (t === null || t < from || t > to) continue;
    if (opt.q) {
      const q = opt.q.toLocaleLowerCase("tr");
      const hay = [it.text, it.link_url, it.id, JSON.stringify(it.extra ?? {})]
        .filter(Boolean).join("\n").toLocaleLowerCase("tr");
      if (!hay.includes(q)) continue;
    }
    console.log(JSON.stringify(it));
    if (++found >= limit) { console.error(`-- limit ${limit}'e ulasildi --`); process.exit(0); }
  }
}
if (!found) console.error("eslesen kayit yok");
