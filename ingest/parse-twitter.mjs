// X (Twitter) export parser'i.
// Arsiv dosyalari JSON degil JS: "window.YTD.tweets.part0 = [...]".
// Prefix'i soyup JSON.parse ediyoruz.

function stripYtdPrefix(text) {
  const idx = text.indexOf("=");
  if (idx === -1) throw new Error("YTD dosyasinda '=' bulunamadı");
  const json = text.slice(idx + 1).trim().replace(/;\s*$/, "");
  return JSON.parse(json);
}

function isoDate(twitterDate) {
  // "Mon Oct 02 12:34:56 +0000 2023" -> ISO
  const d = new Date(twitterDate);
  return isNaN(d) ? twitterDate : d.toISOString();
}

export function parseTwitterFile(name, text) {
  const base = name.toLowerCase().split("/").pop();
  const items = [];

  if (base.startsWith("tweets")) {
    for (const { tweet } of stripYtdPrefix(text)) {
      items.push({
        platform: "twitter",
        type: "post",
        id: tweet.id_str,
        timestamp: isoDate(tweet.created_at),
        text: tweet.full_text,
        extra: {
          retweet_count: tweet.retweet_count,
          favorite_count: tweet.favorite_count,
          is_retweet: tweet.full_text?.startsWith("RT @") ?? false,
        },
      });
    }
  } else if (base.startsWith("like")) {
    for (const { like } of stripYtdPrefix(text)) {
      items.push({
        platform: "twitter",
        type: "like",
        id: like.tweetId,
        timestamp: like.date ? isoDate(like.date) : null,
        target_id: like.tweetId,
        text: like.fullText ?? undefined,
      });
    }
  } else if (base.startsWith("follower") || base.startsWith("following")) {
    const kind = base.startsWith("follower") ? "follower" : "following";
    for (const entry of stripYtdPrefix(text)) {
      const rec = entry[kind] ?? entry;
      items.push({
        platform: "twitter",
        type: "follow",
        id: rec.accountId ?? rec.userLink ?? base,
        timestamp: null,
        link_url: rec.userLink,
        extra: { direction: kind },
      });
    }
  }
  // Diger dosyalar (dm.js, ad-engagements...) simdilik atlanir -> manifest'te sayilir
  return items;
}
