// Tüm data/ doğrulaması: JSON Schema + ALTIN KURAL (verbatim kanit) kontrolu.
// Kullanım: node scripts/validate.mjs
// CI'da calisir; kanıtsız veya bozuk veri commit'i reddeder.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const loadJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const loadSchema = (name) => loadJson(join(ROOT, "schemas", name));

const schemas = {
  entry: ajv.compile(loadSchema("entry.schema.json")),
  persona: ajv.compile(loadSchema("persona.schema.json")),
  scale: ajv.compile(loadSchema("scale.schema.json")),
  mirror: ajv.compile(loadSchema("mirror-report.schema.json")),
  socialItem: ajv.compile(loadSchema("social-item.schema.json")),
  socialManifest: ajv.compile(loadSchema("social-manifest.schema.json")),
};

let errors = [];
let checked = { files: 0, entries: 0, quotes: 0 };

function fail(file, msg) {
  errors.push(`${relative(ROOT, file)}: ${msg}`);
}

function validateSchema(file, data, validator, what) {
  if (!validator(data)) {
    fail(file, `${what} şema hatası: ${ajv.errorsText(validator.errors)}`);
    return false;
  }
  return true;
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".json") || e.name.endsWith(".jsonl")) yield p;
  }
}

// --- 1. Kayit dosyalari (entries) ------------------------------------------
const entryIndex = new Map(); // id -> haystack (verbatim arama metni)

function haystack(entry) {
  return [
    entry.text ?? "",
    entry.letter_to_future_self ?? "",
    entry.answers?.what_affected ?? "",
    entry.answers?.values_action ?? "",
  ].join("\n");
}

for (const file of walk(join(ROOT, "data/entries"))) {
  checked.files++;
  const doc = loadJson(file);
  const list = Array.isArray(doc) ? doc : doc.entries;
  if (!Array.isArray(list)) {
    fail(file, "Beklenen: entries dizisi");
    continue;
  }
  for (const entry of list) {
    checked.entries++;
    if (validateSchema(file, entry, schemas.entry, "entry")) {
      if (entryIndex.has(entry.id)) fail(file, `tekrar eden id: ${entry.id}`);
      entryIndex.set(entry.id, haystack(entry));
    }
  }
}

// --- 2. Persona, ölçekler ---------------------------------------------------
for (const [dir, validator, what] of [
  ["data/personas", schemas.persona, "persona"],
  ["data/scales", schemas.scale, "scale"],
]) {
  for (const file of walk(join(ROOT, dir))) {
    checked.files++;
    validateSchema(file, loadJson(file), validator, what);
  }
}

// --- 3. Ayna raporlari + ALTIN KURAL ---------------------------------------
for (const file of walk(join(ROOT, "data/mirror"))) {
  checked.files++;
  const report = loadJson(file);
  if (!validateSchema(file, report, schemas.mirror, "mirror-report")) continue;

  for (const [oi, obs] of report.observations.entries()) {
    for (const [ei, ev] of obs.evidence.entries()) {
      checked.quotes++;
      const hay = entryIndex.get(ev.entry_id);
      if (hay === undefined) {
        fail(file, `observations[${oi}].evidence[${ei}]: entry_id '${ev.entry_id}' data/entries içinde yok`);
      } else if (!hay.includes(ev.quote)) {
        fail(
          file,
          `ALTIN KURAL ihlali: observations[${oi}].evidence[${ei}]: ` +
            `alıntı entry metninde verbatim bulunamadı: "${ev.quote.slice(0, 60)}..."`
        );
      }
    }
  }
}

// --- 4. Sosyal veri (opsiyonel, my-data/ veya data/social/) -----------------
for (const file of walk(join(ROOT, "data/social"))) {
  checked.files++;
  if (basename(file) === "manifest.json") {
    validateSchema(file, loadJson(file), schemas.socialManifest, "social-manifest");
  } else if (file.endsWith("items.jsonl")) {
    readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .forEach((line, i) => {
        try {
          validateSchema(`${file}#L${i + 1}`, JSON.parse(line), schemas.socialItem, "social-item");
        } catch {
          fail(`${file}#L${i + 1}`, "geçersiz JSON satırı");
        }
      });
  }
}

// --- Sonuc ------------------------------------------------------------------
console.log(`Kontrol: ${checked.files} dosya, ${checked.entries} kayıt, ${checked.quotes} kanıt alıntısı`);
if (errors.length) {
  console.error(`\n${errors.length} hata:`);
  errors.forEach((e) => console.error(`  x ${e}`));
  process.exit(1);
}
console.log("Tüm doğrulamalar geçti.");
