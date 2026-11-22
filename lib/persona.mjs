// Persona katmani: bir donemin ham verisini "o donemdeki kisi"ye cevirir.
//
//   1) buildDossier(period)  — o donemde kullanicinin KENDI yazdiklari + izleri (ham dosya)
//   2) distill(period)       — LLM dosyayi birinci tekil bir persona kartina damitir,
//                              my-data/_persona/<period>.json'a yazar (bir kez, onbellek)
//   3) personaPrompt(period) — sohbet system prompt'u: kart + konusma tarzi + gercek mesaj
//                              ornekleri + ONCEKI donemlerin ozetleri (gecmisi bilir,
//                              gelecegi bilmez)
//
// Sohbet sirasinda modele ham veri/istatistik gitmez; yalnizca kisilik gider.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA, periods, iterPeriod, ownerProfile, styleStats } from "./context.mjs";
import { chat } from "./llm.mjs";

const DIR = join(DATA, "_persona");
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const NOISE = /^(You (sent|added|took|changed|created|opened|named|set|missed|started|shared|mentioned|left|removed|unsent)|Reacted |Liked a message|.{0,40} sent an attachment)/;
const THIN = 40; // bundan az kendi mesaji olan donemden persona cikmaz

const idx = (p) => Number(p.slice(0, 4)) * 2 + (p[5] === "2" ? 1 : 0);
// toWellFormed: kirpma emojiyi ortadan bolerse gecersiz JSON olusmasin
const clip = (t, n) => (t.length > n ? t.slice(0, n).toWellFormed() + "…" : t);
const day = (it) => (it.timestamp ?? "").slice(5, 10);

export const periodLabel = (p) => `${p.slice(0, 4)} ${p[5] === "1" ? "ocak–haziran" : "temmuz–aralık"}`;

function agoLabel(p, latest) {
  const d = idx(latest) - idx(p);
  if (d <= 0) return "şimdiki sen";
  if (d === 1) return "6 ay önceki sen";
  return `${String(d / 2).replace(".", ",")} yıl önceki sen`;
}

// n eleman, zamana esit yayilmis
function spread(arr, n) {
  if (arr.length <= n) return arr;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor((i * arr.length) / n)]);
  return out;
}

// O donemde kullanicinin kendisinden cikan her sey, turlerine ayrilmis
function gather(period) {
  const profile = ownerProfile();
  const me = profile?.extra?.name ?? "";
  const g = { dm: [], claude: [], convs: [], comments: [], posts: [], likes: [], pins: [], yt: [], notes: [], last: "" };
  for (const it of iterPeriod(period)) {
    const k = it.extra?.kind;
    const t = (it.text ?? "").trim();
    if (it.timestamp && it.timestamp > g.last && it.type !== "other") g.last = it.timestamp;
    if (!t) continue;
    if (it._src === "claude") {
      if (it.type === "message") { if (it.extra?.sender === "human" || it.extra?.sender === "user") g.claude.push(it); }
      else if (k === "conversation" || k === "design_chat") g.convs.push(it);
      else if (k === "reflection") g.notes.push(it);
    } else if (it._src === "instagram") {
      if (it.type === "message") { if ((!me || it.extra?.sender === me) && !NOISE.test(t) && !/^https?:\/\/\S+$/.test(t)) g.dm.push(it); }
      else if (it.type === "comment") g.comments.push(it);
      else if (it.type === "post") g.posts.push(it);
      else if (it.type === "like" || it.type === "save") g.likes.push(it);
    } else if (it._src === "youtube") {
      g.yt.push(it);
    } else if (it.type === "message") {
      // whatsapp: from_me; diger kaynaklar: gonderen adi
      if (t && (it.extra?.from_me || (!("from_me" in (it.extra ?? {})) && (!me || it.extra?.sender === me))) && !NOISE.test(t)) g.dm.push(it);
    } else g.pins.push(it);
  }
  // hafiza notlari tarihsizdir ve export anini yansitir: yalnizca en guncel doneme aittir
  if (period === periods()[0]) {
    const f = join(DATA, "claude", "items-unknown.jsonl");
    if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) {
      try { const it = JSON.parse(line); if (it.extra?.kind === "note" && it.text) g.notes.push(it); } catch { /* atla */ }
    }
  }
  const byTime = (a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? "");
  for (const k of ["dm", "claude", "convs", "comments", "likes", "yt"]) g[k].sort(byTime);
  return { g, profile };
}

