// Картинки. Сессия визуала кладёт готовые ассеты в ../assets и описывает их в ../assets/manifest.json
// ({style, ready: [{name, file, …}], todo}). Чего там нет — берётся из утверждённого концепта.
const C = "assets/";
const FALLBACK = {
  "bg-street": C + "gen/bg-lane.webp",
  "trooper-amber": C + "gen/trooper-amber.webp", "trooper-sapphire": C + "gen/trooper-sapphire.webp",
  "cur-farm": C + "gen/cur-farm.webp", "cur-stream": C + "gen/cur-stream.webp",
  "cur-ash": C + "gen/ash.webp", "cur-seal": C + "gen/seal.webp", "cur-shard": C + "gen/shard.webp", "wisp": C + "gen/wisp.webp",
  "orb": C + "gen/cur-farm.webp",
  "sk-flurry": C + "gen/sk-flurry.webp", "sk-rage": C + "gen/sk-rage.webp", "sk-greed": C + "gen/sk-greed.webp",
  "sk-mark": C + "gen/sk-mark.webp", "sk-ult": C + "gen/sk-ult.webp", "sk-rewind": C + "gen/sk-rewind.webp",
  "whip": C + "act-whip.webp", "whip-cursor": C + "act-whip.webp",
};
// Пока своей картинки нет, предмет показывается значком-заменой.
const ALIAS = {
  "item-l-frenzy": "medal-gold", "item-l-cheat": "medal-gold", "item-l-echo": "medal-gold",
  "item-x-curse": "medal-violet", "item-x-carpet": "medal-violet", "item-x-weave": "medal-violet",
};
const DISTRICTS = ["bg-street", "bg-docks", "bg-theater", "bg-rooftops"];   // район меняется каждые 100 волн
const ready = {};

export async function loadArt() {
  try {
    const r = await fetch("assets/manifest.json", { cache: "no-store" });
    if (!r.ok) return;
    const m = await r.json();
    const list = Array.isArray(m) ? m : Array.isArray(m.ready) ? m.ready : Array.isArray(m.assets) ? m.assets : [];
    for (const a of list) {
      if (!a || !a.name || !a.file) continue;
      if (a.status && a.status !== "ready") continue;
      ready[a.name] = "assets/" + a.file;
    }
  } catch (e) { /* манифеста нет — играем на картинках концепта */ }
}
export const has = (name) => !!ready[name];
export const art = (name) => ready[name] || (ALIAS[name] && ready[ALIAS[name]]) || FALLBACK[name] || C + name + ".webp";
export const heroArt = (id) => ready["hero-" + id] || "art/heroes/hero-" + id + ".webp";
export const tskinArt = (id) => "art/troopers/" + id + ".webp";        // скин трупера (tools/cut_troopers.py)
export const rpgSkinArt = (id) => "art/skins/skin-" + id + ".webp";     // скин героя из RPG стрима, 320×420
export function districtArt(z, tall) {                      // tall — поле узкое: берём вертикальный вариант фона
  const name = DISTRICTS[Math.floor((Math.max(1, z) - 1) / 100) % DISTRICTS.length];
  const base = has(name) ? name : "bg-street";
  return art(tall && has(base + "-v") ? base + "-v" : base);
}
export function applyArt(root) {
  root.querySelectorAll("[data-art]").forEach((el) => { el.src = art(el.dataset.art); });
}
