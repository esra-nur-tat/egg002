# Veri Altyapısı Araştırması — egg2

**Tarih:** 2026-11-22 · **Durum:** karar aşamasında
**Amaç:** Elif'in simüle günlüğü, ölçekler, AI kuralları, Ayna raporları gibi JSON dosyalarını koyacağımız altyapıyı seçmek.

İncelenen ~35 sistem/repo + resmi dokümanlar. Kaynaklar her bölümün sonunda.

---

## 0. Bizim ihtiyaçlarımız (kısıtlar)

| Kısıt | Sonuç |
|---|---|
| Hackathon hızı | Kurulum saatleri değil dakikalar sürmeli |
| Fikir çok değişecek | Şema esnek olmalı; erken DB migration'ları acı verir |
| 3 kişilik ekip, 1'i kod yazmıyor | Veriyi düzenlemenin düşük bariyerli bir yolu iyi olur |
| AI ajanlar (Devin vb.) veri üretecek/düzenleyecek | Düz metin/dosya formatı ajan dostu; binary DB değil |
| Demo verisi simüle (~6 ay, ~180 kayıt) | Küçük veri; gerçek DB motoruna ihtiyaç şüpheli |
| Plan: Supabase + LLM API + Whisper | Runtime hedefi belli; ara katman ona göç edebilmeli |
| "Altın kural": kanıt cümlesi verbatim | Vektör arama değil, kesin alıntı doğrulaması lazım |

**Kilit ayrım:** "JSON'ları nereye koyarız" (kaynak/seed katmanı) ile "uygulama veriyi nereden okur" (serving katmanı) iki ayrı karar. Aşağıdaki seçeneklerin çoğu kaynak katmanında hep aynı cevaba çıkıyor: **git'te düz dosyalar**. Asıl seçim serving tarafında.

---

## 1. Karar katmanları

```
KATMAN 1 — Kaynak veri (git'te):  JSON / MD / JSONL dosyaları  ← herkes için tek doğru
KATMAN 2 — Şema/doğrulama:        JSON Schema, Zod, yok        ← bozuk veriyi erken yakala
KATMAN 3 — Serving:               statik fetch / mock API / SQLite / Supabase
KATMAN 4 — Düzenleme UX'i:        editör / git-CMS / spreadsheet UI   ← kod yazmayan ekip üyesi
KATMAN 5 — Ajan erişimi:          AGENTS.md, skill'ler, MCP    ← "ikinci beyin" tarafı
```

Çoğu sistem bu katmanların birkaçını birden kapsıyor. Değerlendirme katman katman yapılmalı.

---

## 2. Kaynak katmanı formatları

### 2a. Düz JSON dosyaları (domain'e göre klasörlü)

`data/elif/entries.json`, `data/scales/who5.json`, `data/ai-rules/risk.json`

**Artıları**
- Sıfır bağımlılık, anında başlar; `git diff`/blame bedava
- AI ajanlar okur/yazar/doğrular; insan herhangi bir editörle düzenler
- Frontend `import data from './data/...json'` ile build-time gömer — backend'siz demo
- Şema değişince dosya değişir, migration yok

