// Lokal ingest runner: my-data/_raw/<platform>/ altindaki export dosyalarini
// normalize items.jsonl + manifest.json uretimi icin okur.
// Kullanim: node scripts/ingest-local.mjs [instagram|pinterest|claude|all]
//
// Cikti: my-data/<platform>/{manifest.json, items.jsonl, items-YYYYHn.jsonl}
// (items 6 aylik donemlere de bolunur — Ayna karsilastirmasi icin)

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestExport } from "../ingest/index.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const RAW = join(ROOT, "my-data/_raw");
const OUT = join(ROOT, "my-data");
const TEXT_EXTS = new Set([".json", ".jsonl", ".html", ".txt", ".js", ".md"]);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function loadExport(dir) {
  const files = [];
  for (const path of walk(dir)) {
    if (!TEXT_EXTS.has(extname(path))) continue; // media/binary atla
    try {
      const text = readFileSync(path, "utf8");
      files.push({ name: relative(dir, path), text });
    } catch {
      // okunamayan (binary) dosyayi atla
    }
  }
  return files;
}

// 6 aylik bucket: "2024H1" | "2024H2"
export function halfYear(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return "unknown";
  return `${d.getUTCFullYear()}H${d.getUTCMonth() < 6 ? 1 : 2}`;
}

export function runIngest(dirName) {
  const dir = join(RAW, dirName);
  const files = loadExport(dir);
  if (!files.length) {
    console.log(`${dirName}: dosya bulunamadi (${dir})`);
    return null;
  }
  const { manifest, items, itemsJsonl, skipped } = ingestExport(files);
  const platform = manifest.platforms[0].platform;

  // 6 aylik donemlere bol
  const buckets = {};
  for (const it of items) {
    const b = halfYear(it.timestamp);
    (buckets[b] ??= []).push(it);
  }
  manifest.platforms[0].counts_by_period = Object.fromEntries(
    Object.entries(buckets).map(([k, v]) => [k, v.length])
  );
  manifest.platforms[0].files = [`${files.length} ham dosya okundu`];

  const outDir = join(OUT, platform);
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) {
    if (/^items-.+\.jsonl$/.test(f)) try { unlinkSync(join(outDir, f)) } catch {}
  }
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(outDir, "items.jsonl"), itemsJsonl);
  for (const [period, list] of Object.entries(buckets)) {
    writeFileSync(
      join(outDir, `items-${period}.jsonl`),
      list.map((i) => JSON.stringify(i)).join("\n") + "\n"
    );
  }

  console.log(`${dirName} -> ${platform}: ${items.length} kayit, donemler: ${manifest.platforms[0].counts_by_period && JSON.stringify(manifest.platforms[0].counts_by_period)}`);
  if (skipped.length) console.log(`  atlanan ${skipped.length} dosya (ornek: ${skipped[0]?.slice(0, 80)})`);
  return { platform, count: items.length };
}

const arg = process.argv[2] ?? "all";
const dirs = arg === "all"
  ? readdirSync(RAW).filter((d) => statSync(join(RAW, d)).isDirectory() || d.endsWith(""))
  : [arg];

for (const d of dirs) {
  try {
    runIngest(d);
  } catch (err) {
    console.error(`${d}: ${err.message}`);
  }
}
