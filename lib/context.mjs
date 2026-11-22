// Donem konteksti kurar: "2023H1'deki sen" icin LLM'e verilecek paket.
// Tum platformlardaki o doneme ait kayitlardan temsili ornek + istatistik cikarir.
// Cikti: {period, stats, samples, contextText} — contextText system prompt'a gider.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "my-data");

const MAX_TEXT = 300;       // tek kayit metin limiti
const MAX_PER_KIND = 40;    // tur basina ornek
const MAX_CONTEXT = 12000;  // toplam kontekst karakter limiti (~3-4k token)

export function periods() {
  const set = new Set();
  for (const p of platforms()) {
    for (const f of readdirSync(join(DATA, p))) {
      const m = f.match(/^items-(\d{4}H[12])\.jsonl$/);
      if (m) set.add(m[1]);
    }
  }
  return [...set].sort().reverse();
}

export function platforms() {
  return existsSync(DATA)
    ? readdirSync(DATA, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name)
    : [];
}

export function* iterPeriod(period) {
  for (const p of platforms()) {
    const f = join(DATA, p, `items-${period}.jsonl`);
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { yield { ...JSON.parse(line), _src: p }; } catch { /* atla */ }
    }
  }
}

// Hesap sahibi: tum platformlardaki items.jsonl icinde kind=="profile" kaydi.
// instagram'da personal_information.json'dan gelir; name DM sender'iyla eslesir.
const STOPWORDS = new Set("ve bir bu da de ki ile ben sen o ne mi mu için gibi çok ya var yok daha ama işte şey değil benim senin onu bana sana ona nasıl neden niye evet hayır tamam aynı şimdi sonra önce ama fakat ya da hem değil mi çünkü hani abi yani böyle öyle her hiç en bile".split(" "));
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

// Kendi mesajlarindan yazim tarzi cikarir — kisiligin somut parcasi
export function styleStats(texts) {
  let n = 0, len = 0, lower = 0, emoji = 0;
  const words = {};
  for (const t of texts) {
    if (!t || t.length < 3 || t.startsWith("You sent an attachment") || t.startsWith("Reacted ")) continue;
    n++; len += t.length;
    if (t === t.toLowerCase()) lower++;
    emoji += (t.match(EMOJI_RE) ?? []).length;
    for (const w of t.toLocaleLowerCase("tr").split(/[\s,.!?;:'"()]+/)) {
      if (w.length < 3 || STOPWORDS.has(w)) continue;
      words[w] = (words[w] ?? 0) + 1;
    }
  }
  if (!n) return null;
  const top = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w);
  return {
    sample_count: n,
    avg_len: Math.round(len / n),
    lower_ratio: Math.round((lower / n) * 100),
    emoji_per_msg: +(emoji / n).toFixed(1),
    top_words: top,
  };
}

// Donemden bagimsiz kisilik verisi: profil + reflections + memory notlari
function personalityItems(limit = 18) {
  const out = [];
  for (const p of platforms()) {
    const f = join(DATA, p, "items.jsonl");
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const k = line.match(/"kind":"(reflection|note|profile)"/)?.[1];
      if (!k) continue;
      try {
        const it = JSON.parse(line);
        if (it.text && it.extra?.kind === k) out.push(it);
      } catch { /* atla */ }
      if (out.length >= limit * 4) break; // her platformdan azami limit*4 aday
    }
  }
  return out.slice(0, limit);
}

export function systemPrompt(period, ctx) {
  return (
    `Sen kullanicinin ${period} donemindeki gecmis halisin. Kullanici bugunden sana yaziyor.\n` +
    `Kurallar:\n` +
    `- Birinci tekil kiside, dogal ve samimi konus; kisa paragraflar (2-4 cumle).\n` +
    `- Asagidaki GERCEK verilere dayan: kimlik, yazim tarzi, kisilik notlari, mesaj ornekleri.\n` +
    `- Kisilik notlari ve yazim tarzi sana AIT — konuşurken o tarzi taklit et (kucuk harf, emoji, kelime secimi).\n` +
    `- Veride olmayan seyi uydurma; hatirlamazsan "o donemde buna dair iz yok" de.\n` +
    `- "Kullanici" deme, "sen/gecmis ben" dili kullan. Turkce konus.\n\n` +
    `--- ${period} donemine ait gercek veriler ---\n${ctx}`
  );
}