**Eksileri**
- Sorgulama yok; filtre/join'i kod yazarak yaparsın (veri küçükse sorun değil)
- Çok yazan runtime senaryosunda uygun değil (kaynak katmanı olarak kalır, runtime'a göçer)

### 2b. Markdown + frontmatter vault (Obsidian uyumlu)

avenoxbeyin, obsidian-mind, basic-memory, Aristos'un kullandığı model: her kayıt bir `.md`, meta verisi YAML frontmatter'da.

**Artıları**
- İnsan için en okunabilir format; Obsidian'da graf/wiki-link bedava
- Uzun metinler (günlük içerikleri, Elif'in mektupları) doğal oturur
- "İkinci beyin" tarafıyla birleşir: docs kararları + veri aynı ekosistemde

**Eksileri**
- Makine okuması JSON'dan zahmetli (frontmatter parse + body parse iki adım)
- Yapısal veri (duygu puanı serileri, ölçek yanıtları) frontmatter'a sıkışır; hybrid gerekir
- Aristos örneği: günlük şablonları MD, ama koçluk metrikleri yine ayrı tutulmuş

### 2c. JSONL append-only event log (gitmem modeli)

`log/2026/11/22.jsonl` — her satır bir olay; hiçbir şey silinmez/düzeltilmez, düzeltmeler yeni satır.

**Artıları**
- Günlük uygulamasına kavramsal olarak en uygun model: kayıtlar zaten değişmez olaylar
- Çakışma/çelişki yönetimi built-in (gitmem `conflicts.json` üretir)
- `tail`/`jq`/`grep` ile sorgulanır; crash-safe append; git log = audit trail
- Projeksiyonlar saf fonksiyon: `facts.json`, `brief.md` gibi türevler yeniden üretilebilir

**Eksileri**
- Ekip JSONL'e alışık değil; "bir dosya aç düzenle" yerine "satır ekle" disiplini
- UI/doğrudan tüketim için projeksiyon katmanı yazmak gerekir
- Seed/demo verisi için (üretilmiş, elle rötuşlanacak) append-only disiplini ağır kaçabilir

> **Not:** Demo verisi elle kurulacağı için 2a + küçük bir JSONL varyantı (kayitlar satır satır) orta yol olabilir. Çalışan uygulamada yeni kayıtlar zaten DB'ye gidecek.

---

## 3. Serving katmanı seçenekleri

### 3a. Statik: frontend JSON'ı doğrudan tüketir

Dosyalar `public/data/` altında veya import edilir; deploy edince statik dosya olarak servis edilir.

**Artıları**
- Sıfır backend, sıfır maliyet, sıfır gecikme
- Vite/Next `import` ile tip desteği; tree-shake değil ama 180 kayıt için önemsiz
- GitHub Pages / Vercel'e at, bitti

**Eksileri**
- Salt-okunur; kullanıcı kaydı demo'da localStorage'a veya hiçbir yere yazmaz (demo'da çoğu zaman kabul edilebilir — "sahte veriyle gösterilir" zaten planda)
- Gerçek kayıt akışı test edilemez

**Benzer kullanım:** GitHub-as-database pattern'i — raw.githubusercontent.com / jsDelivr üzerinden JSON'u API gibi servis etme. Repo public ise bedava CDN; yazma yok ama demo verisi için yazma gerekmiyor.

### 3b. json-server — JSON'dan mock REST API

`npx json-server db.json` → 30 saniyede `/entries?emotion_score_gte=5` REST.

**Artıları**
- Frontend ekibi HTTP ile çalışır; sonradan gerçek API'ye geçişte fetch URL'si değişir sadece
- Sıfır kod, 75k star, hackathon standardı

**Eksileri**
- Tek `db.json` yazma çakışmalarına açık; validasyon yok
- Gerçek backend gelince çöpe giden ara katman; "API kontratı erken netleşsin" dışında katma değeri sınırlı
- v1 beta; stabil v0.x ile dokümanlar karışık

### 3c. lowdb — gömülü JSON DB (Node tarafında)

`db.data.entries.push(...)` düz JS; atomic write; TS.

**Artıları**
- Kendi küçük backend'ini yazacaksan (LLM proxy için zaten lazım olabilir) JSON'u olduğu gibi store yapar
- Adapter ile format değişebilir; testlerde in-memory mod

**Eksileri**
- Tek process, cluster yok; ~10-100MB üstü performans düşer (bizim için sorun değil)
- Sorgu = JS array fonksiyonları; SQL yok

### 3d. SQLite + JSON seed senkronu (romiojoseph/journal modeli)

`/data/*.json` kaynak → startup'ta `journal.db`'ye sync; runtime SQLite.

**Artıları**
- Gerçek sorgular (zaman çizelgesi, filtre, aggregate) bedava; tek taşınabilir dosya
- JSON'lar okunabilir seed olarak kalır — "ikinci beyin" ile çelişmez
- Postgres'e göç yolu düz; better-sqlite3 sync API'si çok hızlı
- WAL ile güvenli; FTS5 ile tam metin arama bedava

**Eksileri**
- `.db` binary → git'te diff okunmaz (`.gitignore`'a al, seed'ler kaynak olsun)
- Migration/şema katmanı sen yazarsın; düz JSON'dan fazla iş
- Uygulamanın DB'si ile seed kaynağı iki yerde — senkron bug riski

### 3e. DuckDB — JSON dosyalarına doğrudan SQL

`SELECT * FROM read_json('data/elif/entries/*.json')` — import bile gerektirmez, glob okur.

**Artıları**
- Kaynak JSON'lara dokunmadan analitik sorgu: "Elif'in Mart duygu ortalaması" tek satır SQL
- Parquet/CSV/JSON karışık okur; DuckDB-Wasm ile tarayıcıda bile çalışır
- Veri keşfi ve demo öncesi "bu veri inandırıcı mı" analizi için müthiş araç

**Eksileri**
- Analitik motoru; uygulama runtime store'u değil (yazma senaryosu zayıf)
- Ekipte öğrenme maliyeti; Node entegrasyonu ek kurulum
- **Değerlendirme:** Infra olarak değil, veri-doğrulama/aracı olarak mükemmel tamamlayıcı

### 3f. Datasette — SQLite/JSON üstüne anlık gezilebilir API

`datasette serve data.db` → tarayıcıda tablo görünümü + her sayfanın `.json` API'si.

**Artıları**
- Ekipteki herkes (kod bilmeyen dahil) veriyi tarayıcıda gezer, filtreler, indirir
- Elif'in verisi "işte bakın" diye gösterilebilir — pitch/demo malzemesi
- CORS açık JSON API; tek komutla Cloud Run'a publish

**Eksileri**
- Salt-okunur odaklı; uygulama backend'i değil
- Python aracı; Node stack'ine ek bağımlılık
- **Değerlendirme:** DuckDB gibi — runtime infra değil, veri-görünürlüğü aracı. Ucuz, denemeye değer

### 3g. Supabase + JSON→seed.sql (plandaki hedef)

Postgres + auth + storage + edge functions; `supabase/seed.sql` resmi mekanizma; JSON'dan SQL üreten script.

**Artıları**
- Planla birebir uyumlu: auth, ses dosyaları için storage, LLM key'leri edge function'da server-side
- `ai_analysis JSONB` kolonu (MindEase şeması aynen böyle) — AI çıktıları esnek kalır
- RLS ile "terapist neyi görebilir" izin ekranı doğal modellenir
- pgvector hazır — ileride semantik arama isterse ayrı servis gerekmez
- `db reset` ile tekrarlanabilir demo ortamı

**Eksileri**
- En ağır kurulum: CLI + Docker (local) veya hosted proje + key yönetimi
- Migration disiplini erken başlar; "fikir çok değişecek" ile sürtüşme
- Statik demo için overkill — ilk tıklanabilir prototip buna ihtiyaç duymaz

### 3h. PocketBase — tek binary tam backend

`./pocketbase serve` → SQLite + auth + admin UI + REST/realtime + dosya storage.

**Artıları**
- Admin paneli hazır: kod yazmayan ekip üyesi veriyi grid'de düzenler (Katman 4'ü bedavaya çözer)
- JSON collection import/export; auth + dosya upload (ses kayıtları!) built-in
- Tek executable; deploy = binary kopyala

**Eksileri**
- Plan Supabase demişken ikinci BaaS öğrenmek; sonra göç
- Şema admin UI'da yaşar (migration'la kodlaştırılabilir ama ek iş)
- GitHub repo'su ARCHIVED (ganigeorgiev.com'a taşındı) — sinyal karışık ama proje aktif

