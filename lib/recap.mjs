// Donem ozeti: bir donemi acinca sohbetten once gosterilen sayfa.
//   buyuk anlar (zafer / ters kose / basrol) · zihnimin ici · donemin eslikcileri ·
//   donemin insani · o zaman → simdi · ayni kalanlar
// Kaynak: o donemin dosyasi (kullanicinin kendi yazdiklari) + persona karti + yerelde
// hesaplanan iki gercek (en cok yazisilan kisi, en cok dinlenen muzik). "Simdi" tarafi
// en guncel donemin kartindan gelir. Cikti: my-data/_persona/<period>.recap.json

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA, periods, iterPeriod, ownerProfile } from "./context.mjs";
import { buildDossier, loadPersona, periodLabel } from "./persona.mjs";
import { chat } from "./llm.mjs";

const file = (p) => join(DATA, "_persona", `${p}.recap.json`);
export const loadRecap = (p) => (existsSync(file(p)) ? JSON.parse(readFileSync(file(p), "utf8")) : null);

const MUSIC_CH = / - Topic$|VEVO$/i;
const MUSIC_TITLE = /official (music |lyric )?video|official audio|\blyrics\b|şarkı sözleri|\(sözleri\)|resmi klip|official klip/i;

// "manifest - Arıyo | Official Music Video" -> { title: "Arıyo", artist: "manifest" }
function cleanTrack(raw, channel) {
  let t = raw
    .replace(/[([]\s*(official|resmi|lyric|lyrics|audio|video|klip|music|şarkı sözleri|sözleri|mv|hd|4k)[^)\]]*[)\]]/gi, "")
    .replace(/\|\s*(official|resmi).*$/i, "")
    .replace(/\s+(official (music |lyric )?video|official audio|lyrics?|şarkı sözleri)\s*$/i, "")
    .replace(/\s{2,}/g, " ").trim();
  let artist = channel;
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) { artist = m[1].trim(); t = m[2].trim(); }
  return { title: t || raw, artist };
}

// Yerel gercekler: birebir sohbetlerde en cok yazdigim kisi + en cok dinledigim muzik
export function localFacts(period) {
  const me = ownerProfile()?.extra?.name ?? "";
  const threads = {}, music = {}, tracks = {};
  const own = [], nights = new Set(), weekday = Array(7).fill(0), covers = [];
  let video = 0;
  for (const it of iterPeriod(period)) {
    if (it._src === "youtube") video++;
    if (it._src === "instagram" && it.type === "post" && /\.(jpe?g|png|webp)$/i.test(it.media_url ?? "")) covers.push(it);
    const mine = it.type === "message" && it.text &&
      (it._src === "claude" ? ["human", "user"].includes(it.extra?.sender) : (it.extra?.from_me || it.extra?.sender === me) && !/^You |^Reacted /.test(it.text));
    if (mine) {
      own.push(it);
      // Turkiye saati (UTC+3): gece yarisi sohbetleri ve en hareketli gun
      const tr = new Date(Date.parse(it.timestamp) + 3 * 3600e3);
      if (!isNaN(tr)) {
        weekday[tr.getUTCDay()]++;
        if (tr.getUTCHours() < 5) nights.add(new Date(tr - 5 * 3600e3).toISOString().slice(0, 10));
      }
    }
    // muzik: YouTube Music kayitlari; eski donemlerde sanatci kanallari ("X - Topic", VEVO) ve klip basliklari
    if (it._src === "youtube" && it.extra?.channel && (it.extra.product === "music" || MUSIC_CH.test(it.extra.channel) || MUSIC_TITLE.test(it.text ?? ""))) {
      const a = it.extra.channel.replace(/ - Topic$|VEVO$/i, "").trim();
      music[a] = (music[a] ?? 0) + 1;
      if (it.text) {
        const { title, artist } = cleanTrack(it.text, a);
        (tracks[`${title}\u0000${artist}`.toLocaleLowerCase("tr")] ??= { title, artist, url: it.link_url, count: 0 }).count++;
      }
    }
    if (it.type !== "message" || it._src === "claude" || !it.extra?.thread) continue;
    const t = (threads[it.extra.thread] ??= { name: it.extra.thread, mine: 0, senders: new Set(), others: {}, days: new Set(), texts: [] });
    const fromMe = it.extra.from_me || it.extra.sender === me;
    const who = fromMe ? "__me__" : (it.extra.sender ?? it.extra.thread);
    t.senders.add(who);
    if (!fromMe && who !== "Instagram user") t.others[who] = (t.others[who] ?? 0) + 1;
    if (fromMe && it.text && !/^You |^Reacted /.test(it.text)) {
      t.mine++; t.days.add((it.timestamp ?? "").slice(0, 10)); t.texts.push(it);
    }
  }
  // silinmis hesaplar "Instagram user" adiyla gelir; kisi olarak sayilmaz
  const one = Object.values(threads).filter((t) => t.senders.size <= 2 && t.mine >= 10 && t.name !== "Instagram user");
  let top = one.sort((a, b) => b.days.size - a.days.size || b.mine - a.mine)[0] ?? null;
  if (!top) {
    // birebir sohbet yoksa: en cok yazdigim grupta en aktif (adi bilinen) kisi
    const grp = Object.values(threads).filter((t) => t.mine >= 10).sort((a, b) => b.mine - a.mine)[0];
    const who = grp && Object.entries(grp.others).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (who) top = { ...grp, name: who, via: grp.name };
  }
  const rank = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([a]) => a);
  const topTracks = Object.values(tracks).sort((a, b) => b.count - a.count).slice(0, 20);
  const GUN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const posts = covers.filter((c) => c.extra?.kind !== "story");
  const pool = posts.length ? posts : covers;
  pool.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
  return {
    top, own,
    artists: rank(music, 14),
    tracks: topTracks.map((t) => `${t.title} — ${t.artist}`),
    topTracks: topTracks.slice(0, 5),
    stats: { gece: nights.size, mesaj: own.length, video, gun: own.length ? GUN[weekday.indexOf(Math.max(...weekday))] : null },
    cover: pool[Math.floor(pool.length / 2)]?.media_url ?? null,
  };
}

