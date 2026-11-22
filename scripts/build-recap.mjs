#!/usr/bin/env node
// Donem ozetlerini uretir (my-data/_persona/<period>.recap.json). Persona kartlari hazir olmali.
//   node scripts/build-recap.mjs            # eksikler
//   node scripts/build-recap.mjs --force    # hepsi
//   node scripts/build-recap.mjs 2025H1     # tek donem

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
try { process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env")); } catch { /* .env yok */ }

const { periods } = await import("../lib/context.mjs");
const { buildRecap, loadRecap } = await import("../lib/recap.mjs");

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

for (const p of periods().sort().reverse()) {
  if (only.length && !only.includes(p)) continue;
  if (!force && !only.length && loadRecap(p)) { console.log(`${p}: var, atlandı`); continue; }
  try {
    const r = await buildRecap(p);
    console.log(r ? `${p}: tamam — "${r.baslik}" · insan: ${r.person?.name ?? "-"}` : `${p}: persona yok, atlandı`);
  } catch (err) {
    console.error(`${p}: HATA ${err.message}`);
  }
}
