// Ingest demo: sahte X export dosyasiyla pipeline'i test eder.
// Kullanim: npm run ingest:example

import { ingestExport } from "../ingest/index.mjs";

const fakeTwitterExport = [
  {
    name: "data/tweets.js",
    text: `window.YTD.tweets.part0 = [
  { "tweet": { "id_str": "1720000000000000001", "created_at": "Sat Mar 01 10:00:00 +0000 2025", "full_text": "Tez süreci çok yorucu geçiyor", "retweet_count": 0, "favorite_count": 3 } },
  { "tweet": { "id_str": "1720000000000000002", "created_at": "Wed Oct 15 18:30:00 +0000 2025", "full_text": "Bugün ilk kez seminerde sunum yaptım", "retweet_count": 1, "favorite_count": 14 } }
];`,
  },
  {
    name: "data/like.js",
    text: `window.YTD.like.part0 = [
  { "like": { "tweetId": "98123", "fullText": "bir başkasının postu", "date": "Wed Oct 01 12:00:00 +0000 2025" } }
];`,
  },
];

const { manifest, items, itemsJsonl, skipped } = ingestExport(fakeTwitterExport);

console.log(JSON.stringify(manifest, null, 2));
console.log("--- items.jsonl ---");
console.log(itemsJsonl);
if (skipped.length) console.log("Atlanan:", skipped);
