// Ters Yuz tarzi 16x16 piksel-art avatar — tamamen yerel, deterministik.
// Baskin duygu: govde rengi + yuz ifadesi. Ikinci duygu: sac stili + sac rengi.
//   pixelAvatar(["Neşe", "Kaygı"]) -> "<svg …>"

const BASE = [
  "................",
  "................",
  "................",
  ".....OOOOOO.....",
  "....OBBBBBBO....",
  "...OBBBBBBBBO...",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  "..OSBBBBBBBBSO..",
  "...OSBBBBBBSO...",
  "....OSSSSSSO....",
  ".....OOOOOO.....",
  "................",
];

// sac: satir -> desen (H = sac pikseli)
const HAIR = {
  spiky: { 1: "....H..H..H.....", 2: "....HH.HH.HH....", 3: "....HHHHHHHH....", 4: ".....H.HH.H....." },
  flame: { 0: ".......H...H....", 1: "......HHH.HH....", 2: ".....HHHHHHH....", 3: ".....HHHHHH....." },
  frizz: { 1: "....HHHHHHHH....", 2: "...HHHHHHHHHH...", 3: "..HHHHHHHHHHHH..", 4: "..HHHH....HHHH..", 5: "..HH........HH..", 6: "..H..........H.." },
  cap: { 3: "....HHHHHHHH....", 4: "...HHHHHHHHHH...", 5: "..HHH......HHH..", 6: "..HH........HH..", 7: "..H..........H.." },
  strand: { 0: "........H.......", 1: ".......H........", 2: ".......H........", 3: "......HH........" },
  swoosh: { 2: ".....HHHHH......", 3: "....HHHHHHHH....", 4: "...HHHHHHH......", 5: "...HHH.........." },
  tuft: { 1: ".......HH.......", 2: "......HHHH......", 3: ".....HHHHHH....." },
  bangs: { 3: "....HHHHHHHH....", 4: "...HHHHHHHHHH...", 5: "..HHHHHHHHHHHH..", 6: "..HH........HH.." },
  none: {},
};

// gozler 3x3 (satir 6-8; sol x=4, sag x=9). R verilmezse L aynalanir.
const EYES = {
  happy: { L: ["...", ".K.", "K.K"] },
  sad: { L: ["..K", "...", ".K."] },
  angry: { L: ["K..", ".KK", ".K."] },
  wide: { L: ["WWW", "WKW", "WWW"] },
  nervous: { L: ["WWW", "WWK", "WWW"], R: ["WWW", "WWK", "WWW"] },
  droopy: { L: ["...", "KKK", ".K."] },
  shy: { L: ["...", "...", "KKK"] },
  disgust: { L: ["...", "KKK", ".K."], R: ["KK.", "...", ".K."] },
  envy: { L: ["WWW", "WKW", "WKW"] },
};

// agiz 4x2 (satir 10-11, x=6)
const MOUTH = {
  grin: ["MTTM", ".MM."], frown: [".KK.", "K..K"], angry: ["KKKK", "K..K"], o: [".MM.", ".MM."],
  teeth: ["TTTT", "MMMM"], smirk: ["...K", "KKK."], flat: ["....", "KKKK"], wavy: ["K.K.", ".K.K"], small: [".KK.", "...."],
};

export const EMOTIONS = {
  "Neşe":          { body: "#FFD84A", shade: "#E0A800", tile: "#FFF1B8", eyes: "happy",   mouth: "grin",  hair: "spiky",  hairColor: "#2F6FD6", cheeks: true },
  "Üzüntü":        { body: "#6FA8F5", shade: "#3F74C4", tile: "#DCEBFF", eyes: "sad",     mouth: "frown", hair: "cap",    hairColor: "#1F3F8A", glasses: true, tear: true },
  "Öfke":          { body: "#F0533F", shade: "#B32D1E", tile: "#FFD9D2", eyes: "angry",   mouth: "angry", hair: "flame",  hairColor: "#FF9F1C" },
  "Korku":         { body: "#B48AE6", shade: "#7D52B8", tile: "#EFE4FF", eyes: "wide",    mouth: "o",     hair: "strand", hairColor: "#4C1D95" },
  "Tiksinti":      { body: "#7DD36B", shade: "#4C9A3E", tile: "#DDF6D7", eyes: "disgust", mouth: "smirk", hair: "swoosh", hairColor: "#14532D" },
  "Kaygı":         { body: "#FF9A3C", shade: "#D0661A", tile: "#FFE3C7", eyes: "nervous", mouth: "teeth", hair: "frizz",  hairColor: "#8A3B12" },
  "Kıskançlık":    { body: "#3FD1C0", shade: "#1F978A", tile: "#D2F5F0", eyes: "envy",    mouth: "small", hair: "tuft",   hairColor: "#0F5F57" },
  "Can Sıkıntısı": { body: "#7B7FD6", shade: "#4E52A3", tile: "#E2E3F7", eyes: "droopy",  mouth: "flat",  hair: "bangs",  hairColor: "#2E2A6E" },
  "Utanç":         { body: "#FF8FB8", shade: "#D45E8A", tile: "#FFE0EC", eyes: "shy",     mouth: "wavy",  hair: "none",   hairColor: "#C2185B", cheeks: true },
};