### 3i. InstantDB / Convex / Firebase — BaaS alternatifleri

**InstantDB:** client-side grafik DB + sync; şema opsiyonel; realtime bedava; ama server logic yok — LLM çağrısı için ikinci platform şart. Güvenlik modeli karşılaştırmalarda zayıf çıktı.
**Convex:** fonksiyon-üzerinden-DB; reactive en güzeli; ama query'ler TS fonksiyonu, offline yok, öğrenme eğrisi; LLM akışı için action'lar yine ayrı.
**Firebase:** en olgun; offline senkron iyi; ama ilişkisel sorgu zayıf, izin DSL'i çirkin, maliyet okuma sayısına bağlı; Google console karmaşası.

**Ortak eksi:** Üçü de "plan Supabase" gerçeğiyle çelişir; hiçbiri seed-JSON hikâyesini Supabase kadar doğal çözmez.

### 3j. PGlite / Dexie — tarayıcı içi local-first

**PGlite:** Postgres→WASM, IndexedDB'de yaşar; gerçek SQL + JSONB + live queries, sunucu yok.
**Dexie:** IndexedDB wrapper; `db.entries.where('date').above(...)`; Dexie Cloud ile sync opsiyonu.

**Artıları**
- Demo tamamen offline çalışır; "veri cihazından çıkmaz" pitch'i güçlü (mahremiyet vurgusu!)
- Backend sıfır; deploy = statik site

