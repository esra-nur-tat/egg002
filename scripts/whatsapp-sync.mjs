#!/usr/bin/env node
// WhatsApp gecmisini QR ile baglanan, YALNIZCA OKUYAN bir WhatsApp Web oturumuyla ceker.
// Hicbir mesaj gondermez. Bitince cihaz baglantisini kaldirir (logout) ve oturum dosyalarini siler.
//   node scripts/whatsapp-sync.mjs           # QR ac, gecmisi cek, cikis yap
//   node scripts/whatsapp-sync.mjs --keep    # oturumu acik birak (tekrar QR istemez)
// Cikti: my-data/_raw/whatsapp/wa-sync-<tarih>.jsonl  (her satir bir mesaj)
// QR: /tmp/egg2-wa/qr.html (tarayicida acilir, kendini yeniler)
// Not: Baileys resmi olmayan bir istemcidir; WhatsApp hesaplari kisitlayabilir (dusuk risk, sadece okuma).

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import QRCode from "qrcode";
import * as B from "@whiskeysockets/baileys";

const makeWASocket = B.makeWASocket ?? B.default;
const { useMultiFileAuthState, Browsers, DisconnectReason, fetchLatestBaileysVersion } = B;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "my-data", "_raw", "whatsapp");
const AUTH = join(OUT_DIR, ".auth");
const QR_DIR = "/tmp/egg2-wa";
const KEEP = process.argv.includes("--keep");
const IDLE_MS = 90_000;      // son gecmis parcasindan sonra bu kadar sessizlik -> bitti
const MAX_MS = 20 * 60_000;  // en fazla 20 dk

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(QR_DIR, { recursive: true });

const noop = () => {};
const dbg = process.env.WA_DEBUG ? (lvl) => (...a) => console.log(lvl, JSON.stringify(a).slice(0, 300)) : () => noop;
const logger = { level: process.env.WA_DEBUG ? "debug" : "silent", trace: noop, debug: noop, info: dbg("info"), warn: dbg("warn"), error: dbg("error"), fatal: dbg("fatal"), child: () => logger };

const messages = new Map(); // key.id -> kayit
const names = new Map();    // jid -> isim
const chats = new Map();    // jid -> isim
let current = null, timerStarted = false, fails = 0;
let historyChunks = 0, lastHistory = 0, opened = false, qrOpened = false, finishing = false;
const started = Date.now();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function unwrap(m) {
  let msg = m;
  for (let i = 0; i < 4 && msg; i++) {
    const inner = msg.ephemeralMessage?.message ?? msg.viewOnceMessage?.message ?? msg.viewOnceMessageV2?.message
      ?? msg.documentWithCaptionMessage?.message ?? msg.editedMessage?.message?.protocolMessage?.editedMessage;
    if (!inner) break;
    msg = inner;
  }
  return msg;
}

function textOf(msg) {
  return msg?.conversation ?? msg?.extendedTextMessage?.text ?? msg?.imageMessage?.caption ?? msg?.videoMessage?.caption
    ?? msg?.documentMessage?.caption ?? msg?.buttonsResponseMessage?.selectedDisplayText ?? msg?.listResponseMessage?.title ?? null;
}

function add(m) {
  const k = m?.key;
  if (!k?.id || !k.remoteJid || k.remoteJid === "status@broadcast") return;
  const msg = unwrap(m.message);
  if (!msg || msg.protocolMessage || msg.reactionMessage || msg.senderKeyDistributionMessage && Object.keys(msg).length === 1) return;
  const type = Object.keys(msg).find((t) => t !== "messageContextInfo") ?? "unknown";
  const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp ?? 0) * 1000;
  const author = k.fromMe ? null : (k.participant ?? k.remoteJid);
  if (author && m.pushName && !names.has(author)) names.set(author, m.pushName);
  messages.set(k.id, {
    id: k.id,
    chat: k.remoteJid,
    group: k.remoteJid.endsWith("@g.us"),
    from_me: Boolean(k.fromMe),
    author,
    push_name: k.fromMe ? undefined : m.pushName ?? undefined,
    ts: ts ? new Date(ts).toISOString() : null,
    type,
    text: textOf(msg),
  });
}

function addContact(c) {
  const n = c?.name ?? c?.notify ?? c?.verifiedName;
  if (c?.id && n) names.set(c.id, n);
  if (c?.lid && n) names.set(c.lid, n);
}

function save() {
  const nameOf = (jid) => chats.get(jid) || names.get(jid) || (jid ? jid.split("@")[0] : null);
  const rows = [...messages.values()].filter((r) => r.ts).sort((a, b) => a.ts.localeCompare(b.ts))
    .map((r) => ({ ...r, chat_name: nameOf(r.chat), author_name: r.from_me ? null : (names.get(r.author) || r.push_name || nameOf(r.author)) }));
  const f = join(OUT_DIR, `wa-sync-${new Date().toISOString().slice(0, 10)}.jsonl`);
  writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { f, n: rows.length, mine: rows.filter((r) => r.from_me).length, chats: new Set(rows.map((r) => r.chat)).size, from: rows[0]?.ts, to: rows.at(-1)?.ts };
}

