// Platform dedektoru: export icindeki dosya isimlerinden hangi servis oldugunu anlar.
// Tarayicida calisir (saf JS, Node bagimliligi yok). ZIP acimi fflate ile yapilir
// (frontend katmani unzip edip dosya listesini {name, text} olarak gecirir).

const SIGNATURES = [
  {
    platform: "twitter",
    // X arsivi: data/tweets.js, data/like.js -> "window.YTD.tweets.part0 = [...]"
    match: (names) => names.some((n) => /(^|\/)tweets?\.js$/.test(n)),
  },
  {
    platform: "instagram",
    // Meta export (yeni format): your_instagram_activity/ veya media/posts_*.json
    // Eski format: content/posts_*.json, likes/liked_posts.json
    match: (names) =>
      names.some((n) => n.includes("your_instagram_activity")) ||
      names.some((n) => /(^|\/)posts_\d+\.json$/.test(n)) ||
      names.some((n) => /(^|\/)liked_posts\.json$/.test(n)),
  },
  {
    platform: "youtube",
    // Google Takeout: "izleme geçmişi.html" / "watch-history.html|json" (dosya adi NFD gelebilir)
    match: (names) =>
      names.some((n) => /(^|\/)(izleme geçmişi|watch-history)\.(html|json)$/.test(n.normalize("NFC"))),
  },
  {
    platform: "pinterest",
    // SAR export: HTML dosyalari; klasor isimleri veya "Subject Access Request" icerigi
    match: (names, getText) =>
      names.some((n) => /(^|\/)start_here\.html$/.test(n)) ||
      names.some((n) => /(^|\/)search_history\/.*\.html$/.test(n)) ||
      (getText && /Subject Access Request Data/i.test(getText(names.find((n) => n.endsWith(".html")) ?? ""))),
  },
  {
    platform: "whatsapp",
    // WhatsApp chat export: "WhatsApp Chat with X.txt" veya _chat.txt
    match: (names) =>
      names.some((n) => /whatsapp chat.*\.txt$/i.test(n)) ||
      names.some((n) => /(^|\/)_chat\.txt$/.test(n)) ||
      names.some((n) => /(^|\/)wa-sync.*\.jsonl$/.test(n)),
  },
  {
    platform: "claude",
    // Claude.ai export: conversations.json (+ memories.json, projects.json...)
    match: (names) =>
      names.some((n) => /(^|\/)conversations.*\.json$/.test(n)) ||
      names.some((n) => /(^|\/)memories.*\.json$/.test(n)),
  },
  {
    platform: "tiktok",
    // TikTok GDPR export: user_data.json (Activity/Profile bolumleri)
    match: (names) => names.some((n) => /(^|\/)user_data\.json$/.test(n)),
  },
];

/**
 * @param {string[]} fileNames
 * @param {(name: string) => string} [getText] - opsiyonel; dosya icerigi gerektiren imzalar icin
 */
export function detectPlatform(fileNames, getText) {
  const names = fileNames.map((n) => n.toLowerCase());
  for (const sig of SIGNATURES) {
    if (sig.match(names, getText)) return sig.platform;
  }
  return null;
}