**Eksileri**
- Veri tarayıcıda kalır → cihazlar arası yok, terapist paneli başka cihazdan göremez
- Seed veriyi IndexedDB'ye hydrate etmek ek kod; WASM bundle ~3MB (PGlite)
- Multi-user geleceğinde sync motoru gerekecek (ElectricSQL/PowerSync ekosistemi genç)

**Değerlendirme:** "Demo tek cihazda, sahte veriyle" senaryosunda aslında çok uygun; ama terapist paneli farklı kullanıcıdan bakınca paylaşım gerekiyor → erken sınıra çarpar.

---

## 4. Düzenleme katmanı (kod yazmayan ekip üyesi için)

### 4a. Keystatic / TinaCMS — git-CMS

Repo'daki JSON/MD'ye admin UI; değişiklikler commit olarak düşer.

**Artıları**
- "Sen" rolündeki ekip üyesi ölçekleri/kuralları/Elif metinlerini web UI'dan düzenler, git tarihi korunur
- Veri repo'da kalır → kaynak katmanı bozulmaz
- Keystatic DB'siz; Tina GraphQL API verir

**Eksileri**
- Keystatic "experimental" diye etiketlenmiş; Tina olgun ama kurulumu Next/Astro şablonuna bağlı
- Form şemalarını sen tanımlarsın (aslında iyi: şema zorlanır)
- Hackathon'da kurulum maliyeti getirisine değmeyebilir — sonradan eklenebilir

### 4b. NocoDB / Baserow — DB üstüne spreadsheet UI

**Artıları**
- Airtable deneyimi; ekip üyesi kayıtları tablo gibi düzenler
- NocoDB mevcut Postgres'e bağlanır → Supabase'in üstüne bile oturabilir(!)

**Eksileri**
- Docker + ~2GB RAM; hackathon için ağır servis
- NocoDB lisansı artık AGPL değil (Sustainable Use); Baserow MIT ama kanban/calendar ücretli
- JSON dosyası kaynağıyla değil DB ile konuşur → kaynak-serving ikiliği

### 4c. En basit yol: editör + şema doğrulama

VS Code'da JSON aç + `$schema` ile autocomplete + CI'da validate.
Bariyeri en düşük olanı; "sen" kişisi teknikse (psychometrics biliyor, JSON okur) yeterli.

---

## 5. Ajan hafızası platformları (ayrı kategori)

Bunlar "ikinci beyin" değil, *AI ajan hafızası servisleri* — bizim JSON-vault ihtiyacından farklı problem:

| Sistem | Ne yapar | Bize uygun mu |
|---|---|---|
| **mem0** (~63k★) | Konuşmadan fact çıkarıp `add()/search()` ile saklar | ❌ drop-in güzel ama bizim "insan-el-yapımı demo verisi" problemimiz değil |
| **Zep/Graphiti** (~30k★) | Bi-temporal bilgi grafiği (Neo4j/FalkorDB) | ❌ graph DB kurmak hackathon ölçeği değil; "o dönem ne doğruydu" güzel ama biz bunu tarih alanlarıyla çözeriz |
| **Letta** (~25k★) | Stateful agent runtime; ajan kendi hafızasını yönetir | ❌ uygulama değil ajan platformu |
| **basic-memory / gitmem / obsidian-mcp** | MD/JSONL dosyalar + MCP ile ajana servis | ⚠️ fikir olarak alınabilir; servis olarak kurmak şart değil — AGENTS.md yeter |
| **avenoxbeyin** | Skill+hook paketi: ajana "not al/geri bul" disiplini | ⚠️ referans mimari; birebir kurmak yerine konvansiyonlarını (knowledge/, daily/, AGENTS.md) hafifçe almak daha akıllı |