async function finish(why) {
  if (finishing) return;
  finishing = true;
  const sock = current;
  const s = save();
  log(`BİTTİ (${why}): ${s.n} mesaj (${s.mine} senin), ${s.chats} sohbet, ${s.from?.slice(0, 10)} → ${s.to?.slice(0, 10)}`);
  log(`dosya: ${s.f}`);
  writeFileSync(join(QR_DIR, "qr.html"), page(`<h2>Tamam ✓</h2><p>${s.n} mesaj çekildi. Bu sayfayı kapatabilirsin.</p>`));
  if (!KEEP) {
    try { await sock.logout(); log("cihaz bağlantısı kaldırıldı (telefonda 'Bağlı cihazlar'dan düştü)"); } catch { log("logout başarısız; telefondan 'Bağlı cihazlar'dan elle kaldırabilirsin"); }
    rmSync(AUTH, { recursive: true, force: true });
  }
  setTimeout(() => process.exit(0), 1500);
}

const page = (body) => `<!doctype html><meta charset="utf-8"><title>WhatsApp bağla</title>
<style>body{font:16px -apple-system,sans-serif;background:#fff8f1;color:#1e1b17;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}
img{width:320px;height:320px;image-rendering:pixelated;border:12px solid #fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.12)}</style>
<div>${body}</div>
<script>setTimeout(()=>location.reload(),4000)</script>`;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH);
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch { /* varsayilan surum */ }
  const sock = makeWASocket({
    ...(version && { version }),
    auth: state,
    logger,
    // masaustu istemcisi gibi baglanir. syncFullHistory: true su an sunucu tarafindan reddediliyor (428).
    browser: Browsers.macOS("Desktop"),
    shouldSyncHistoryMessage: () => true,
    markOnlineOnConnect: false,
    printQRInTerminal: false,
  });

  current = sock;
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      await QRCode.toFile(join(QR_DIR, "qr.png"), qr, { width: 640, margin: 2 });
      writeFileSync(join(QR_DIR, "qr.html"), page(`<h2>WhatsApp → Ayarlar → Bağlı cihazlar → Cihaz bağla</h2>
        <img src="qr.png?t=${Date.now()}"><p>Kod ~20 sn'de bir yenilenir, sayfa kendini günceller.</p>`));
      log("QR hazır: /tmp/egg2-wa/qr.html");
      if (!qrOpened) { qrOpened = true; execFile("open", [join(QR_DIR, "qr.html")]); }
    }
    if (connection === "open") {
      opened = true; fails = 0;
      log("BAĞLANDI — geçmiş senkronizasyonu bekleniyor (birkaç dakika sürebilir)");
      writeFileSync(join(QR_DIR, "qr.html"), page(`<h2>Bağlandı ✓</h2><p>Geçmiş çekiliyor, birkaç dakika sürebilir. WhatsApp'ı telefonda açık ve internete bağlı tut.</p>`));
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        if (finishing) return;
        log("oturum kapatıldı (telefondan kaldırıldı)"); rmSync(AUTH, { recursive: true, force: true });
        if (messages.size) return finish("oturum kapandı");
        process.exit(1);
      }
      if (finishing) return;
      // eslesmeden sonra 515 (yeniden baslat) normaldir; ust uste basarisizlikta dur, sunucuyu dovme
      fails = connection === "close" && !opened ? fails + 1 : 0;
      if (fails > 4) { log(`bağlantı ${fails} kez üst üste kapandı (kod ${code}); duruyorum`); if (messages.size) return finish("bağlantı koptu"); process.exit(1); }
      log(`bağlantı kapandı (kod ${code}), 3 sn sonra yeniden bağlanılıyor…`);
      setTimeout(start, 3000);
    }
  });

  sock.ev.on("messaging-history.set", ({ chats: cs = [], contacts = [], messages: ms = [], syncType, progress, isLatest }) => {
    historyChunks++; lastHistory = Date.now();
    for (const c of cs) if (c.id && (c.name || c.subject)) chats.set(c.id, c.name ?? c.subject);
    for (const c of contacts) addContact(c);
    for (const m of ms) add(m);
    log(`geçmiş parçası #${historyChunks}: +${ms.length} mesaj (toplam ${messages.size})${progress != null ? ` · ilerleme %${progress}` : ""}${syncType != null ? ` · tür ${syncType}` : ""}${isLatest ? " · son" : ""}`);
  });
  sock.ev.on("messages.upsert", ({ messages: ms }) => { for (const m of ms) add(m); });
  sock.ev.on("contacts.upsert", (cs) => cs.forEach(addContact));
  sock.ev.on("contacts.update", (cs) => cs.forEach(addContact));
  sock.ev.on("chats.upsert", (cs) => cs.forEach((c) => c.id && (c.name || c.subject) && chats.set(c.id, c.name ?? c.subject)));
  sock.ev.on("groups.upsert", (gs) => gs.forEach((g) => g.id && g.subject && chats.set(g.id, g.subject)));

  // yeniden baglanmalarda tek zamanlayici
  if (timerStarted) return;
  timerStarted = true;
  const timer = setInterval(() => {
    if (finishing) return clearInterval(timer);
    const now = Date.now();
    if (opened && historyChunks && now - lastHistory > IDLE_MS) { clearInterval(timer); finish(`${IDLE_MS / 1000} sn yeni geçmiş gelmedi`); }
    else if (now - started > MAX_MS) { clearInterval(timer); finish("süre doldu"); }
  }, 5000);
}

process.on("SIGINT", () => { const s = save(); log(`durduruldu, ${s.n} mesaj kaydedildi: ${s.f}`); process.exit(0); });
if (existsSync(AUTH)) log("kayıtlı oturum bulundu, QR'sız bağlanılıyor…");
start();
