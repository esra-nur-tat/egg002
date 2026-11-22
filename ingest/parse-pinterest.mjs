// Pinterest GDPR/SAR export parser'i.
// Export JSON degil HTML: her klasorde (pins/, search_history/, boards/...) 0001.html var.
// Veri <body> icinde tekrar eden kayit bloklari; tag'leri soyup alanlari regex'le cekiyoruz.

function stripHtml(html) {
  // </style>, </script> sonrasi icerigi al; tag'leri kaldir
  const body = html.slice(html.search(/<\/(style|script)>/i));
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((l) => l.trim());
}

// Pinterest tarih formati: "2026/08/02 14:12:19"
const PIN_TS = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const toIso = (m) => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;

const base = (name) => name.toLowerCase().replace(/\\/g, "/");
const section = (name) => base(name).split("/").slice(-2, -1)[0] ?? "";

export function parsePinterestFile(name, text) {
  const sec = section(name);
  const lines = stripHtml(text);
  const items = [];

  if (sec === "search_history") {
    // Bloklar: "Query type: X" / "Query: ..." / "Time(s) of search: DATE"
    let cur = {};
    for (const line of lines) {
      if (line.startsWith("Query type:")) cur.type = line.slice(11).trim();
      else if (line.startsWith("Query:")) cur.query = line.slice(6).trim();
      else {
        const m = line.match(PIN_TS);
        if (m && cur.query) {
          items.push({
            platform: "pinterest",
            type: "search",
            id: `pin-search:${toIso(m)}:${cur.query}`,
            timestamp: toIso(m),
            text: cur.query,
            extra: { query_type: cur.type },
          });
          cur = {};
        }
      }
    }
  } else if (sec === "pins") {
    // Bloklar pin URL'si ile baslar, "Created at:" ile biter
    let cur = null;
    for (const line of lines) {
      const url = line.match(/^https?:\/\/(?:www\.)?pinterest\.[a-z.]+\/pin\/(\d+)\/?/);
      if (url) {
        cur = { id: url[1], link_url: url[0], extra: {} };
      } else if (cur) {
        const m = line.match(PIN_TS);
        if (line.startsWith("Board Name:")) cur.extra.board = line.slice(11).trim();
        else if (line.startsWith("Title:") && !line.includes("No data")) cur.text = line.slice(6).trim();
        else if (line.startsWith("Is a repin:")) cur.extra.is_repin = line.includes("Yes");
        else if (m) {
          items.push({
            platform: "pinterest",
            type: "post",
            id: `pin:${cur.id}`,
            timestamp: toIso(m),
            text: cur.text,
            link_url: cur.link_url,
            extra: cur.extra,
          });
          cur = null;
        }
      }
    }
  } else if (sec === "boards") {
    // Bloklar: board adi satiri, sonra "Created at: DATE"
    let curName = null;
    for (const line of lines) {
      const m = line.match(PIN_TS);
      if (m && curName) {
        items.push({
          platform: "pinterest",
          type: "other",
          id: `pin-board:${curName}`,
          timestamp: toIso(m),
          text: curName,
          extra: { kind: "board" },
        });
        curName = null;
      } else if (line && !line.includes(":") && !/^Boards|^Subject|^Table|^Pins$|^No data/.test(line)) {
        curName = line;
      }
    }
  } else if (sec === "comments") {
    let cur = {};
    for (const line of lines) {
      const m = line.match(PIN_TS);
      if (line.startsWith("Comment Text:")) cur.text = line.slice(13).trim();
      else if (m && cur.text) {
        items.push({
          platform: "pinterest",
          type: "comment",
          id: `pin-comment:${toIso(m)}`,
          timestamp: toIso(m),
          text: cur.text,
        });
        cur = {};
      }
    }
  } else if (sec === "followers" || sec === "followees") {
    for (const line of lines) {
      const url = line.match(/^https?:\/\/(?:www\.)?pinterest\.[a-z.]+\/([^/]+)\/?$/);
      if (url) {
        items.push({
          platform: "pinterest",
          type: "follow",
          id: `pin-${sec}:${url[1]}`,
          timestamp: null,
          extra: { direction: sec, handle: url[1] },
        });
      }
    }
  }
  // Diger bolumler (ads_blocking, home_feed_data, user_sessions...) simdilik atlanir

  return items;
}
