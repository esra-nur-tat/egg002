// TikTok GDPR export parser'i (user_data.json).
// Yapi: { "Activity": { "Like List": {"ItemList":[{Date, Link}]}, ... } }

export function parseTikTokFile(name, text) {
  const base = name.toLowerCase().split("/").pop();
  if (base !== "user_data.json") return [];

  const data = JSON.parse(text);
  const items = [];
  const push = (type, id, date, extra = {}) =>
    items.push({ platform: "tiktok", type, id, timestamp: date ?? null, ...extra });

  const likeList = data.Activity?.["Like List"]?.ItemList ?? [];
  likeList.forEach((l, i) => push("like", `tt-like-${i}`, l.Date, { link_url: l.Link }));

  const comments = data.Activity?.["Comments"]?.CommentsList ?? [];
  comments.forEach((c, i) =>
    push("comment", `tt-comment-${i}`, c.Date, { text: c.Comment ?? c.comment })
  );

  const searches = data.Activity?.["Searches"]?.SearchList ?? [];
  searches.forEach((s, i) =>
    push("search", `tt-search-${i}`, s.Date, { text: s.SearchTerm })
  );

  const shares = data.Activity?.["Share History"]?.ShareHistoryList ?? [];
  shares.forEach((s, i) =>
    push("share", `tt-share-${i}`, s.Date, { link_url: s.Link, extra: { method: s.Method } })
  );

  return items;
}
