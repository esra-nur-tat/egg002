// Meta/TikTok export'larinda sik gorulen mojibake duzeltmesi.
// UTF-8 baytlari Latin-1/CP1252 olarak okununca "Ã§oook" / "â€™" gibi bozulur.
// Cozum: karakterleri bayta geri cevirip UTF-8 olarak yeniden coz.
// CP1252'nin 0x80-0x9F araligindaki ozel karakterleri ayri tablodan cevrilir.

const CP1252_HIGH = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
  "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c,
  "ž": 0x9e, "Ÿ": 0x9f,
};

// Mojibake kosusu: UTF-8 baslangic bayti (C2-F4) + 1-3 devam bayti (80-BF ya da CP1252 karsiligi).
// Normal Turkce metinde bu ikili yan yana gelmez ("Ä±" = ı, "ÅŸ" = ş, "Ã¼" = ü, "ðŸ˜‡" = emoji).
const HIGH = Object.keys(CP1252_HIGH).join("");
const RUN = new RegExp(`(?:[\\u00C2-\\u00F4][\\u0080-\\u00BF${HIGH}]{1,3})+`, "g");
const HINT = new RegExp(`[\\u00C2-\\u00F4][\\u0080-\\u00BF${HIGH}]`);

function decode(str) {
  const bytes = Uint8Array.from(str, (c) => {
    const b = CP1252_HIGH[c] ?? c.charCodeAt(0);
    if (b > 0xff) throw new RangeError("bayt degil");
    return b;
  });
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function fixMojibake(str) {
  if (typeof str !== "string" || !HINT.test(str)) return str;
  try {
    return decode(str); // metnin tamami bozuksa (Meta export'larinin olagan hali)
  } catch {
    // karisik metin: dogru yazilmis kisimlar yaninda bozuk parcalar — yalnizca bozuk kosulari coz
    return str.replace(RUN, (m) => { try { return decode(m); } catch { return m; } });
  }
}