const PROMPT = (period, name, persona, facts, now) => `${name} adlı kişinin ${periodLabel(period)} dönemi için bir "dönem özeti" sayfası hazırlıyorsun. Sayfayı bugün kendisi okuyacak. Aşağıda o dönemde KENDİ yazdıkları ve dijital izleri var; mesajların hepsini o yazdı: "[tarih] ben → Ad: …" satırında Ad yalnızca alıcıdır, mesajdaki birinci tekil fiillerin ("gittim", "aldım") öznesi her zaman kendisidir.

Yazım: onun ağzından, birinci tekil, geçmiş zaman, sıcak ve sade. Her alan en fazla 2-3 kısa cümle. Süsleme, genelleme, motivasyon cümlesi yok; somut ol (ne, nerede, kimle).
Doğruluk: yalnızca malzemenin desteklediğini yaz. Bir alan için malzemede karşılık yoksa o alana null koy; boşluğu tahminle doldurma. Farklı zamanlardaki olayları birleştirme.

Yalnızca şu JSON nesnesini döndür:
{
  "baslik": "bu döneme 3-6 kelimelik bir ad",
  "anlar": {
    "zafer": {"baslik": "kısa ad", "tarih": "ay (ve varsa gün)", "anlatim": "dönemin en büyük başarısı / sevinci"} ,
    "ters_kose": {"baslik": "", "tarih": "", "anlatim": "beklenmedik gelişme, planın tersine dönen şey ya da hayal kırıklığı", "alinti": "malzemede BENİM yazdığım bir mesajdan, bu anla ilgili, harfi harfine kopyalanmış kısa parça (en fazla 20 kelime; yazım hatalarıyla birlikte aynen) ya da null"},
    "basrol": {"baslik": "", "tarih": "", "anlatim": "sahnenin tam ortasında olduğum, ilginin bende olduğu an", "yer": "nerede geçtiği, 2-5 kelime, ya da null", "sarki": "o anla ya da dönemle özdeşleşen şarkı (yalnızca malzemede geçiyorsa) ya da null"}
  },
  "kapak_cumlesi": "bu dönemi dışarıdan anlatan tek bir cümle; üçüncü tekil ('…bir kızın …', '…birinin …' gibi), şiirsel ama somut, en fazla 25 kelime, tırnaksız",
  "odak_basligi": "bir emoji + bu dönemin ruhunu anlatan 4-8 kelimelik başlık",
  "mod": {
    "baskin": ["Ters Yüz karakterlerinden en baskın 1-2 duygu; yalnızca şunlardan: Neşe, Üzüntü, Öfke, Korku, Tiksinti, Kaygı, Kıskançlık, Can Sıkıntısı, Utanç"],
    "aylar": [{"ay": "ay adı", "puan": "1-10 arası tam sayı; o ayki genel ruh halim (1 en kötü)", "etiket": "o ayı anlatan 1-3 kelime"}],
    "dip": "dönemin en zor anının kısa adı",
    "zirve": "dönemin en iyi anının kısa adı"
  },
  "hedefler": [{"baslik": "o dönem peşinde olduğum somut bir hedef", "durum": "tamamlandı | sürüyor | yarım kaldı", "aciklama": "kısa sonuç, tek cümle"}],
  "sorular": ["bugünkü halimin bu dönemdeki halime sorabileceği kısa, samimi bir soru"],
  "zihin": {
    "dusunceler": "kafamı en çok meşgul eden düşünceler",
    "hayaller": "istediklerim, kurduğum planlar",
    "kaygilar": "dert ettiklerim, korktuklarım",
    "duygular": "genel ruh halim, sık hissettiklerim"
  },
  "eslikciler": {
    "muzik": ["dinlediğim sanatçı / şarkı, en fazla 6"],
    "takintilar": ["o aralar taktığım şeyler (dizi, kanal, konu, yiyecek, oyun…), en fazla 5, her biri birkaç kelime"],
    "rituel": ["tekrar eden alışkanlıklarım, en fazla 4, her biri birkaç kelime"]
  },
  "insan": "${facts.top ? `${facts.top.name} ile aramız nasıldı, neler konuşurduk, o dönem benim için neydi` : "null"}",
  "o_zaman_simdi": ${now ? `[{"konu": "kısa konu adı", "o_zaman": "o dönem nasıldı", "simdi": "şimdi nasıl"}]` : "null"},
  "ayni_kalan": ${now ? `["o günden bugüne değişmeyen şeyler, 3-5 madde, her biri tek kısa cümle"]` : "null"}
}
"mod.aylar" tam olarak şu aylar için, bu sırayla: ${months(period, persona).join(", ")}. "hedefler" 3-4 madde; durumu yalnızca malzemeye${now ? " ve şimdiki hale" : ""} göre belirle, bilinmiyorsa "sürüyor" de. "sorular" tam 3 madde, bugünkü halimin ağzından, o dönemin somut olaylarına dokunsun.
${now ? `"o_zaman_simdi" için 3-5 satır yaz: yalnızca hem o dönemde hem şimdide karşılığı olan konular (hedefler, dertler, insanlar, alışkanlıklar, konuşma tarzı). "ayni_kalan" yalnızca iki tarafta da görülen şeyler olsun.` : ""}

YEREL OLARAK HESAPLANMIŞ GERÇEKLER
- Bu dönemde birebir en çok yazıştığım kişi: ${facts.top?.name ?? "bilinmiyor"}
- YouTube'da en çok dinlediğim müzik kanalları (çoktan aza; plak şirketi/derleme kanallarını ve müzik olmayanı ele): ${facts.artists.length ? facts.artists.join(", ") : "kayıt yok (müzik için malzemedeki diğer izlere bak; yoksa null)"}
- En çok açtığım parçalar: ${facts.tracks.length ? facts.tracks.join(" · ") : "kayıt yok"}
${persona?.card ? `\nO DÖNEMİN PORTRESİ (önceden çıkarılmış)\n${persona.card}\n${persona.memories ? `\nO DÖNEMDE OLANLAR\n${persona.memories}\n` : ""}` : ""}${now ? `\nŞİMDİKİ HALİ (${now.now}; yalnızca karşılaştırma için)\n${now.card}\n` : ""}`;