const INK = "#2B1D2E";

export function avatarGrid(baskin) {
  const list = (baskin ?? []).filter((e) => EMOTIONS[e]);
  const main = EMOTIONS[list[0]];
  if (!main) return null;
  const second = EMOTIONS[list[1]];
  // ikinci duygu sacini verir; sacsiz bir duyguysa (Utanc) stil anadan, renk ikinciden
  const hairStyle = second && second.hair !== "none" ? second.hair : main.hair;
  const hairColor = second ? second.body : main.hairColor;

  const g = BASE.map((r) => r.split(""));
  const put = (x, y, c) => { if (c !== "." && g[y]?.[x] !== undefined) g[y][x] = c; };
  const stamp = (rows, x0, y0) => rows.forEach((row, dy) => [...row].forEach((c, dx) => put(x0 + dx, y0 + dy, c)));

  // cizim sirasi: sac -> gozluk (cerceve + cam) -> gozler -> agiz/yanak
  for (const [y, row] of Object.entries(HAIR[hairStyle])) [...row].forEach((c, x) => put(x, Number(y), c));
  if (main.glasses) {
    // yuvarlak camlar: koseler bos, ortada tek kopru
    for (const x0 of [3, 8]) {
      for (let x = x0 + 1; x <= x0 + 3; x++) { put(x, 5, "G"); put(x, 9, "G"); }
      for (let y = 6; y <= 8; y++) { put(x0, y, "G"); put(x0 + 4, y, "G"); for (let x = x0 + 1; x < x0 + 4; x++) put(x, y, "L"); }
    }
    for (const y of [6, 8]) { put(7, y, "B"); put(8, y, "B"); }
  }
  const eye = EYES[main.eyes];
  stamp(eye.L, 4, 6);
  stamp(eye.R ?? eye.L.map((r) => [...r].reverse().join("")), 9, 6);
  stamp(MOUTH[main.mouth], 6, 10);
  if (main.cheeks) { put(3, 9, "C"); put(4, 9, "C"); put(11, 9, "C"); put(12, 9, "C"); }
  if (main.tear) put(4, 10, "D");
  // sacin disina 1px kontur
  const hair = [];
  g.forEach((row, y) => row.forEach((c, x) => { if (c === "H") hair.push([x, y]); }));
  for (const [x, y] of hair) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g[y + dy]?.[x + dx] === ".") g[y + dy][x + dx] = "O";

  const palette = {
    O: INK, K: INK, G: "#22346B", B: main.body, S: main.shade, H: hairColor, W: "#FFFFFF", T: "#FFFFFF",
    M: "#5A1530", L: "#E8F3FF", C: list[0] === "Utanç" ? "#E8467F" : "#FF7FA8", D: "#BFE6FF",
  };
  return { grid: g.map((r) => r.join("")), palette, tile: main.tile, main: list[0], second: list[1] ?? null };
}

export function pixelAvatar(baskin, { size = 64 } = {}) {
  const a = avatarGrid(baskin);
  if (!a) return "";
  let rects = "";
  a.grid.forEach((row, y) => {
    // ayni renkli yatay kosulari tek dikdortgende birlestir
    for (let x = 0; x < 16;) {
      const c = row[x];
      let w = 1;
      while (x + w < 16 && row[x + w] === c) w++;
      if (c !== ".") rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${a.palette[c]}"/>`;
      x += w;
    }
  });
  const label = a.second ? `${a.main} yüzü, ${a.second} saçı` : a.main;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${label}"><title>${label}</title>${rects}</svg>`;
}
