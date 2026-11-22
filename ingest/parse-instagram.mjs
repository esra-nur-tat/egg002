// Instagram (Meta "verilerini indir") export parser'i — yeni (2023+) format.
// Yapi: your_instagram_activity/{media,likes,comments,messages,saved,...}
// Ayrica eski format (content/posts_*.json, likes/liked_posts.json) desteklenir.
// Not: Meta metinleri UTF-8->Latin-1 mojibake'li verir; fixMojibake ile duzeltilir.

import { fixMojibake } from "./fix-text.mjs";

const ts = (t) => (typeof t === "number" ? new Date(t * 1000).toISOString() : String(t));
const msToIso = (t) => (typeof t === "number" ? new Date(t).toISOString() : String(t));
const base = (name) => name.toLowerCase().split("/").pop();

// label_values listesinden {Label: value} cikar (yeni Meta formati)
function labelMap(rec) {
  const out = {};
  for (const lv of rec.label_values ?? []) {
    if (lv.label) out[lv.label] = lv.value ?? lv.href;
    if (lv.title === "Owner") {
      const name = lv.dict?.[0]?.dict?.find?.((d) => d.label === "Name")?.value;
      if (name) out.Owner = name;
    }
  }
  return out;
}

export function parseInstagramFile(name, text) {
  const b = base(name);
  const items = [];
  const data = JSON.parse(text);
  const fix = fixMojibake;

  // --- Kendi gonderileri: media/posts_*.json veya eski content/posts_*.json ---
  if (/^posts_\d+\.json$/.test(b) || b === "posts.json") {
    const list = Array.isArray(data) ? data : (data.ig_own_posts ?? []);
    for (const post of list) {
      for (const m of post.media ?? [{}]) {
        items.push({
          platform: "instagram",
          type: "post",
          id: m.uri ?? `${b}:${post.creation_timestamp}`,
          timestamp: ts(post.creation_timestamp ?? m.creation_timestamp),
          text: fix(post.title ?? m.title ?? "") || undefined,
          media_url: m.uri,
        });
      }
    }
  }

  // --- Hikayeler ---
  else if (b === "stories.json") {
    const list = Array.isArray(data) ? data : (data.ig_stories ?? []);
    for (const s of list) {
      items.push({
        platform: "instagram",
        type: "post",
        id: s.uri ?? `story:${s.creation_timestamp}`,
        timestamp: ts(s.creation_timestamp),
        media_url: s.uri,
        extra: { kind: "story" },
      });
    }
  }

  // --- Begenilen postlar (yeni: [{timestamp, label_values:[{label:URL...}]}], eski: {likes_media_likes}) ---
  else if (b === "liked_posts.json") {
    const list = Array.isArray(data) ? data : (data.likes_media_likes ?? []);
    for (const like of list) {
      if (like.label_values) {
        const m = labelMap(like);
        items.push({
          platform: "instagram",
          type: "like",
          id: m.URL ?? `like:${like.timestamp}`,
          timestamp: ts(like.timestamp),
          link_url: m.URL,
          text: fix(m.Caption ?? "") || undefined,
          extra: { liked_account: fix(m.Owner ?? "") },
        });
      } else {
        const sd = like.string_list_data?.[0] ?? {};
        items.push({
          platform: "instagram",
          type: "like",
          id: sd.href ?? like.title,
          timestamp: ts(sd.timestamp),
          link_url: sd.href,
          extra: { liked_account: fix(like.title ?? "") },
        });
      }
    }
  }

  // --- Kaydedilenler ---
  else if (b === "saved_posts.json") {
    const list = Array.isArray(data) ? data : (data.saved_saved_media ?? []);
    for (const s of list) {
      const m = labelMap(s) ?? {};
      const sd = s.string_map_data?.["Saved on"] ?? s.string_list_data?.[0] ?? {};
      items.push({
        platform: "instagram",
        type: "save",
        id: m["Shared Post's Link"] ?? sd.href ?? `save:${s.timestamp ?? sd.timestamp}`,
        timestamp: ts(sd.timestamp ?? s.timestamp),
        link_url: m["Shared Post's Link"] ?? sd.href,
        extra: { owner: fix(m["Shared Post's Owner"] ?? "") },
      });
    }
  }

  // --- Yorumlar ---
  else if (/comments.*\.json$/.test(b)) {
    const list = Array.isArray(data) ? data : (data[Object.keys(data)[0]] ?? []);
    for (const c of list) {
      if (c.string_map_data) {
        const t = c.string_map_data.Time?.timestamp ?? c.string_map_data.time?.timestamp;
        items.push({
          platform: "instagram",
          type: "comment",
          id: `${c.string_map_data["Media Owner"]?.value}:${t}`,
          timestamp: ts(t),
          text: fix(c.string_map_data.Comment?.value ?? ""),
          extra: { media_owner: fix(c.string_map_data["Media Owner"]?.value ?? "") },
        });
      } else {
        const sd = c.string_list_data?.[0] ?? {};
        items.push({
          platform: "instagram",
          type: "comment",
          id: `${c.title}:${sd.timestamp}`,
          timestamp: ts(sd.timestamp),
          text: fix(sd.value ?? ""),
          extra: { media_owner: fix(c.title ?? "") },
        });
      }
    }
  }

  // --- Profil/hesap kimligi: personal_information.json ---
  else if (/^personal_information.*\.json$/.test(b)) {
    for (const p of data.profile_user ?? []) {
      const sm = p.string_map_data ?? {};
      items.push({
        platform: "instagram",
        type: "other",
        id: "profile:instagram",
        text: fix(sm.Bio?.value ?? "") || undefined,
        extra: {
          kind: "profile",
          username: sm.Username?.value,
          name: fix(sm.Name?.value ?? ""),
          bio: fix(sm.Bio?.value ?? sm.Bio?.href ?? ""),
          dob: sm["Date of birth"]?.value,
          private: sm["Private Account"]?.value,
        },
      });
    }
  }

  // --- DM mesajlari: messages/**/message_*.json ---
  else if (/^message_\d+\.json$/.test(b)) {
    const thread = fix(String(data.title ?? name.split("/").slice(-2)[0]));
    for (const msg of data.messages ?? []) {
      items.push({
        platform: "instagram",
        type: "message",
        id: `${thread}:${msg.timestamp_ms}`,
        timestamp: msToIso(msg.timestamp_ms),
        text: fix(msg.content ?? "") || undefined,
        extra: {
          thread,
          sender: fix(msg.sender_name ?? ""),
          has_media: Boolean(msg.photos?.length || msg.videos?.length || msg.audio_files?.length),
          shared_link: msg.share?.link,
        },
      });
    }
  }

  return items;
}