const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
// donemin aylari; en guncel donem "simdi"de biter (or. temmuz–kasim)
function months(period, persona) {
  const start = period[5] === "1" ? 0 : 6;
  const lastName = persona?.now?.split(" ")[0];
  let end = start + 6;
  const li = AY.indexOf(lastName);
  if (li >= start && li < start + 6 && persona?.now?.endsWith(period.slice(0, 4))) end = li + 1;
  return AY.slice(start, end);
}

// ALTIN KURAL: alinti kendi mesajlarimda birebir gecmiyorsa atilir
const norm = (t) => t.normalize("NFC").replace(/\s+/g, " ").trim();
function findQuote(quote, own) {
  if (typeof quote !== "string") return null;
  const q = norm(quote.replace(/^["“”«»'‘’]+|["“”«»'‘’.…]+$/g, ""));
  if (q.length < 4) return null;
  const ql = q.toLocaleLowerCase("tr");
  const hit = own.find((it) => norm(it.text).includes(q)) ?? own.find((it) => norm(it.text).toLocaleLowerCase("tr").includes(ql));
  if (!hit) return null;
  const t = norm(hit.text), i = t.toLocaleLowerCase("tr").indexOf(ql);
  return { text: t.slice(i, i + q.length), timestamp: hit.timestamp };
}

export async function buildRecap(period) {
  const persona = loadPersona(period);
  if (!persona?.card) return null;
  const all = periods();
  const now = period === all[0] ? null : loadPersona(all[0]);
  const facts = localFacts(period);
  const name = ownerProfile()?.extra?.name ?? "bu kişi";
  let material = buildDossier(period).text;
  if (facts.top) {
    const t = facts.top.texts.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
    const step = Math.max(1, Math.floor(t.length / 90));
    material += `\n\n## ${facts.top.via ? `${facts.top.name} ile ortak grubumuza (${facts.top.via})` : `${facts.top.name} kişisine`} yazdıklarımdan\n` +
      t.filter((_, i) => i % step === 0).slice(0, 90).map((it) => `[${(it.timestamp ?? "").slice(5, 10)}] ${it.text.slice(0, 200)}`).join("\n");
  }
  const sys = PROMPT(period, name, persona, facts, now?.card ? now : null);
  let data = null, err = "";
  for (let i = 0; i < 2 && !data; i++) {
    const out = await chat({ system: sys, messages: [{ role: "user", content: material.toWellFormed() }] },
      { max_tokens: 20000, temperature: 0.3, json: true });
    try { data = JSON.parse((out.reply ?? "").match(/\{[\s\S]*\}/)?.[0] ?? ""); } catch (e) { err = out.error ?? e.message; }
  }
  if (!data) throw new Error(`${period}: özet üretilemedi (${err})`);
  // model bazen anahtarlari Turkce harfle yaziyor ("baskın")
  if (data.mod && !data.mod.baskin && data.mod["baskın"]) { data.mod.baskin = data.mod["baskın"]; delete data.mod["baskın"]; }
  const q = findQuote(data.anlar?.ters_kose?.alinti, facts.own);
  if (data.anlar?.ters_kose) {
    data.anlar.ters_kose.alinti = q?.text ?? null;
    if (q) data.anlar.ters_kose.alinti_tarih = q.timestamp;
  }
  const prev = loadRecap(period);
  const recap = {
    period, label: periodLabel(period), now: persona.now, age: persona.age,
    person: facts.top ? { name: facts.top.name } : null,
    stats: facts.stats,
    muzik_sayilari: facts.topTracks,
    // elle secilmis kapak korunur
    kapak_gorseli: prev?.kapak_gorseli_elle ? prev.kapak_gorseli : facts.cover,
    ...(prev?.kapak_gorseli_elle && { kapak_gorseli_elle: true }),
    ...data, built_at: new Date().toISOString(),
  };
  writeFileSync(file(period), JSON.stringify(recap, null, 2));
  return recap;
}
