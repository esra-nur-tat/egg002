// WhatsApp chat export parser'i (_chat.txt / "WhatsApp Chat with X.txt").
// Iki satir formati bilinir:
//   iOS:     [25/10/2025, 21:34:56] Ahmet: merhaba
//   Android: 25/10/2025, 21:34 - Ahmet: merhaba
// Sistem satirlari (sifreleme bildirimi, media omit) ayri isaretlenir.

const LINE_PATTERNS = [
  // iOS: [DD/MM/YYYY, HH:MM:SS]
  /^\[(\d{1,2})[./](\d{1,2})[./](\d{2,4}), (\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?(AM|PM|am|pm))?\]\s?(.*)$/,
  // Android: DD/MM/YYYY, HH:MM -
  /^(\d{1,2})[./](\d{1,2})[./](\d{2,4}), (\d{1,2}):(\d{2})(?:\s?(AM|PM|am|pm))?\s?-\s?(.*)$/,
];

function toIso(m) {
  let [, d, mo, y, h, mi, , ampm] = m;
  if (y.length === 2) y = "20" + y;
  let hour = parseInt(h, 10);
  if (ampm) {
    const pm = ampm.toLowerCase() === "pm";
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${mi}:00`;
}

const SYSTEM_HINTS = [
  "end-to-end encrypted",
  "ucundan uca şifrelen",
  "mesajlar ve aramalar",
  "<media omitted>",
  "medya dahil edilmedi",
  "you deleted this message",
  "bu mesajı sildiniz",
  "this message was deleted",
];

// scripts/whatsapp-sync.mjs ciktisi: her satir {id, chat, chat_name, group, from_me, author_name, ts, type, text}
function parseSyncJsonl(text) {
  const items = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r.ts || (!r.text && r.type === "messageHistoryNotice")) continue;
    items.push({
      platform: "whatsapp",
      type: "message",
      id: `wa:${r.id}`,
      timestamp: r.ts,
      text: r.text ?? undefined,
      extra: {
        thread: r.chat_name ?? r.chat,
        sender: r.from_me ? undefined : r.author_name ?? undefined,
        from_me: r.from_me,
        group: r.group || undefined,
        media: r.text ? undefined : r.type,
      },
    });
  }
  return items;
}

export function parseWhatsappFile(name, text) {
  const base = name.toLowerCase().split("/").pop();
  if (/^wa-sync.*\.jsonl$/.test(base)) return parseSyncJsonl(text);
  if (!/\.txt$/.test(base)) return [];

  const items = [];
  let cur = null;
  let seq = 0;

  const flush = () => {
    if (cur) items.push(cur);
    cur = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    let parsed = null;
    for (const p of LINE_PATTERNS) {
      const m = line.match(p);
      if (m) { parsed = { iso: toIso(m), rest: m[m.length - 1] }; break; }
    }

    if (!parsed) {
      // Cok satirli mesajin devami
      if (cur && line.trim()) cur.text = (cur.text ?? "") + "\n" + line.trim();
      continue;
    }

    flush();
    const rest = parsed.rest;
    const colonIdx = rest.indexOf(": ");
    const isSystem = colonIdx === -1 || SYSTEM_HINTS.some((h) => rest.toLowerCase().includes(h));

    cur = {
      platform: "whatsapp",
      type: isSystem ? "other" : "message",
      id: `wa:${base}:${seq++}`,
      timestamp: parsed.iso,
      text: rest,
      extra: {
        chat_file: base,
        sender: !isSystem && colonIdx > -1 ? rest.slice(0, colonIdx) : undefined,
        system: isSystem || undefined,
      },
    };
  }
  flush();
  return items;
}