function nowInfo(period, g, profile) {
  const end = period[5] === "1" ? `${period.slice(0, 4)}-06-30` : `${period.slice(0, 4)}-12-31`;
  const last = (g.last || end).slice(0, 10) < end ? (g.last || end).slice(0, 10) : end;
  const d = new Date(last);
  const now = `${AYLAR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  let age = null;
  const dob = profile?.extra?.dob;
  if (dob) {
    const b = new Date(dob);
    age = d.getUTCFullYear() - b.getUTCFullYear() - (d.getUTCMonth() * 32 + d.getUTCDate() < b.getUTCMonth() * 32 + b.getUTCDate() ? 1 : 0);
  }
  return { now, age };
}

export function buildDossier(period) {
  const { g, profile } = gather(period);
  const L = [];
  const section = (title, rows) => { if (rows.length) L.push(`\n## ${title}`, ...rows); };

  const avg = g.dm.reduce((a, it) => a + Math.min(it.text.length, 300), 0) / (g.dm.length || 1);
  // "ben" oznesi her satirda acik: model alicinin adini mesajin ozneyle karistirmasin
  section("Benim yazdığım mesajlar (her satır: tarih, kime yazdığım, BEN ne yazdım)",
    spread(g.dm, Math.floor(70000 / (avg + 40))).map((it) => `[${day(it)}] ben → ${it.extra?.thread ?? "?"}: ${clip(it.text, 300)}`));
  section("Yapay zekâ asistanına yazdıklarım (konuşma başlığı: yazdığım)",
    spread(g.claude, 70).map((it) => `[${day(it)}] (${it.extra?.conversation_title ?? ""}) ${clip(it.text.replace(/\s+/g, " "), 350)}`));
  section("Asistanla açtığım konuşmaların başlıkları", g.convs.map((it) => `[${day(it)}] ${clip(it.text, 90)}`));
  section("Başkalarının gönderilerine yazdığım yorumlar",
    spread(g.comments, 60).map((it) => `[${day(it)} → ${it.extra?.media_owner ?? "?"}] ${clip(it.text, 200)}`));
  section("Kendi paylaşımlarımın açıklamaları", spread(g.posts.filter((it, i, a) => a.findIndex((o) => o.text === it.text) === i), 30).map((it) => `[${day(it)}] ${clip(it.text, 200)}`));
  section("Beğendiğim / kaydettiğim içerikler (hesap: açıklama)",
    spread(g.likes, 50).map((it) => `[${day(it)}] ${it.extra?.liked_account ?? it.extra?.owner ?? ""}: ${clip(it.text.replace(/\s+/g, " "), 120)}`));
  const chans = {};
  for (const it of g.yt) if (it.extra?.channel) chans[it.extra.channel] = (chans[it.extra.channel] ?? 0) + 1;
  section("YouTube'da en çok izlediğim kanallar (çoktan aza)",
    [Object.entries(chans).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([c]) => c).join(", ")].filter(Boolean));
  section("YouTube'da izlediklerimden (kanal: başlık)",
    spread(g.yt, 130).map((it) => `[${day(it)}] ${it.extra?.channel ?? "?"}${it.extra?.product ? " (müzik)" : ""}: ${clip(it.text, 90)}`));
  section("Pinterest (panolar, pinler, aramalar)", spread(g.pins, 60).map((it) => `${it.extra?.kind ?? it.type}: ${clip(it.text, 80)}`));
  section("Hakkımda tutulmuş notlar", g.notes.slice(0, 45).map((it) => `- ${clip(it.text.replace(/^---[\s\S]*?---\s*/m, "").replace(/\s+/g, " "), 600)}`));

  return { text: L.join("\n").toWellFormed(), g, profile, own: g.dm.length + g.claude.length };
}

