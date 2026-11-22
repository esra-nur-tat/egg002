# ADR-0001: Yerel-veri mimarisi (veri cihazdan çıkmaz)

**Tarih:** 2026-11-22 · **Durum:** kabul edildi

## Bağlam

Ruh sağlığı günlüğü — kişisel metinler, duygu puanları, sosyal medya export'ları. Kullanıcı gereksinimi: veri hiçbir yere gönderilmez; isteyen kendi verisini kendi cihazına yükler. Plan, fikirlerin çok değişeceği bir hackathon MVP'si.

## Karar

- **Kaynak:** git'te `data/` JSON vault'u + `schemas/` ile doğrulama.
- **Runtime:** statik site + tarayıcı-içi store (IndexedDB, Dexie önerilir). Sunucu yok.
- **Sosyal medya:** kullanıcının ZIP export'u tarayıcıda (fflate + `ingest/`) parse edilir → tek normalize `items.jsonl` + `manifest.json`. File System Access API ile kullanıcının seçtiği klasöre yazılır (Chromium); fallback = dosya indirme.
- **Ajan erişimi:** klasörün kendisi "API"dir; ajan dosyaları okur. Lokal servis/MCP ancak gerekirse.
- **Paylaşım (terapist ekranı):** server-side izin yok; kullanıcı filtrelenmiş export'u kendisi üretip verir.
- **AI analizi:** demoda ön-hesaplı (`analysis` alanları seed'te). Canlı analiz gerekirse transformers.js / localhost Ollama — veri yine cihazda kalır.

## Sonuçlar

- (+) Mahremiyet pitch'i mimarinin kendisi; backend maliyeti/karmaşası yok.
- (+) Fikir pivotları sadece dosya değiştirir.
- (−) Çok-cihaz senkronu yok; terapistin canlı görmesi mümkün değil (demo kabul edilebilir).
- (−) File System Access API sadece Chromium'da — fallback gerekli.
- Gelecekte bulut gerekirse: `data/` seed kaynağı olarak kalır, Supabase'e göç yolu açık (araştırma dokümanına bak).

## Araştırma

`docs/research/2026-11-veri-altyapisi-secenekleri.md` — ~35 sistemin karşılaştırması.
