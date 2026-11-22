#!/usr/bin/env node
// Her donem icin persona kartini uretir (my-data/_persona/<period>.json).
// Eskiden yeniye calisir: her donem, oncekilerin ozetini "gecmis" olarak alir.
//   node scripts/build-persona.mjs            # eksik olanlar
//   node scripts/build-persona.mjs --force    # hepsini yeniden
//   node scripts/build-persona.mjs 2025H2     # tek donem

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
try { process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env")); } catch { /* .env yok */ }

const { periods } = await import("../lib/context.mjs");
const { distill, loadPersona } = await import("../lib/persona.mjs");

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

for (const p of periods().sort()) {
  if (only.length && !only.includes(p)) continue;
  if (!force && !only.length && loadPersona(p)) { console.log(`${p}: var, atlandı`); continue; }
  try {
    const r = await distill(p);
    console.log(r.thin ? `${p}: veri çok az (${r.own}), persona yok` : `${p}: tamam — kart ${r.card.length} kr, ${r.samples.length} örnek, şimdi=${r.now}, yaş=${r.age}`);
  } catch (err) {
    console.error(`${p}: HATA ${err.message}`);
  }
}
