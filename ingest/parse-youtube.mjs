// YouTube izleme gecmisi parser'i (Google Takeout).
// HTML: "izleme geçmişi.html" / "watch-history.html" — her kayit bir "outer-cell" blogu:
//   <a href="…watch?v=ID">Baslik</a> adlı videoyu izlediniz<br><a href="…/channel/…">Kanal</a><br>20 Kas 2026 22:48:50 GMT+03:00
// JSON: "watch-history.json" — [{header, title, titleUrl, subtitles:[{name,url}], time}]
// Reklam ve anket kayitlari atlanir.

const AY = {
  oca: 1, şub: 2, mar: 3, nis: 4, may: 5, haz: 6, tem: 7, ağu: 8, eyl: 9, eki: 10, kas: 11, ara: 12,
  jan: 1, feb: 2, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const TR_TS = /(\d{1,2}) (\p{L}{3})\p{L}* (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT([+-]\d{2}):?(\d{2})/u;
const p2 = (n) => String(n).padStart(2, "0");

const unescape = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;|&emsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

function toIso(text) {
  const m = text.match(TR_TS);
  if (m) {
    const mon = AY[m[2].toLocaleLowerCase("tr")];
    if (mon) {
      const d = new Date(`${m[3]}-${p2(mon)}-${p2(m[1])}T${m[4]}:${m[5]}:${m[6]}${m[7]}:${m[8]}`);
      if (!isNaN(d)) return d.toISOString();
    }
  }
  // Ingilizce Takeout: "Nov 20, 2026, 10:48:50 PM GMT+03:00"
  const en = text.match(/\p{L}{3} \d{1,2}, \d{4}, [\d:]+\s?[AP]M[^<]*/u)?.[0];
  const d = en ? new Date(en.replace(/\u202f/g, " ").replace(/GMT([+-]\d{2}):(\d{2})/, "GMT$1$2")) : null;
  return d && !isNaN(d) ? d.toISOString() : undefined;
}

function item({ url, title, channel, channelUrl, timestamp, music }) {
  const id = url.match(/[?&]v=([\w-]+)/)?.[1] ?? url;
  const removed = !title || title === url; // silinmis/gizli video: baslik yerine URL gelir
  return {
    platform: "youtube",
    type: "view",
    id: `${id}:${timestamp ?? ""}`,
    timestamp,
    text: removed ? undefined : title,
    link_url: url,
    extra: { channel, channel_url: channelUrl, ...(music && { product: "music" }) },
  };
}

export function parseYoutubeFile(name, text) {
  const items = [];

  if (/\.json$/i.test(name)) {
    for (const r of JSON.parse(text)) {
      if (!r.titleUrl || r.details?.some((d) => /Ads/i.test(d.name ?? ""))) continue;
      items.push(item({
        url: r.titleUrl,
        title: (r.title ?? "").replace(/^Watched | adlı videoyu izlediniz$/g, ""),
        channel: r.subtitles?.[0]?.name,
        channelUrl: r.subtitles?.[0]?.url,
        timestamp: r.time,
        music: r.header === "YouTube Music",
      }));
    }
    return items;
  }

  for (const cell of text.split('<div class="outer-cell').slice(1)) {
    const body = cell.match(/content-cell[^>]*mdl-typography--body-1">([\s\S]*?)<\/div>/)?.[1];
    if (!body) continue;
    const links = [...body.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)];
    const video = links.find((l) => /youtube\.com\/watch|youtu\.be\//.test(l[1]));
    // reklam olarak izlenenler alt bilgide isaretlidir: "Ayrıntılar: Google Reklamlar'dan" / "Details: From Google Ads"
    const caption = cell.slice(cell.indexOf("mdl-typography--caption"));
    if (!video || /Google Reklamlar|From Google Ads/.test(caption)) continue;
    const ch = links.find((l) => /\/channel\/|\/@|\/user\//.test(l[1]));
    items.push(item({
      url: unescape(video[1]),
      title: unescape(video[2]).trim(),
      channel: ch ? unescape(ch[2]).trim() : undefined,
      channelUrl: ch ? unescape(ch[1]) : undefined,
      timestamp: toIso(unescape(body)),
      music: /mdl-typography--title">YouTube Music/.test(cell),
    }));
  }
  return items;
}
