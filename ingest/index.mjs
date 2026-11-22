// Sosyal medya export'unu normalize items.jsonl + manifest.json'a cevirir.
// Tarayici tarafinda: fflate ile ZIP acilir, dosyalar {name, text} olarak buraya gelir.
// Cikti IndexedDB'ye (Dexie) ve/veya File System Access API ile secili klasore yazilir.

import { detectPlatform } from "./detect.mjs";
import { parseTwitterFile } from "./parse-twitter.mjs";
import { parseInstagramFile } from "./parse-instagram.mjs";
import { parseTikTokFile } from "./parse-tiktok.mjs";
import { parsePinterestFile } from "./parse-pinterest.mjs";
import { parseClaudeFile } from "./parse-claude.mjs";
import { parseWhatsappFile } from "./parse-whatsapp.mjs";
import { parseYoutubeFile } from "./parse-youtube.mjs";

const PARSERS = {
  twitter: parseTwitterFile,
  instagram: parseInstagramFile,
  tiktok: parseTikTokFile,
  pinterest: parsePinterestFile,
  claude: parseClaudeFile,
  whatsapp: parseWhatsappFile,
  youtube: parseYoutubeFile,
};

export const SOCIAL_SCHEMA_VERSION = "1.0.0";

/**
 * @param {Array<{name: string, text: string}>} files - ZIP'ten cikarilmis dosyalar
 * @returns {{manifest: object, items: Array, itemsJsonl: string, skipped: string[]}}
 */
export function ingestExport(files) {
  const names = files.map((f) => f.name);
  const getText = (n) => files.find((f) => f.name === n)?.text ?? "";
  const platform = detectPlatform(names, getText);
  if (!platform) {
    throw new Error(
      "Platform tanınamadı. Desteklenen export'lar: X (tweets.js), Instagram, Pinterest (SAR HTML), WhatsApp (_chat.txt), Claude (conversations.json), TikTok (user_data.json), YouTube (izleme geçmişi.html / watch-history)"
    );
  }

  const parse = PARSERS[platform];
  const items = [];
  const skipped = [];

  for (const file of files) {
    try {
      items.push(...parse(file.name, file.text));
    } catch (err) {
      skipped.push(`${file.name}: ${err.message}`);
    }
  }

  const countsByType = {};
  let minTs = null;
  let maxTs = null;
  for (const it of items) {
    countsByType[it.type] = (countsByType[it.type] ?? 0) + 1;
    if (it.timestamp) {
      if (!minTs || it.timestamp < minTs) minTs = it.timestamp;
      if (!maxTs || it.timestamp > maxTs) maxTs = it.timestamp;
    }
  }

  const manifest = {
    $schema: "../schemas/social-manifest.schema.json",
    schema_version: SOCIAL_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    platforms: [
      {
        platform,
        files: names,
        item_count: items.length,
        counts_by_type: countsByType,
        date_range: { from: minTs, to: maxTs },
      },
    ],
    ...(skipped.length && { note: `Atlanan dosyalar: ${skipped.join("; ")}` }),
  };

  const itemsJsonl = items.map((i) => JSON.stringify(i)).join("\n") + "\n";
  return { manifest, items, itemsJsonl, skipped };
}
