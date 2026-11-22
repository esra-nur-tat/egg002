#!/usr/bin/env node
// Localhost API + statik sunucu. Veri cihazdan cikmaz — sadece 127.0.0.1 dinler.
//
//   node scripts/serve.mjs [port]          # varsayilan 8787
//
// API:
//   GET /api/stats                        -> platform bazli manifest ozetleri
//   GET /api/items?platform=&type=&q=&from=&to=&period=&limit=&offset=
//                                         -> {total, items:[...]}
//   GET /api/item?id=<tam-id>             -> tek kayit
//   GET /api/periods                      -> mevcut 6 aylik donemler
//   GET /api/context?period=2025H2        -> o donem icin kurulan kontekst (debug)
//   GET /api/recap?period=2025H1          -> donem ozeti sayfasi verisi (lib/recap.mjs)
//   POST /api/chat  {period, messages:[{role,content}]}  -> gecmis versiyonla sohbet
//        (persona: lib/persona.mjs; kartlar `node scripts/build-persona.mjs` ile uretilir)
// Statik:
//   /            -> web/ingest.html
//   /ingest/*    -> ingest modulleri (tarayici ESM import icin)
//   /vendor/fflate.js -> node_modules/fflate/esm/browser.js

import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext, periods, systemPrompt } from "../lib/context.mjs";
import { chat } from "../lib/llm.mjs";
import { personaPrompt, periodMeta } from "../lib/persona.mjs";
import { loadRecap } from "../lib/recap.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* .env yoksa sorun degil */ }
const DATA = join(ROOT, "my-data");
const PORT = Number(process.argv[2] ?? 8787);

const MIME = {
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

// --- my-data okuyucular (query.mjs ile ayni mantik) ---

const platforms = () =>
  existsSync(DATA)
    ? readdirSync(DATA, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
        .map((d) => d.name)
    : [];

function* iterItems(platform, period) {
  const file = period
    ? join(DATA, platform, `items-${period}.jsonl`)
    : join(DATA, platform, "items.jsonl");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* atla */ }
  }
}

function apiStats(res) {
  const out = [];
  for (const p of platforms()) {
    const mf = join(DATA, p, "manifest.json");
    if (!existsSync(mf)) continue;
    const m = JSON.parse(readFileSync(mf, "utf8"));
    const pf = m.platforms?.[0] ?? {};
    out.push({
      platform: p,
      total: pf.item_count,
      by_type: pf.counts_by_type,
      by_period: pf.counts_by_period,
      date_range: pf.date_range,
    });
  }
  return send(res, 200, out);
}

function apiItems(res, u) {
  const q = u.searchParams;
  const targets = q.get("platform") ? [q.get("platform")] : platforms();
  const period = q.get("period") || null;
  const type = q.get("type");
  const text = q.get("q")?.toLocaleLowerCase("tr");
  const from = q.get("from") ? Date.parse(q.get("from")) : -Infinity;
  const to = q.get("to") ? Date.parse(q.get("to")) : Infinity;
  const id = q.get("id");
  const limit = Math.min(Number(q.get("limit") ?? 100), 1000);
  const offset = Number(q.get("offset") ?? 0);

  const items = [];
  let total = 0;
  outer: for (const p of targets) {
    for (const it of iterItems(p, period)) {
      if (id && it.id !== id) continue;
      if (type && it.type !== type) continue;
      const t = it.timestamp ? Date.parse(it.timestamp) : null;
      if (t === null || t < from || t > to) continue;
      if (text) {
        const hay = [it.text, it.link_url, it.id, JSON.stringify(it.extra ?? {})]
          .filter(Boolean).join("\n").toLocaleLowerCase("tr");
        if (!hay.includes(text)) continue;
      }
      if (total++ >= offset && items.length < limit) items.push(it);
      if (id) break outer;
    }
  }
  return send(res, 200, { total, offset, limit, items });
}

// --- statik ---