export function ownerProfile() {
  for (const p of platforms()) {
    const f = join(DATA, p, "items.jsonl");
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.includes('"profile"')) continue;
      try {
        const it = JSON.parse(line);
        if (it.extra?.kind === "profile") return it;
      } catch { /* atla */ }
    }
  }
  return null;
}

export function buildContext(period) {
  const profile = ownerProfile();
  const ownerName = profile?.extra?.name ?? "";
  const stats = { total: 0, by_platform: {}, by_type: {} };
  const buckets = { message: [], post: [], like: [], comment: [], save: [], other: [] };
  const threads = {};

  const own = (it) => {
    if (it._src === "claude") return it.extra?.sender === "human";
    if (it._src === "instagram") {
      if (["post", "comment", "like", "save", "other"].includes(it.type)) return true;
      return !ownerName || it.extra?.sender === ownerName;
    }
    return true;
  };

  const ownTexts = [];
  for (const it of iterPeriod(period)) {
    if (!own(it)) continue;
    stats.total++;
    stats.by_platform[it._src] = (stats.by_platform[it._src] ?? 0) + 1;
    stats.by_type[it.type] = (stats.by_type[it.type] ?? 0) + 1;
    const th = it.extra?.thread ?? it.extra?.conversation_title;
    if (th) threads[th] = (threads[th] ?? 0) + 1;
    if (it.type === "message" && it.text) ownTexts.push(it.text);
    const b = buckets[it.type] ?? buckets.other;
    if (b.length < MAX_PER_KIND && it.text) b.push(it);
  }

  const topThreads = Object.entries(threads).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t} (${n})`);

  const px = profile?.extra ?? {};
  const lines = [
    `# Donem: ${period}`,
    px.name ? `Kisi: ${px.name}${px.username ? ` (@${px.username})` : ""}${px.bio ? ` — bio: ${px.bio}` : ""}` : null,
    `Toplam aktivite: ${stats.total} — ${Object.entries(stats.by_platform).map(([k, v]) => `${k}: ${v}`).join(", ")}`,
    topThreads.length ? `En cok konusulanlar: ${topThreads.join(", ")}` : null,
    ``,
  ];

  const style = styleStats(ownTexts);
  if (style) {
    lines.push(
      `## Yazim tarzin (mesaj istatistigi)`,
      `ortalama ${style.avg_len} karakter, %${style.lower_ratio} tumu kucuk harf, mesaj basina ${style.emoji_per_msg} emoji`,
      `sik kullandigin kelimeler: ${style.top_words.join(", ")}`,
      ``,
    );
  }

  const persona = personalityItems();
  if (persona.length) {
    lines.push("## Kisilik notlari (hafiza + AI reflection'lari)");
    for (const it of persona) {
      const t = (it.text ?? "").slice(0, 400);
      lines.push(`- ${t}${it.text.length > 400 ? "…" : ""}`);
    }
    lines.push("");
  }

  const kinds = [
    ["message", "Yazdigin mesajlardan ornekler"],
    ["post", "Paylasimlarin / gonderilerin"],
    ["comment", "Yorumlarin"],
    ["like", "Begenilerin"],
    ["save", "Kaydettiklerin"],
    ["other", "Diger (notlar, aramalar, olusumlar)"],
  ];

  for (const [k, baslik] of kinds) {
    if (!buckets[k].length) continue;
    lines.push(`## ${baslik}`);
    for (const it of buckets[k]) {
      const t = (it.text ?? "").slice(0, MAX_TEXT);
      const d = it.timestamp?.slice(0, 10) ?? "?";
      lines.push(`- [${d}] ${t}${it.text?.length > MAX_TEXT ? "…" : ""}`);
    }
    lines.push("");
  }

  let contextText = lines.filter((l) => l !== null).join("\n");
  if (contextText.length > MAX_CONTEXT) contextText = contextText.slice(0, MAX_CONTEXT) + "\n…(kisaltildi)";

  return { period, stats, samples: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])), contextText };
}