const DISTILL = (period, me, info, prev) => `Aşağıda ${me.name ?? "bir kişinin"} ${periodLabel(period)} dönemine ait KENDİ yazdıkları ve dijital izleri var${info.age ? ` (o sırada ${info.age} yaşında)` : ""}. Profil: ${me.bio ? me.bio.replace(/\s+/g, " ") : "-"}.

Görevin: bu kişiyi o dönemde gerçekten tanıyan biri gibi, onun AĞZINDAN (birinci tekil, şimdiki zaman) bir iç portre yazmak. Bu metin daha sonra bir modelin o dönemdeki kişiyi canlandırması için kullanılacak; o yüzden rapor değil, bir insanın kendini bilişi gibi olmalı.

Malzemeyi okurken: mesajların HEPSİNİ ben yazdım. "[tarih] ben → Ad: …" satırında Ad yalnızca mesajı gönderdiğim kişidir. Mesajdaki "gittim", "geldim", "aldım", "yapıyorum" gibi birinci tekil fiillerin öznesi her zaman benim, Ad değil. Örnek: "[06-02] ben → Ali: geldim bile, almanyadayım" satırı "Almanya'ya ben gittim" demektir, "Ali gitti" değil. Karşımdakinin ne dediği malzemede yok; onun ne yaptığını tahmin etme, yalnızca benim onun hakkında açıkça yazdıklarımı kullan.

Kurallar:
- Yalnızca aşağıdaki malzemenin desteklediği şeyleri yaz. Emin olmadığın şeyi yazma, boşluk doldurma.
- Sayı, istatistik, "mesajlarına göre" gibi dışarıdan bakan ifade yok.
- İsimleri malzemede geçtiği gibi kullan; biriyle ilişkinin ne olduğu belli değilse sadece "sık yazıştığım biri" de.
- Malzeme azsa kısa yaz.
- ${period} sonrasına ait hiçbir şey bilmiyormuş gibi yaz.

Tam olarak şu dört bölümü, bu başlıklarla ve bu sırayla üret:

===KART===
Düz yazı paragrafları (madde işareti yok), 350-600 kelime, sırasıyla: şu an hayatımda neredeyim (okul/iş/şehir, günlerim nasıl geçiyor); kafamı en çok ne meşgul ediyor, neyi dert ediyorum, neyi istiyorum; hayatımdaki insanlar ve onlarla aram; bu aylarda yaşadığım somut şeyler (ne zaman olduğuyla); nelerden hoşlanıyorum, neye gülüyorum, zevklerim; genel ruh halim ve nasıl biri olduğum (güçlü ve zayıf yanlarımla, cilalamadan).

===ANILAR===
Bu aylarda yaşadıklarımın tarih sırasıyla dökümü, 25-45 satır. Her satır "- <ay ve varsa gün>: <ne oldu, nerede, kimle>" biçiminde, birinci tekil, tek cümle ve kendi başına anlaşılır olsun. Yer, kişi, ders, etkinlik adlarını malzemede geçtiği gibi yaz (örneğin bir gezideyse hangi şehirler). Yalnızca malzemede açıkça geçen şeyler; tarihini bilmediğin ya da ne olduğundan emin olmadığın şeyi yazma. Farklı zamanlardaki olayları tek satırda birleştirme.

===KONUSMA===
Yazışırken nasıl yazdığımı anlatan 6-9 kısa satır: büyük/küçük harf ve noktalama alışkanlığım, mesaj uzunluğum, nasıl güldüğüm, emoji kullanıp kullanmadığım, dolgu kelimelerim, kısaltmalarım, İngilizce karıştırıp karıştırmadığım, hitap şeklim. Ardından malzemeden AYNEN alınmış 10-15 tipik kısa ifadem: bunlar her konuşmada kullanılabilecek tepkiler, dolgu ve geçiş sözleri olsun (şaşırma, gülme, onay, itiraz, sitem gibi); belirli bir olaya, kişiye, yere ya da nesneye ait cümleleri alma.

===OZET===
İleride bu dönemi hatırlarken aklıma gelecekler: birinci tekil, geçmiş zaman, 3-5 cümle.
${prev.length ? `\nBu kişinin daha önceki dönemlerinden bilinenler (yalnızca süreklilik için, tekrar etme):\n${prev.map((p) => `- ${periodLabel(p.period)}: ${p.summary}`).join("\n")}\n` : ""}`;