const STATIC_ROOTS = [
  [/^\/ingest\//, join(ROOT, "ingest")],
  [/^\/web\//, join(ROOT, "web")],
];

function serveStatic(res, path) {
  if (path === "/" || path === "/index.html") path = "/web/app.html";
  if (path === "/vendor/fflate.js") {
    return sendFile(res, join(ROOT, "node_modules/fflate/esm/browser.js"));
  }
  if (path.startsWith("/vendor/fonts/")) {
    const f = path.slice("/vendor/fonts/".length);
    if (!/^[\w.-]+\.woff2$/.test(f)) return send(res, 403, { error: "forbidden" });
    const dir = f.startsWith("material-symbols") ? "node_modules/material-symbols"
      : f.startsWith("dm-sans") ? "node_modules/@fontsource/dm-sans/files" : "node_modules/@fontsource/space-mono/files";
    return sendFile(res, join(ROOT, dir, f));
  }
  // kendi Instagram fotograflarim (kapak gorseli) — yalnizca export'un media/ klasorunden
  if (path.startsWith("/media/instagram/")) {
    const base = join(DATA, "_raw", "instagram", "media");
    const full = normalize(join(base, decodeURIComponent(path.slice("/media/instagram/".length))));
    if (!full.startsWith(base + "/") || !/\.(jpe?g|png|webp)$/i.test(full)) return send(res, 403, { error: "forbidden" });
    return sendFile(res, full);
  }
  for (const [re, base] of STATIC_ROOTS) {
    if (re.test(path)) {
      const rel = path.replace(re, "");
      const full = normalize(join(base, rel));
      if (!full.startsWith(base)) return send(res, 403, { error: "forbidden" });
      return sendFile(res, full);
    }
  }
  return send(res, 404, { error: "not found", path });
}

function sendFile(res, full) {
  if (!existsSync(full) || !statSync(full).isFile()) {
    return send(res, 404, { error: "not found" });
  }
  res.writeHead(200, { "content-type": MIME[extname(full)] ?? "application/octet-stream" });
  res.end(readFileSync(full));
}

function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const OPENER = "(Sohbet şimdi açıldı. Karşındaki kişi senin gelecekteki halin, henüz bir şey yazmadı. İlk mesajı sen at: kısa, kendi tarzında, o sırada aklında olan somut bir şeyle; ona bir de soru sor.)";

async function apiChat(req, res) {
  const body = await new Promise((ok) => {
    let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d));
  });
  const { period, opener } = JSON.parse(body || "{}");
  let { messages = [] } = JSON.parse(body || "{}");
  // sohbet acilinca ilk mesaji gecmis sen atar; bu yonerge istemcide gizli tutulur
  if (opener) messages = [{ role: "user", content: OPENER }];
  if (!period || !messages.length) return send(res, 400, { error: "period ve messages gerekli" });
  // persona karti varsa kisilik prompt'u; yoksa ham kontekstli eski prompt'a duser
  const persona = personaPrompt(period);
  const system = persona ?? systemPrompt(period, buildContext(period).contextText);
  const out = await chat({ system, messages: messages.slice(-30) }, { temperature: 0.6, max_tokens: 2500 });
  return send(res, 200, { ...out, persona: Boolean(persona), ...(opener && { opener: OPENER }) });
}

createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  try {
    if (u.pathname === "/api/stats") return apiStats(res);
    if (u.pathname === "/api/items" || u.pathname === "/api/item") return apiItems(res, u);
    if (u.pathname === "/api/periods") return send(res, 200, periodMeta());
    if (u.pathname === "/api/context") {
      const c = buildContext(u.searchParams.get("period") ?? "");
      return send(res, 200, { period: c.period, stats: c.stats, contextText: c.contextText });
    }
    if (u.pathname === "/api/recap") {
      const r = loadRecap(u.searchParams.get("period") ?? "");
      return r ? send(res, 200, r) : send(res, 404, { error: "bu dönemin özeti henüz üretilmedi" });
    }
    if (u.pathname === "/api/chat" && req.method === "POST") return await apiChat(req, res);
    return serveStatic(res, u.pathname);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`yerel API: http://127.0.0.1:${PORT}`);
  console.log(`ingest UI: http://127.0.0.1:${PORT}/`);
  console.log(`ornekler:  /api/stats | /api/items?platform=instagram&type=post&limit=5`);
});