---

## 6. Benzer uygulamaların gerçekte yaptıkları

| Proje | Stack | Bize ders |
|---|---|---|
| **Sprout** (GirlHacks 2026) | Next.js + Supabase + Zod | **Altın kuralın aynısı:** AI alıntılarını günlükte verbatim doğrula, eşleşmeyeni düşür. JSONB'de ai_insights. Seed komutu var |
| **Insight-Box** (MEXA 2025) | 2 LLM ajanı (Watson analiz + Sherlock trend) | Kayıt-analizi + Ayna karşılaştırmasının eş-değeri; simüle aylık günlükte çalışmışlar |
| **MindEase** | Supabase | `journal_entries.ai_insights JSONB + emotions JSONB` — şema ilhamı |
| **romiojoseph/journal** | Next.js + better-sqlite3 | `/data/*.json` → startup sync modeli (3d'nin canlı örneği) |
| **Verum** | Next.js + Supabase | migration'ları `supabase/migrations/` altında mirror etme disiplini |
| **DiaryGPT** | Express + SQLite/pgvector | RAG için embedding; bizim 180 kayıtta gereksiz ama yolu gösteriyor |
| **WhatMyMood** | DynamoDB | `ai_analysis{detected_mood, confidence, keywords, sentiment_score}` gömülü JSON — entry şeması ilhamı |

---

## 7. Karşılaştırma matrisi

| Seçenek | Kurulum | Sorgu gücü | Yazma | Kaynak=Serving? | Göç yolu | Bizim için not |
|---|---|---|---|---|---|---|
| Düz JSON + statik fetch | ⚡dk | Array fns | ❌ salt-okur | ✅ | her yere | Demo fazı ideal |
| JSONL log + projeksiyon | ⚡dk | jq/grep | ✅ append | ✅ | DB'ye ETL | Kavramsal fit iyi, disiplin ister |
| json-server | ⚡dk | REST filtre | ⚠️ tek dosya | ✅ | API kontratı kalır | Erken frontend için |
| lowdb | ⚡dk | JS fns | ✅ | ✅ | kolay | Kendi mini-backend'ine |
| SQLite + seed sync | saat | SQL tam | ✅ | ❌(sync) | Postgres | Dengeli; sync kodu gerek |
| DuckDB | dk | SQL analitik | ❌ | ✅(okuma) | — | Runtime değil, analiz aracı |
| Datasette | dk | SQL+UI | ❌ | ❌ | — | Veri-vitrini aracı |
| Supabase + seed | saat-gün | SQL+RLS+pgvector | ✅ | ❌ | — | Planlanan hedef |
| PocketBase | dk-saat | REST filtre | ✅ | ❌ | zor | Supabase varken gereksiz |
| InstantDB/Convex/Firebase | saat | orta | ✅ | ❌ | zor | Plana ters |
| PGlite/Dexie | saat | SQL/index | ✅(cihaz) | ✅ | senkron gerek | Tek-cihaz demo güzel |
| Git-CMS (Keystatic/Tina) | saat | — | ✅ UI | ✅ | — | Katman 4 eklentisi |
| NocoDB/Baserow | saat+ | UI+API | ✅ UI | ❌ | — | Ağır; Supabase üstüne bile olur |
| mem0/Zep/Letta | gün | semantik | ✅ | ❌ | — | Problemimiz değil |

---

## 8. Önerilen mimari (sentez)

```
egg2/
├── data/                        # KATMAN 1 — tek doğru kaynak (git)
│   ├── personas/elif.json       # persona tanımı
│   ├── entries/                 # simüle günlük kayıtları
│   │   └── elif/2025-05/*.json  #   (ay/ay veya tek entries.jsonl)
│   ├── scales/                  # WHO-5, öz-şefkat kısa formu
│   ├── ai-rules/                # prompt'lar, risk kuralları, altın-kural
│   └── mirror/                  # üretilmiş Ayna raporları (ön-hesaplı)
├── schemas/                     # KATMAN 2 — JSON Schema'lar ($schema ile editör desteği)
├── scripts/
│   ├── validate.mjs             # ajv ile data/ doğrulama (pre-commit + CI)
│   ├── analyze.ts               # (ops.) duckdb ile hızlı veri soruları
│   └── seed.mjs                 # data/ → Supabase seed.sql üretir
├── docs/                        # KATMAN 5 — ikinci beyin
│   ├── research/                # bu dosya
│   ├── decisions/               # ADR'ler (karar kayıtları)
│   └── elif/                    # hikâye, klinik tutarlılık notları
├── AGENTS.md                    # ajanlar için: veri nerede, nasıl doğrulanır, kurallar
└── app/ (veya web/)             # frontend — önce data/'dan statik okur
```

**Fazlar:**
1. **Faz 0 (şimdi):** `data/` + `schemas/` + `validate` + `AGENTS.md`. Frontend JSON'u import eder. Sıfır backend.
2. **Faz 1:** Ayna raporları `data/mirror/` altında ön-hesaplı JSON olarak durur (demo'da LLM çağrısı bile gerekmeyebilir).
3. **Faz 2:** `seed.mjs` → Supabase; gerçek kayıt akışı orada yaşar; `data/` seed kaynağı olmaya devam eder.
4. **(Ops) Faz 3:** Kod yazmayan üye için Keystatic; veri-vitrini için Datasette/DuckDB.

**Neden bu:** Her katman bağımsız değiştirilebilir. Fikir pivotları sadece `data/` dosyalarını etkiler. Supabase'e geçiş "sonradan" değil, baştan tasarlanmış bir göç. Maliyet: bir Node script + birkaç JSON Schema.

---

## 9. Açık sorular

1. Demo'da kullanıcı kaydı *gerçekten yazılacak* mı, yoksa sadece Elif'in verisi gezilecek mi? (statik fetch yeterli mi sorusu)
2. Ayna raporu demoda canlı LLM çağrısı mı, ön-hesaplı JSON mu? (jüri önünde risk vs hız)
3. Repo public mi olacak? (GitHub-as-CDN seçeneği ancak public'te)
4. "Sen" kişisi JSON düzenlerken editör mü yeter, UI mı lazım? (Katman 4 kararı)

---

## Kaynaklar (seçki)

- avenoxai/avenoxbeyin — vault şablonu, skill modeli
- fmind/brain-framework — MD→JSON derleyen bilgi store, rg/jq sorgu
- josephy02/gitmem — JSONL append-only + deterministik projeksiyon
- basicmachines-co/basic-memory — MD + MCP two-way hafıza
- murillovp/persistent-memory — facts.md + memory-log.jsonl (en minimal)
- breferrari/obsidian-mind, maxkuminov/obsidian-mcp, Jrcruciani/obsidian-memory-for-ai
- typicode/json-server, typicode/lowdb
- pocketbase/pocketbase (artık ganigeorgiev.com/pocketbase)
- Supabase seeding docs; AdithyaSrivastava01/MindEase (JSONB şema); marcuu/Verum
- GHacks2026 Sprout — verbatim kanıt doğrulama örneği
- rampriya92 mexa-2nd-hackathon Insight-Box — çift ajanlı günlük analizi
- Prithiv04/MindMirror, rahul70-code/diarygpt, AbhishekSinghDhadwal/SumiSense
- Cityjohn/Aristos — ajan-çerçeveli günlük şablonu
- DuckDB JSON docs; simonw/datasette
- Thinkmill/keystatic, tinacms/tinacms
- instantdb.com/essays/next_firebase; awaited.dev convex-alternatives karşılaştırması
- mem0ai/mem0, getzep/graphiti, letta-ai/letta, AxDSan/mnemosyne (importer örnekleri)
- dexie/Dexie.js (+Dexie Cloud), electric-sql/pglite
- nocodb.com, baserow/baserow — lisans/özellik durumları
- GitHub-as-database: kody-w.github.io CDN+JSON=API; chirag127/fii-dii-activity-api; DavidBruant/github-as-a-database
- Astro content collections (Zod şema) docs
- Turso/libSQL vs Supabase karşılaştırmaları (+Supabase'in Turso'yu alması haberi)
