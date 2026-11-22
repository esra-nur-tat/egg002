# AGENTS.md — egg2

Bu repo, yerel-veri (hiçbir veri cihazdan çıkmaz) günlük + Ayna uygulamasının **veri vault'u ve altyapısıdır**. Frontend sonra kurulacak.

## Mimari karar

- **Veri cihazdan çıkmaz.** Sunucu/backend yok. Uygulama statik site + tarayıcı-içi store (IndexedDB/Dexie). Kullanıcı kendi sosyal medya export'unu (ZIP) yükler, tarayıcıda normalize edilir.
- **`data/` tek doğru kaynak.** Elle veya ajanla düzenlenir; git'te versiyonlanır.
- **Ajan erişimi = dosyalar.** "API", iyi isimlendirilmiş dosyalar + şemalar + manifest'tir. Lokal servis gerekirse sonradan eklenir.

## Klasörler

| Yol | İçerik |
|---|---|
| `data/personas/` | Simüle kullanıcı tanımları (Elif) |
| `data/entries/<persona>/` | Günlük kayıtları, ay bazlı dosyalar (`YYYY-MM.json`, `entries` dizisi) |
| `data/scales/` | Ölçek tanımları (WHO-5, SCS-SF) |
| `data/ai-rules/` | Altın kural, risk işaretleri, çıkarım alanları |
| `data/mirror/` | Ayna raporları (ön-hesaplı) |
| `data/social/` | Normalize sosyal veri örnekleri (`manifest.json` + `items.jsonl`) |
| `schemas/` | JSON Schema'lar — dosyaların `$schema` alanı burayı gösterir |
| `ingest/` | ZIP export → normalize `items.jsonl` dönüştürücüler (saf ESM, tarayıcıda da çalışır) |
| `my-data/` | **GİZLİ** — `_raw/` ham export'lar + platform bazlı normalize çıktı (`items.jsonl`, `items-YYYYHn.jsonl`, `manifest.json`) |
| `scripts/validate.mjs` | Şema + altın kural doğrulaması |
| `scripts/ingest-local.mjs` | `my-data/_raw/` → `my-data/<platform>/` (6 aylık bucket'larla) |
| `scripts/query.mjs` | CLI sorgu katmanı: `--platform --type --q --from --to --period --stats` |
| `scripts/serve.mjs` | Localhost API + ingest UI: `GET /api/stats`, `GET /api/items?...` |
| `web/ingest.html` | Tarayıcıda ZIP → normalize (fflate + `ingest/` ESM import) |
| `docs/` | İkinci beyin: araştırma, kararlar (ADR), Elif'in hikâye notları |

## Kurallar (ajanlar için)

1. **Veri yazmadan önce ilgili şemayı oku** (`schemas/`). `$schema` alanını koru.
2. **ALTIN KURAL:** `data/mirror/` içindeki her `evidence.quote`, referans verilen entry'nin `text`/`answers`/mektup metninin **birebir alt dizesi** olmalı. Asla alıntı uydurma. `npm run validate` bunu denetler.
3. **Doğrula:** `data/` altında bir şey değiştirdiysen `npm run validate` çalıştır.
4. ID formatı: `persona-YYYY-MM-DD` (kayitlar), kebab-case.
5. Türkçe metinlerde gerçek Türkçe karakterler kullan (UTF-8: ğ, ı, ş, ç, ö, ü). ASCII-translit kullanma.
6. Gerçek kullanıcı verisi (`my-data/`, `*.zip`, `.env`) asla commit'lenmez — `.gitignore`'da.
7. `my-data/` altındaki kayıtlar kişiseldir — dış servise/URL'ye gönderme, log'lara yapıştırma.

## Ingest modülü

`ingest/index.mjs > ingestExport(files)` — `{name, text}` dosya listesi alır, `{manifest, items, itemsJsonl}` döner. Platform: `ingest/detect.mjs` (twitter/instagram/tiktok/pinterest/claude/whatsapp/youtube). Yeni platform eklerken: `parse-<platform>.mjs` yazıp `PARSERS`'a ekle.

Desteklenen export'lar: X (`tweets.js`), Instagram (`your_instagram_activity/`, `media/posts_*.json`), TikTok (`user_data.json`), Pinterest (SAR HTML), Claude (`conversations.json`, `memories`, `projects`, `design_chats`, `artifacts`, `reflections`, memory-vault `.md`), WhatsApp (`_chat.txt`), YouTube (Takeout `izleme geçmişi.html` / `watch-history.html|json`; reklam kayıtları atlanır).

## Yerel sorgu (ajan erişimi)

- CLI: `node scripts/query.mjs --stats` / `--platform instagram --q "kahve" --limit 10` / `--from 2025-01-01 --to 2025-12-31`
- HTTP: `npm run serve` → `http://127.0.0.1:8787/api/stats`, `/api/items?platform=&type=&q=&from=&to=&period=&limit=&offset=`
- Sohbet: `POST /api/chat {period, messages}` — seçilen dönemdeki kullanıcıyla konuşma. Sağlayıcı `lib/llm.mjs` (`.env`: `EGG2_LLM`, `EGG2_API_KEY`, `EGG2_MODEL`; harici sağlayıcıda veri cihazdan çıkar).

## Persona (dönemdeki kişi)

- `lib/persona.mjs`: `buildDossier(period)` kullanıcının o dönemde **kendi yazdıklarını** toplar → `distill(period)` LLM ile birinci ağızdan kart üretir → `my-data/_persona/<period>.json` (`card`, `voice`, `summary`, `samples`).
- `personaPrompt(period)` sohbet system prompt'unu kurar: o dönemin kartı + yazış tarzı + gerçek mesaj örnekleri + **yalnızca önceki** dönemlerin özetleri. Sonraki dönemlerden hiçbir şey girmez; tarihsiz hafıza notları sadece en güncel döneme eklenir.
- Kartları üret/yenile: `node scripts/build-persona.mjs [--force] [dönem…]`. Yeni veri ingest edilince ilgili dönemi yeniden üret. Prompt'u görmek için: `node scripts/show-prompt.mjs <dönem>`.
- Kart dört bölümdür: `card` (iç portre), `memories` (tarihli olaylar), `voice` (yazış tarzı), `summary` (sonraki dönemlerin "geçmiş"i).
- Dönem özeti: `lib/recap.mjs > buildRecap(period)` → `my-data/_persona/<period>.recap.json` (büyük anlar, zihnimin içi, eşlikçiler, dönemin insanı, o zaman → şimdi, aynı kalanlar). "Dönemin insanı" ve müzik listesi yerelde hesaplanır; "şimdi" tarafı en güncel dönemin kartından gelir. Üret/yenile: `node scripts/build-recap.mjs [--force] [dönem…]` — persona kartlarından sonra çalıştır. API: `GET /api/recap?period=`.
- Özet ayrıca tasarım alanlarını taşır: `kapak_cumlesi`, `odak_basligi`, `mod` (baskın duygu + aylık 1-10 puan), `hedefler`, `sorular`; yerelde hesaplananlar: `stats`, `muzik_sayilari`, `kapak_gorseli` (o dönemin kendi Instagram fotoğrafı; elle değiştirirsen `kapak_gorseli_elle: true` ekle). `anlar.ters_kose.alinti` kullanıcının kendi mesajında birebir geçmezse atılır (altın kural).
- Arayüz (`web/app.html`, tasarım: "Dijital Kişilik Arşivi / My Eras"): `#/` bölümler → `#/<dönem>` kapak → `/recap` → `/odak` → `/sohbet` (koyu retro sohbet; ilk mesajı geçmiş sen atar). Vanilla JS + Tailwind; stil değişince `npm run build:css` (`tailwind.config.cjs`, `web/app.in.css` → `web/app.css`). Fontlar ve ikonlar `node_modules`'tan yerel servis edilir (`/vendor/fonts/*`); dış CDN yok.

## Önemli kararlar

`docs/decisions/` altında ADR'ler. Veri formatını veya mimariyi değiştiren bir şey yaparsan kısa bir ADR ekle.