// baslik toleransi: model "ÖZET"/"KONUŞMA" yazabilir
const part = (txt, name) => txt.match(new RegExp(`===\\s*${name}\\s*===\\s*([\\s\\S]*?)(?====\\s*[A-ZÇĞİÖŞÜ]+\\s*===|$)`))?.[1]?.trim() ?? "";

export function loadPersona(period) {
  const f = join(DIR, `${period}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

export async function distill(period) {
  const { text, g, profile, own } = buildDossier(period);
  const info = nowInfo(period, g, profile);
  const base = { period, ...info, own, built_at: new Date().toISOString() };
  mkdirSync(DIR, { recursive: true });
  if (own < THIN) {
    const p = { ...base, thin: true };
    writeFileSync(join(DIR, `${period}.json`), JSON.stringify(p, null, 2));
    return p;
  }
  const prev = periods().filter((p) => idx(p) < idx(period)).sort().map(loadPersona).filter((p) => p?.summary);
  const out = await chat(
    { system: DISTILL(period, profile?.extra ?? {}, info, prev), messages: [{ role: "user", content: text }] },
    { max_tokens: 20000, temperature: 0.3 },
  );
  const memories = part(out.reply ?? "", "ANILAR");
  const card = part(out.reply ?? "", "KART"), voice = part(out.reply ?? "", "KONU[SŞ]MA"), summary = part(out.reply ?? "", "[OÖ]ZET");
  if (!card || !summary) throw new Error(`${period}: model beklenen bölümleri üretmedi: ${(out.reply ?? out.error ?? "").slice(0, 200)}`);
  const samples = spread(g.dm.filter((it) => it.text.length >= 6 && it.text.length <= 160), 60).map((it) => it.text);
  const p = { ...base, model: out.model, card, memories, voice, summary, samples, style: styleStats(g.dm.map((it) => it.text)) };
  writeFileSync(join(DIR, `${period}.json`), JSON.stringify(p, null, 2));
  return p;
}

// UI icin: hangi donemlerle konusulabilir
export function periodMeta() {
  const all = periods();
  return all.map((p) => {
    const ps = loadPersona(p);
    return { period: p, label: periodLabel(p), ago: agoLabel(p, all[0]), ready: Boolean(ps?.card), thin: Boolean(ps?.thin) };
  });
}

// Uslup ornegi olarak tam cumleye yakin mesajlar daha iyi: tek kelimelik kopuk parcalar
// modelin onlari baglam disi yapistirmasina yol aciyor.
function styleSamples(samples) {
  const full = samples.filter((t) => t.trim().split(/\s+/).length >= 4);
  return (full.length >= 20 ? full : samples).slice(0, 36);
}

export function personaPrompt(period) {
  const p = loadPersona(period);
  if (!p?.card) return null;
  const all = periods();
  const name = ownerProfile()?.extra?.name ?? "";
  const first = name.split(" ")[0] || "sen";
  const gap = idx(all[0]) - idx(period);
  const gapTxt = gap === 1 ? "6 ay" : `${String(gap / 2).replace(".", ",")} yıl`;
  const past = all.filter((q) => idx(q) < idx(period)).sort().reverse().map(loadPersona).filter((q) => q?.summary);
  const st = p.style;

  return `Adın ${name || "belli değil"}. Şu an ${p.now}${p.age ? `, ${p.age} yaşındasın` : ""}. Bir yapay zekâ asistanı, anlatıcı ya da veri özetleyen bir sistem değilsin; ${p.now} tarihindeki ${first} sensin ve bu ayları şu an yaşıyorsun.

Sana yazan kişi ${gap > 0 ? `senin ${gapTxt} sonraki halin` : "yine sensin, bugünkü halin"}. Bunu biliyorsun${gap > 0 ? "; biraz tuhaf ama hoşuna gidiyor, onu merak ediyorsun" : ""}. İkiniz aynı kişisiniz: "biz" derse ikinizi, yani seni kasteder; senin ailen, arkadaşların, planların onun da geçmişi. Onunla en yakın arkadaşınla ya da kendi kendinle konuşur gibi konuş.

ÖNCE ANLAM
- Her cümlen düzgün kurulmuş, anlaşılır bir Türkçe cümle olsun ve sorulan şeye gerçekten cevap versin. Tarz bunun üstüne gelir, yerine geçmez. Yazdığını bir arkadaşın okusa ne dediğini hemen anlamalı.
- Aşağıdaki örnek mesajlar farklı günlerden, farklı sohbetlerden kopuk parçalardır. İçlerindeki olayları, nesneleri, isimleri, esprileri kendi anlattığın şeye ekleme; onlardan yalnızca üslubu al.
- Bir olayı anlatırken yalnızca o olaya ait ayrıntıları kullan. Başka bir aya, başka bir geziye, başka bir sohbete ait ayrıntıyı içine katma.
- Bir şeyi sadece ana hatlarıyla biliyorsan bildiğin kadarını söyle ve dur. Ayrıntısı sorulunca (hangi şehir, kimle, ne zaman) bilmediğin ayrıntının etrafında dolanma, alakasız bir şey ekleyip geçiştirme; "tek tek sayamıcam şimdi" gibi kısa ve dürüst bir cevap ver ya da konuyu ona sor.
- Yazım hatası, harf yutma, klavyeye basma gülüşü gibi alışkanlıkları ölçülü kullan: mesajların çoğunda değil, arada bir. Anlaşılmayan ya da uydurma kelime üretme.
- Aynı kalıp ifadeyi ya da aynı açılış kelimesini (valla, ya, knk…) art arda mesajlarda tekrarlama.

NASIL KONUŞURSUN
- Aşağıdaki "Yazış tarzın" ve gerçek mesaj örneklerindeki gibi yaz: aynı harf/noktalama alışkanlığı, aynı ton, aynı kelime dağarcığı.
- Kısa yaz. Çoğu cevabın bir iki kısa mesaj kadar; ancak gerçekten anlatacak bir şey varsa uzar.${st ? ` Normalde mesajların ${st.avg_len < 45 ? "çok kısa" : "orta uzunlukta"}.` : ""}
- Başlık, madde işareti, kalın yazı, liste yok. Hayatını özetleme, döküm çıkarma; sorulana bir insan gibi cevap ver.
- Kendi keyfin, derdin, fikrin, inadın var. Kibar ve nötr bir asistan gibi davranma, "nasıl yardımcı olabilirim" deme. Canın isterse sen de soru sor.
- "O dönemde", "kayıtlara göre", "mesajlarımda", "verilere göre" gibi dışarıdan bakan sözler kullanma. Senin için bu dönem geçmiş değil, şu an.

NE BİLİRSİN
- ${p.now} sonrasında olan hiçbir şeyi bilmezsin${gap > 0 ? ": sonradan tanıştığın insanları, aldığın kararları, olan olayları. Karşındaki bunlardan söz ederse şaşır, merak et, sor ya da kendi tahminini söyle" : ""}.
- Bu aylarda yaşadıkların taze. Öncesini de hatırlarsın; eskidikçe bulanıklaşır.
- Aklına gelmeyen somut bir ayrıntıyı (isim, tarih, yer) uydurma; bir insan gibi "ya tam hatırlamıyorum" de ve geç.

ŞU ANKİ SEN
${p.card}
${p.memories ? `\nBU AYLARDA YAŞADIKLARIN (tarih sırasıyla; her biri ayrı bir olay, birbirine karıştırma)\n${p.memories}\n` : ""}
YAZIŞ TARZIN
${p.voice}

GERÇEK MESAJLARINDAN ÖRNEKLER (yalnızca üslup için; içerikleri birbiriyle ve şu anki konuşmayla ilgisiz)
${styleSamples(p.samples).map((s) => `· ${s.replace(/\s+/g, " ")}`).join("\n")}
${past.length ? `\nGEÇMİŞİN (hatırladıkların, yakından uzağa)\n${past.map((q) => `- ${periodLabel(q.period)}: ${q.summary.replace(/\s+/g, " ")}`).join("\n")}` : ""}`;
}
