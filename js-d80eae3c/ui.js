// Интерфейс: полоса волны, счётчик душ, отряд, предметы и коллекция, реликвии, путь, чат, умения, бафы, окна.
// Правило экрана: всё, что можно открыть, видно с первой секунды — закрытое показано с условием.
import { CFG, HEROES, SKILLS, BUFFS, RELICS, UNLOCKS, ROAD_EXTRA, bossOf, ITEMS, ITEM_MAX, BRANCH, branchTier, RARITY, STARS, heroCost0 } from "./data.js";
import * as C from "./core.js";
import { NEG, fmt, txt, tierOf, group, setSci } from "./num.js";
import { sfx, setSound } from "./audio.js";
import { art, heroArt, applyArt } from "./art.js";
import * as FX from "./fx.js";
import * as TW from "./stream.js";
import * as TOP from "./top.js";

const $ = (id) => document.getElementById(id);
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const RANK = ["", "I", "II", "III", "IV"];
const TABS = [["squad", "Отряд"], ["items", "Предметы"], ["relics", "Реликвии"], ["road", "Путь"], ["top", "Топ"], ["chat", "Чат"]];
let S = null, api = null;
let buyMode = 1, tab = "squad", rows = [], shownLg = NEG, lastSfx = null, lastK = -1, bankText = null, bankSfx = null;
let slowT = 0, pipsKey = "", skillEls = {}, relicEls = {}, holdT = 0, holding = false, bulkShown = null;
let draftKey = "", itemsKey = "", rosterKey = "", roadKey = "", collSel = null, relicsBuilt = false, chatBuilt = false;

export function mount(state, hooks) {
  S = state; api = hooks;
  applyArt(document);
  const num = $("bankNum"); num.textContent = "";
  bankText = document.createTextNode("0"); bankSfx = document.createElement("span"); bankSfx.className = "sfx"; bankSfx.hidden = true;
  num.appendChild(bankText); num.appendChild(bankSfx);

  $("modeSeg").addEventListener("click", (e) => { const m = e.target.dataset.mode; if (m) { C.setMode(S, m); slowT = 0; } });
  $("btnBoss").addEventListener("click", () => { C.goBoss(S); slowT = 0; });
  $("buySeg").addEventListener("click", (e) => { const m = e.target.dataset.m; if (m && !e.target.classList.contains("lockd")) { buyMode = m === "ms" || m === "max" ? m : Number(m); drawBuySeg(); slowT = 0; } });
  $("mercList").addEventListener("click", (e) => {
    const b = e.target.closest(".buy"); if (!b || b.classList.contains("off")) return;
    if (C.buy(S, Number(b.dataset.i), buyMode)) slowT = 0; else sfx.deny();
  });
  $("tabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) { tab = t.dataset.t; drawTabs(); slowT = 0; } });
  $("skillbar").addEventListener("click", (e) => { const s = e.target.closest(".skill"); if (s && !s.classList.contains("lock")) { if (!C.useSkill(S, s.dataset.id)) sfx.deny(); slowT = 0; } });
  $("relicList").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !b.classList.contains("off")) { if (C.buyRelic(S, b.dataset.id)) { sfx.buy(); slowT = 0; } } });
  $("draft").addEventListener("click", (e) => { const c = e.target.closest(".dcard"); if (c && C.pickItem(S, c.dataset.id)) { slowT = 0; draftKey = "?"; } });
  $("collGrid").addEventListener("click", (e) => { const t = e.target.closest(".ctile"); if (t) { collSel = t.dataset.id; itemsKey = ""; drawItems(); } });
  $("btnSound").addEventListener("click", () => { S.set.sound = !S.set.sound; setSound(S.set.sound); drawSound(); });
  $("btnMenu").addEventListener("click", openSettings);
  $("veil").addEventListener("click", closeModal);
  bindHold($("btnRebirth"));
  TW.mount(S, { changed: () => { slowT = 0; api.settings(); } });
  TOP.mount(S, { toast });
  drawSound(); drawBuySeg(); buildSkills(); drawTabs();
}
export function setState(state) {
  S = state; rows = []; $("mercList").textContent = ""; shownLg = NEG; lastK = -1; slowT = 0;
  itemsKey = rosterKey = roadKey = ""; draftKey = "?"; relicsBuilt = false; TW.setState(S); TOP.setState(S); drawTabs();
}

function drawSound() {
  const b = $("btnSound");
  b.classList.toggle("off", !S.set.sound);
  b.innerHTML = S.set.sound
    ? '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5zM14.5 4.3v2.1a6 6 0 0 1 0 11.2v2.1a8 8 0 0 0 0-15.4z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm15.6 3 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z"/></svg>';
}
function drawBuySeg() {
  const modes = [[1, "×1"], [10, "×10"], ["ms", "до вехи"], ["max", "макс"]];
  if (!S.un.bulk) buyMode = 1;
  $("buySeg").innerHTML = modes.map(([m, l]) => '<span data-m="' + m + '" class="' + (m === buyMode ? "on" : "") + (!S.un.bulk && m !== 1 ? " lockd" : "") + '"' +
    (!S.un.bulk && m !== 1 ? ' title="Откроется на 5-й волне"' : "") + ">" + l + "</span>").join("");
}
function drawTabs() {
  $("tabs").innerHTML = TABS.map(([t, l]) => '<span class="tab' + (t === tab ? " on" : "") + '" data-t="' + t + '">' + l + "</span>").join("");
  for (const [t] of TABS) $("pane" + t[0].toUpperCase() + t.slice(1)).hidden = tab !== t;
  if (tab === "relics") buildRelics();
  if (tab === "items") { itemsKey = ""; drawItems(); }
  if (tab === "road") { roadKey = ""; drawRoad(); }
  if (tab === "chat") buildChat();
  if (tab === "top") TOP.open();
}

// ---------- удержание кнопки возрождения ----------
function bindHold(b) {
  const stop = () => { holding = false; holdT = 0; b.style.setProperty("--p", "0%"); };
  b.addEventListener("pointerdown", (e) => {
    if (b.classList.contains("weak")) { sfx.deny(); return; }
    holding = true; holdT = 0;
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* указатель уже отпущен */ }
  });
  b.addEventListener("pointerup", stop); b.addEventListener("pointercancel", stop); b.addEventListener("lostpointercapture", stop);
}
function stepHold(dt) {
  if (!holding) return;
  holdT += dt;
  $("btnRebirth").style.setProperty("--p", Math.min(100, holdT / CFG.rebirthHold * 100).toFixed(0) + "%");
  if (holdT >= CFG.rebirthHold) { holding = false; holdT = 0; $("btnRebirth").style.setProperty("--p", "0%"); api.rebirth(); }
}

// ---------- отряд ----------
function rowHtml(i) {
  const whip = i === 0, h = whip ? null : HEROES[i - 1];
  return '<div class="por"><img alt="" src="' + (whip ? art("whip") : heroArt(h.id)) + '">' + (whip ? "" : '<span class="tier">' + (ROMAN[h.k] || h.k) + "</span>") + "</div>" +
    '<div><div class="name">' + (whip ? "Хлыст Лэша" : h.name) + ' <span class="lvl"><small>ур.</small><span data-f="lv">0</span></span></div>' +
    '<div class="meta"><span class="dmg">' + (whip ? "удар" : "урон") + ' <b data-f="dmg">0</b></span></div>' +
    '<div class="ms"><i></i></div><div class="ms-cap" data-f="cap"></div></div>' +
    '<button class="buy" data-i="' + i + '"><span class="q" data-f="q">×1</span><span class="price farm"><img alt="" src="' + art("cur-farm") + '"><b data-f="price">0</b></span></button>';
}
function ensureRows() {
  const want = Math.min(HEROES.length, C.heroesShown(S)) + 1;        // Хлыст + нанятые + следующий
  const list = $("mercList");
  while (rows.length < want) {
    const i = rows.length, d = document.createElement("div");
    d.className = "merc" + (i === 0 ? " whip" : "");
    d.innerHTML = rowHtml(i);
    const f = {}; d.querySelectorAll("[data-f]").forEach((n) => { f[n.dataset.f] = n; });
    list.appendChild(d);
    rows.push({ root: d, f, bar: d.querySelector(".ms"), buy: d.querySelector(".buy") });
  }
}
function prevMs(lv) {
  let p = 0;
  for (const t of [10, 25, 50, 75, 100, 125, 150]) if (lv >= t) p = t;
  if (lv >= 200) p = 200 + 25 * Math.floor((lv - 200) / 25);
  return p;
}
function drawRows() {
  ensureRows();
  let hired = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], lv = S.lv[i], b = C.buyInfo(S, i, buyMode);
    if (i && lv) hired++;
    r.f.lv.textContent = group(lv);
    r.f.dmg.textContent = i === 0 ? txt(C.clickLg(S)) : lv ? txt(S.d.hero[i]) + "/с" : "—";
    const nm = C.nextMs(lv), prev = prevMs(lv);
    r.bar.style.setProperty("--p", ((lv - prev) / (nm - prev) * 100).toFixed(0) + "%");
    r.f.cap.innerHTML = lv || i === 0 ? "до вехи " + group(nm) + ": <b>×" + C.msGain(lv) + "</b>" : "бьёт сам, даже когда тебя нет";
    r.f.q.textContent = lv === 0 && i ? "нанять" : buyMode === "ms" ? "до " + group(nm) : "×" + group(b.n);
    r.f.price.textContent = txt(b.cost);
    r.buy.classList.toggle("off", !b.can);
    r.buy.classList.toggle("hot", b.can && (lv + b.n >= nm || (i > 0 && lv === 0)));
    r.root.querySelector(".price").classList.toggle("short", !b.can);
  }
  $("footN").textContent = hired + " из " + HEROES.length;
  $("footDps").textContent = S.d.dps === NEG ? "0" : txt(C.dpsLg(S)) + "/с";
  drawRoster();
}
// Те, кого ещё не нанять: три ближайших строкой с ценой, остальные — сеткой портретов под замком.
function drawRoster() {
  const from = rows.length;                                          // сколько строк уже есть: Хлыст + наёмники
  if (String(from) === rosterKey) return;
  rosterKey = String(from);
  const rest = HEROES.slice(from - 1);
  if (!rest.length) { $("rosterBox").innerHTML = '<div class="note pad">Весь отряд в сборе.</div>'; return; }
  let h = "";
  for (const x of rest.slice(0, 3)) {
    h += '<div class="merc soon"><div class="por"><img alt="" src="' + heroArt(x.id) + '"><span class="tier">' + (ROMAN[x.k] || x.k) + '</span></div><div><div class="name">' + x.name +
      '</div><div class="meta">откроется, когда наймёшь предыдущего</div></div><div class="price farm short"><img alt="" src="' + art("lock") + '"><b>' + txt(heroCost0(x.k)) + "</b></div></div>";
  }
  const more = rest.slice(3);
  if (more.length) {
    h += '<div class="eyebrow pad">Ещё ждут: ' + more.length + "</div><div class=\"roster\">" +
      more.map((x) => '<div class="rt" title="' + x.name + " · " + txt(heroCost0(x.k)) + ' душ"><img alt="" loading="lazy" src="' + heroArt(x.id) + '"><span>' + (ROMAN[x.k] || x.k) + "</span></div>").join("") + "</div>";
  }
  $("rosterBox").innerHTML = h;
}

// ---------- предметы: выбор после босса, ячейки, ветки, коллекция ----------
function drawDraft() {
  const key = S.draft ? S.draft.join("|") + ":" + S.drafts : "";
  if (key === draftKey) return;
  draftKey = key;
  const box = $("draft");
  if (!S.draft) { box.hidden = true; box.textContent = ""; return; }
  box.innerHTML = "<h3>Выбери предмет</h3><div class=\"dcards\">" + S.draft.map((id, i) => {
    const x = ITEMS.find((q) => q.id === id), r = S.items[id] || 0, b = BRANCH[x.branch], ra = RARITY[x.rar];
    return '<button class="dcard rar-' + x.rar + '" data-id="' + id + '" style="--bc:' + (x.rar === "c" || x.rar === "r" ? b.color : ra.color) + ";animation-delay:" + i * 70 + 'ms"><img alt="" src="' + art(id) +
      '"><h4>' + x.name + '</h4><span class="br" style="background:' + b.color + '">' + b.name + "</span><p>" + x.text + '</p><span class="rk">' +
      (x.rar !== "c" ? ra.name.toLowerCase() + " · " : "") + (r ? "ранг " + RANK[r] + " → " + RANK[r + 1] : "новый") + "</span></button>";
  }).join("") + "</div>" + (S.drafts > 0 ? '<div class="more">ещё ждут выбора: ' + S.drafts + "</div>" : "");
  box.hidden = false;
}
const stars = (n) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, STARS.length - n);
function drawItems() {
  if (tab !== "items") return;
  const key = JSON.stringify(S.items) + S.d.slots + JSON.stringify(S.col) + JSON.stringify(S.feat) + collSel + (S.un.items ? 1 : 0) + JSON.stringify(S.statues);
  if (key === itemsKey) return;
  itemsKey = key;
  const own = Object.keys(S.items).filter((id) => S.items[id] > 0);
  let h = "";
  for (let i = 0; i < 12; i++) {
    if (i < own.length) { const x = ITEMS.find((q) => q.id === own[i]); h += '<div class="slot" style="--bc:' + BRANCH[x.branch].color + '" title="' + x.name + ": " + x.text + '"><img alt="" src="' + art(x.id) + '"><b>' + RANK[S.items[x.id]] + "</b></div>"; }
    else if (i < S.d.slots) h += '<div class="slot empty"></div>';
    else h += '<div class="slot locked" title="Ячейку открывает реликвия «Ячейка»"><img alt="" src="' + art("lock") + '"></div>';
  }
  $("slotGrid").innerHTML = h;
  $("branchList").innerHTML = '<p class="note">' + (S.un.items ? "Предмет даёт босс: один из трёх на выбор. Одинаковые растут в ранге до IV. Возрождение сбрасывает предметы, но не звёзды."
    : "Первый предмет даст босс на 10-й волне: один из трёх на выбор.") + "</p>" +
    ["w", "v", "s"].map((k) => {
      const b = BRANCH[k], n = S.d.br[k], t = branchTier(n), next = [3, 6, 9][t];
      return '<div class="branch" style="--bc:' + b.color + '"><img alt="" src="' + art(b.icon) + '"><div><b>' + b.name + "</b> · рангов: " + n +
        "<br><span>" + (t ? "сейчас: " + b.steps[t - 1] : "бонуса пока нет") + (next ? " · на " + next + ": " + b.steps[t] : "") + "</span></div></div>";
    }).join("") + statueNote();
  // коллекция: все предметы видны сразу; не добытые — тёмные, легендарные — под замком с условием, тайные — «?»
  $("collGrid").innerHTML = ITEMS.map((x) => {
    const n = S.col[x.id] || 0, st = C.starsOf(S, x.id), open = !x.feat || S.feat[x.feat], secret = x.rar === "x" && !open;
    return '<button class="ctile rar-' + x.rar + (n ? "" : " never") + (open ? "" : " shut") + (collSel === x.id ? " sel" : "") + '" data-id="' + x.id + '" style="--rc:' + RARITY[x.rar].color + '">' +
      (secret ? '<span class="q">?</span>' : '<img alt="" src="' + art(x.id) + '">') + (open ? "" : '<img class="lk" alt="" src="' + art("lock") + '">') +
      '<span class="st">' + (n ? stars(st) : "") + "</span></button>";
  }).join("");
  const x = ITEMS.find((q) => q.id === collSel) || null, det = $("collDet");
  if (!x) { det.innerHTML = '<p class="note">Нажми на предмет, чтобы узнать, что он даёт и как его добыть. Чем чаще берёшь предмет, тем больше у него звёзд: каждая звезда после первой — +10 % к его силе, навсегда.</p>'; return; }
  const n = S.col[x.id] || 0, st = C.starsOf(S, x.id), open = !x.feat || S.feat[x.feat], secret = x.rar === "x" && !open, nx = C.starNext(S, x.id);
  det.innerHTML = '<div class="dh"><b style="color:' + RARITY[x.rar].color + '">' + (secret ? "Тайный предмет" : x.name) + "</b><span>" + RARITY[x.rar].name + (secret ? "" : " · " + BRANCH[x.branch].name) + "</span></div>" +
    "<p>" + (secret ? "Что он даёт — узнаешь, когда откроешь." : x.text + " за ранг, до ранга " + RANK[x.max || ITEM_MAX] + ".") + "</p>" +
    '<p class="how">' + (open ? (x.feat ? "Открыт. Выпадает после боссов, реже обычных." : x.need && !S.un[x.need] ? "Начнёт выпадать, когда откроется нужная механика." : "Выпадает после боссов.")
      : (x.rar === "x" ? "Намёк: " : "Как открыть: ") + x.how + ".") + "</p>" +
    (n ? '<p class="stl">' + stars(st) + " · взят " + n + " " + plural(n, "раз", "раза", "раз") + (nx ? " · до следующей звезды: " + nx : " · максимум") + "</p>" : open ? '<p class="stl">ещё ни разу не взят</p>' : "");
}

function statueNote() {                                     // что дали золотые статуи в этом забеге
  const s = S.statues, out = [];
  if (s.dmg) out.push("урон +" + 2 * s.dmg + " %");
  if (s.souls) out.push("души +" + 2 * s.souls + " %");
  if (s.crit) out.push("шанс крита +" + s.crit + " %");
  if (s.timer) out.push("таймер босса +" + s.timer + " с");
  return out.length ? '<p class="note">Золотые статуи в этом забеге: ' + out.join(", ") + ". Возрождение их сбросит.</p>" : "";
}

// ---------- путь: что открыто и что впереди ----------
function condText(u) { return u.kind === "wave" ? "волна " + u.at : u.kind === "rb" ? "после " + u.at + "-го возрождения" : "с первых душ"; }
function drawRoad() {
  if (tab !== "road") return;
  const key = Object.keys(S.un).length + ":" + Object.keys(S.feat).length;
  if (key === roadKey) return;
  roadKey = key;
  const ord = (u) => (u.kind === "rb" ? 1000 + u.at : u.kind === "souls" ? 0 : u.at);
  const list = UNLOCKS.slice().sort((a, b) => ord(a) - ord(b));
  let next = false, h = '<p class="note pad">Всё, что есть в игре. Открытое отмечено, остальное ждёт.</p>';
  for (const u of list) {
    const done = !!S.un[u.key], cur = !done && !next; if (cur) next = true;
    h += '<div class="rd' + (done ? " done" : cur ? " cur" : "") + '"><i>' + (done ? "✓" : "") + "</i><div><b>" + u.title + "</b><span>" + condText(u) + "</span><p>" + u.say + "</p></div></div>";
  }
  for (const x of ROAD_EXTRA) h += '<div class="rd' + (x.soon ? " soon" : "") + '"><i></i><div><b>' + x.title + "</b><span>" + x.cond + "</span><p>" + x.text + "</p></div></div>";
  $("roadList").innerHTML = h;
}

// ---------- чат Twitch ----------
function buildChat() {
  if (chatBuilt) return;
  chatBuilt = true;
  const f = document.createElement("iframe");
  f.src = "https://www.twitch.tv/embed/" + TW.CHANNEL + "/chat?parent=" + encodeURIComponent(location.hostname) + "&darkpopout";
  f.title = "Чат Twitch";
  $("chatBox").appendChild(f);
}

// ---------- умения и бафы ----------
const BUFF_ICON = { flurry: "sk-flurry", rage: "sk-rage", greed: "sk-greed", mark: "sk-mark", ult: "sk-ult", harvest: "buff-harvest", storm: "buff-storm" };
function buildSkills() {
  const bar = $("skillbar");
  bar.innerHTML = SKILLS.map((s, i) => '<div class="sk"><div class="skill lock" data-id="' + s.id + '" title="' + s.name + ": " + s.text + '"><span class="key">' + (i + 1) +
    '</span><img alt="" src="' + art("sk-" + s.id) + '"><img class="lki" alt="" src="' + art("lock") + '"><span class="cd"></span><span class="t"></span><span class="dur"><i></i></span></div><div class="skill-cap">' + s.name + "</div></div>").join("") +
    '<div class="buffs" id="buffs"></div>';
  for (const s of SKILLS) {
    const n = bar.querySelector('[data-id="' + s.id + '"]');
    skillEls[s.id] = { root: n, cd: n.querySelector(".cd"), t: n.querySelector(".t"), dur: n.querySelector(".dur"), bar: n.querySelector(".dur i"), cap: n.parentNode.querySelector(".skill-cap") };
  }
}
const clock = (s) => (s >= 60 ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : Math.ceil(s) + " с");
function drawSkills() {
  for (const s of SKILLS) {
    const e = skillEls[s.id], open = C.skillOpen(S, s), on = S.act[s.id] > 0, cd = S.cd[s.id];
    e.root.classList.toggle("lock", !open);
    e.root.classList.toggle("on", open && on);
    e.root.classList.toggle("ready", open && !on && cd <= 0);
    e.cap.textContent = open ? s.name : s.need ? "возрождение" : "волна " + s.wave;
    e.dur.hidden = !on; e.cd.hidden = !open || on || cd <= 0;
    if (on) { e.bar.style.setProperty("--p", Math.min(100, S.act[s.id] / s.dur * 100).toFixed(0) + "%"); e.t.textContent = clock(S.act[s.id]); }
    else if (open && cd > 0) { e.cd.style.setProperty("--p", (cd / s.cd * 100).toFixed(1) + "%"); e.t.textContent = clock(cd); }
    else e.t.textContent = "";
  }
  const pills = [];
  for (const id in BUFFS) {
    const left = Math.max(S.act[id] || 0, S.buff[id] || 0);
    if (left > 0) pills.push('<span><img alt="" src="' + art(BUFF_ICON[id] || "wisp") + '"><b>' + BUFFS[id].name + "</b> " + clock(left) + "</span>");
  }
  $("buffs").innerHTML = pills.join("");
}

// ---------- реликвии и возрождение ----------
function buildRelics() {
  if (!relicsBuilt) {
    relicsBuilt = true;
    $("relicList").innerHTML = RELICS.map((r) => '<div class="relic"><img alt="" src="' + art(r.icon) + '"><h4>' + r.name + '<small data-l></small></h4><p>' + r.text +
      '</p><button data-id="' + r.id + '"><img alt="" src="' + art("cur-ash") + '"><span></span></button></div>').join("");
    for (const r of RELICS) {
      const b = $("relicList").querySelector('button[data-id="' + r.id + '"]');
      relicEls[r.id] = { b, cost: b.querySelector("span"), lv: b.parentNode.querySelector("[data-l]") };
    }
  }
  drawRelics();
}
function drawRelics() {
  if (tab !== "relics" || !relicsBuilt) return;
  const g = C.ashGain(S), open = !!S.un.relics;
  $("reBox").innerHTML = !S.un.rebirth
    ? '<div>Реликвии — навсегда</div><div class="big">с 50-й волны</div><div>Дойдёшь до 50-й волны — откроется <b>Возрождение</b>: забег начнётся заново, а ты получишь <b>пепел</b>. За пепел покупают реликвии, они не сгорают никогда.</div>'
    : "<div>Возрождение сейчас даст</div><div class=\"big\">" + (g === NEG ? "пока ничего" : "+" + txt(g) + " пепла") +
      "</div><div>Каждый пепел, полученный за всё время, — <b>+2 % урона</b>. Всего получено: <b>" + txt(S.ashAll) + "</b>. Тратить не жалко: бонус считается от всего заработанного." +
      (open ? "" : " Реликвии откроются после первого возрождения.") + "</div>";
  for (const r of RELICS) {
    const e = relicEls[r.id]; if (!e) continue;
    const lv = S.rel[r.id], max = r.cap && lv >= r.cap, c = C.relicCost(S, r);
    e.lv.textContent = "ур. " + lv + (r.cap ? " / " + r.cap : "");
    e.cost.textContent = max ? "максимум" : txt(c);
    e.b.classList.toggle("off", !open || max || S.ash === NEG || c > S.ash + 1e-9);
  }
  $("relicList").classList.toggle("shut", !open);
}

// ---------- полоса волны, «Дальше», цифры ----------
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);
function drawWave() {
  const boss = C.isBoss(S.z);
  $("waveNum").textContent = group(S.z);
  $("waveSub").textContent = boss ? "босс" : "трупер " + (S.kills + 1) + " / " + CFG.mobs;
  $("waveRec").textContent = group(S.best);
  document.querySelector(".wavebar").classList.toggle("boss", boss);
  const key = S.z + ":" + S.kills + ":" + S.mode;
  if (key !== pipsKey) {
    pipsKey = key;
    let h = "";
    for (let i = 0; i < CFG.mobs; i++) h += '<i class="' + (boss ? "on" : i < S.kills ? "on" : i === S.kills ? "now" : "") + '"></i>';
    $("pips").innerHTML = h + '<i class="boss"></i>';
  }
  const nb = boss ? S.z : Math.ceil((S.z + 1) / CFG.bossEvery) * CFG.bossEvery, bo = bossOf(nb);
  $("waveNext").innerHTML = boss ? "<b>" + bo.name + "</b>: успей за " + Math.ceil(Math.max(0, S.bossT)) + " с"
    : S.wall ? "Фармим волну. Босс <b>" + bo.name + "</b> ждёт на " + group(nb) + "-й"
    : S.mode === "farm" ? "Режим «Фарм»: стоим на этой волне" : "Босс <b>" + bo.name + "</b> — через " + (nb - S.z) + " " + plural(nb - S.z, "волну", "волны", "волн") + (S.un.items ? "" : ": за него дадут предмет");
  $("btnBoss").hidden = !(S.wall && !boss);
  $("btnBoss").classList.toggle("gold", C.canBeatBoss(S));
  $("modeSeg").hidden = boss;
  $("modeSeg").querySelectorAll("span").forEach((n) => n.classList.toggle("on", n.dataset.mode === S.mode));
}
function drawBank(dt) {
  if (shownLg === NEG || S.souls < shownLg || S.souls - shownLg > 3) shownLg = S.souls;
  else { shownLg += (S.souls - shownLg) * Math.min(1, dt * 12); if (S.souls - shownLg < 0.0004) shownLg = S.souls; }
  const f = fmt(shownLg);
  if (bankText.data !== f.n) bankText.data = f.n;
  if (f.s !== lastSfx) {
    const k = shownLg === NEG ? -1 : Math.floor(shownLg / 3 + 1e-12);
    bankSfx.hidden = !f.s; bankSfx.textContent = f.s; bankSfx.className = "sfx t" + tierOf(shownLg);
    if (lastSfx !== null && f.s && k > lastK) {                        // новый разряд — церемония
      bankSfx.classList.add("flip");
      const box = $("bankBox"); box.classList.remove("rays"); void box.offsetWidth; box.classList.add("rays");
      sfx.rank();
      if (k >= 2) FX.banner(rankWord(f.s), "новый разряд", "gold", 1500);
    }
    lastSfx = f.s; lastK = k;
  }
}
const RANKS = { тыс: "Тысяча!", млн: "Миллион!", млрд: "Миллиард!", трлн: "Триллион!", квдр: "Квадриллион!", квнт: "Квинтиллион!", скст: "Секстиллион!", сптл: "Септиллион!", октл: "Октиллион!", нонл: "Нониллион!", дцл: "Дециллион!" };
const rankWord = (s) => RANKS[s] || s.toUpperCase() + "!";

function drawSlow() {
  drawWave();
  const r = C.rateLg(S);
  $("bankRate").innerHTML = r === NEG ? "бей труперов — души твои" : "<b>+" + txt(r) + "</b> в секунду";
  $("stClick").textContent = txt(C.clickLg(S));
  $("stDpsBox").hidden = S.d.dps === NEG;
  if (S.d.dps !== NEG) $("stDps").textContent = txt(C.dpsLg(S)) + "/с";
  $("stCrit").textContent = Math.round(C.critChance(S) * 100) + " %";
  if (!!S.un.bulk !== bulkShown) { bulkShown = !!S.un.bulk; drawBuySeg(); }
  if (tab === "squad") drawRows();
  drawRelics(); drawItems(); drawRoad(); drawDraft();
  drawSkills();
  TW.draw();
  TOP.tick(tab === "top");
  $("chipAsh").hidden = S.ashAll === NEG;
  if (S.ashAll !== NEG) $("ashNum").textContent = txt(S.ash);
  const nx = C.nextUp(S);
  $("nextLine").textContent = nx ? nx.text : S.stats.clicks < 5 ? "Бей труперов и собирай души. Справа видно всё, что можно открыть" : "Всё идёт своим чередом: качай отряд и иди вперёд";
  const rb = $("btnRebirth"), g = C.ashGain(S);
  rb.hidden = false;
  rb.classList.toggle("weak", g === NEG || !S.un.rebirth);
  rb.querySelector(".lbl").textContent = !S.un.rebirth ? "Возрождение — с 50-й волны" : g === NEG ? "Возрождение: пока рано" : "Возрождение: +" + txt(g) + " пепла (держи)";
}

export function frame(dt) {
  drawBank(dt);
  stepHold(dt);
  slowT -= dt;
  if (slowT <= 0) { slowT = 0.15; drawSlow(); }
}

export function onEvent(e) {
  if (e.t === "buy") {
    const r = rows[e.i];
    if (r) {
      r.root.classList.remove("pulse"); void r.root.offsetWidth; r.root.classList.add("pulse");
      if (e.ms) { const st = document.createElement("span"); st.className = "stampx"; st.textContent = "×" + e.gain; r.root.appendChild(st); setTimeout(() => st.remove(), 1500); }
    }
    if (e.ms) sfx.ms(); else sfx.buy();
    slowT = 0;
  } else if (e.t === "unlock") { if (e.key === "bulk") drawBuySeg(); slowT = 0; }
  else if (e.t === "rebirth") { rows = []; $("mercList").textContent = ""; shownLg = NEG; lastSfx = null; lastK = -1; slowT = 0; itemsKey = rosterKey = ""; draftKey = "?"; }
  else if (e.t === "draft" || e.t === "item" || e.t === "feat" || e.t === "star") { slowT = 0; itemsKey = ""; }
}

// ---------- окна ----------
export function closeModal() { clearTimeout(wipeT); wipeT = 0; const m = $("modal"); m.onclick = null; $("veil").hidden = true; m.hidden = true; m.textContent = ""; }
function openModal(html, onClick) {                         // onClick — единственный обработчик кликов этого окна
  clearTimeout(wipeT); wipeT = 0;
  const m = $("modal"); m.innerHTML = html; m.onclick = onClick || null; m.hidden = false; m.scrollTop = 0; $("veil").hidden = false; return m;
}
export function toast(text) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}
export function showOffline(o) {
  const h = Math.floor(o.counted / 3600), m = Math.floor(o.counted % 3600 / 60);
  const m2 = openModal('<h2>Пока тебя не было</h2><p>Наёмники фармили ' + (h ? h + " ч " : "") + m + " мин на " + Math.round(o.eff * 100) + ' % скорости.</p>' +
    '<div class="bignum">+' + txt(o.gained) + ' душ</div><p>' + (o.waves > 0 ? "Пройдено волн: " + group(o.waves) + "." : "Волна та же: босс пока не по зубам.") + '</p>' +
    '<div class="acts"><button class="btn gold big" data-x>Забрать</button></div>');
  m2.querySelector("[data-x]").addEventListener("click", closeModal);
}
// ---------- микрообучение: три шага при первом запуске ----------
const INTRO = [
  ["cur-farm", "Бей труперов — собирай души", "Кликай по врагу или держи кнопку мыши. Души — главная валюта: на них нанимают отряд."],
  ["whip", "Собери отряд", "Справа — Хлыст и наёмники. Хлыст усиливает твой удар, наёмники бьют сами, даже когда игра закрыта."],
  ["cur-ash", "Упёрся в босса — возрождайся", "Возрождение начинает забег с первой волны и даёт пепел. Пепел навсегда усиливает урон, а ещё за него покупают реликвии."],
];
export function showIntro(i) {
  i = i || 0;
  const [icon, title, text] = INTRO[i], last = i === INTRO.length - 1;
  openModal('<div class="intro"><img alt="" src="' + art(icon) + '"><div class="dots">' + INTRO.map((_, k) => '<i class="' + (k === i ? "on" : "") + '"></i>').join("") +
    "</div><h2>" + title + "</h2><p>" + text + "</p></div>" +
    '<div class="acts split">' + (last ? "<span></span>" : '<button class="btn ghost sm" data-skip>Пропустить</button>') +
    '<button class="btn gold big" data-next>' + (last ? "Играть" : "Дальше") + "</button></div>",
  (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.skip !== undefined || last) closeModal(); else showIntro(i + 1);
  });
}

// ---------- настройки, сохранение, стирание ----------
// У окна всегда один обработчик кликов: его ставит openModal. Раньше обработчики копились с каждым открытием настроек.
const p2 = (n) => String(n).padStart(2, "0");
const when = (ms) => { const d = new Date(ms); return p2(d.getDate()) + "." + p2(d.getMonth() + 1) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()); };
const mins = (s) => (s >= 3600 ? Math.floor(s / 3600) + " ч " + Math.floor(s % 3600 / 60) + " мин" : Math.max(1, Math.floor(s / 60)) + " мин");
const WHY = { reset: "стёрта", import: "до загрузки", swap: "до возврата", auto: "копия", rescue: "найдена в браузере" };
const bakLine = (b) => when(b.at) + " · волна " + group(b.z) + " · " + mins(b.played) + (b.rb ? " · возрождений: " + b.rb : "");
let wipeT = 0;

function openSettings() {
  const sw = (k, label) => '<div class="row"><span>' + label + '</span><button class="sw' + (S.set[k] ? " on" : "") + '" data-k="' + k + '" aria-label="' + label + '"></button></div>';
  const baks = api.backups();
  openModal("<h2>Настройки</h2>" + sw("sound", "Звук игры") + sw("stream", "Стрим Twitch фоном линии, когда он идёт") + sw("calm", "Спокойный режим: без тряски и вспышек") +
    sw("sci", "Научная запись чисел") + sw("autoBoss", "Сам идти на босса, когда наёмники справятся") +
    '<div class="row"><span>Как играть: три шага</span><button class="btn ghost sm" data-intro>Показать</button></div>' +
    '<div class="row"><span>Настройки как в начале. Прогресс не трогает</span><button class="btn ghost sm" data-defaults>Сбросить настройки</button></div>' +
    '<div class="eyebrow sect">Сохранение</div>' +
    '<div class="row"><span>Сыграно</span><b>' + mins(S.stats.played) + " · ударов " + group(S.stats.clicks) + "</b></div>" +
    '<div class="row"><span>Игра хранится в этом браузере. Копию можно держать у себя</span><span class="rowbtns"><button class="btn ghost sm" data-copy>Скопировать</button><button class="btn ghost sm" data-load>Загрузить</button></span></div>' +
    (baks.length ? '<p class="note bakhead">Прежние игры. Любую можно вернуть:</p>' + baks.map((b) => '<div class="row bak"><span>' + bakLine(b) + " <i>" + (WHY[b.why] || "копия") +
      '</i></span><button class="btn ghost sm" data-restore="' + b.i + '">Вернуть</button></div>').join("") : "") +
    '<div class="acts split"><button class="btn danger sm" data-wipe>Стереть весь прогресс…</button><button class="btn" data-x>Готово</button></div>',
  (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (d.k) { S.set[d.k] = !S.set[d.k]; b.classList.toggle("on", S.set[d.k]); api.settings(); drawSound(); TW.sync(); }
    else if (d.x !== undefined) closeModal();
    else if (d.defaults !== undefined) { api.defaults(); drawSound(); openSettings(); toast("Настройки сброшены. Прогресс не тронут"); }
    else if (d.intro !== undefined) showIntro(0);
    else if (d.copy !== undefined) copySave();
    else if (d.load !== undefined) openLoad();
    else if (d.restore !== undefined) openRestore(Number(d.restore));
    else if (d.wipe !== undefined) openWipe();
  });
}
function copySave() {
  const text = api.exportSave();
  const manual = () => {
    openModal("<h2>Сохранение</h2><p>Скопируй этот текст и сохрани у себя. Потом его можно загрузить обратно.</p>" +
      '<textarea rows="6" readonly spellcheck="false"></textarea><div class="acts"><button class="btn" data-back>Назад</button></div>',
    (e) => { if (e.target.closest("[data-back]")) openSettings(); });
    const ta = $("modal").querySelector("textarea"); ta.value = text; ta.focus(); ta.select();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast("Сохранение скопировано. Вставь его в заметки или отправь себе"), manual);
  else manual();
}
function openLoad() {
  openModal("<h2>Загрузить сохранение</h2><p>Вставь текст, который дала кнопка «Скопировать». Нынешняя игра не пропадёт: она попадёт в список прежних игр.</p>" +
    '<textarea rows="6" spellcheck="false" placeholder="Текст сохранения"></textarea><p class="note err" hidden>Это не похоже на сохранение «Хлыстопада». Проверь, что текст скопирован целиком.</p>' +
    '<div class="acts"><button class="btn ghost" data-back>Назад</button><button class="btn gold" data-go>Загрузить</button></div>',
  (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.back !== undefined) openSettings();
    else if (b.dataset.go !== undefined) {
      const m = $("modal");
      if (api.importSave(m.querySelector("textarea").value.trim())) { closeModal(); toast("Сохранение загружено: волна " + group(S.best)); }
      else m.querySelector(".err").hidden = false;
    }
  });
}
function openRestore(i) {
  const b = api.backups().find((x) => x.i === i);
  if (!b) return;
  openModal("<h2>Вернуть эту игру?</h2><p>" + bakLine(b) + ".</p><p>Нынешняя игра (волна " + group(S.best) + ", " + mins(S.stats.played) +
    ") не пропадёт: она попадёт в список прежних игр, и её тоже можно будет вернуть.</p>" +
    '<div class="acts"><button class="btn ghost" data-back>Назад</button><button class="btn gold" data-go>Вернуть</button></div>',
  (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.back !== undefined) openSettings();
    else if (t.dataset.go !== undefined && api.restore(i)) { closeModal(); toast("Игра возвращена: волна " + group(S.best)); }
  });
}
export function showRescue(b) {                             // прежняя игра нашлась в файлах браузера — предлагаем вернуть
  openModal("<h2>Прежняя игра нашлась</h2><p>Стёртую игру удалось достать: " + bakLine(b) + ".</p><p>Вернуть её? Нынешняя игра попадёт в список прежних игр в настройках.</p>" +
    '<div class="acts"><button class="btn ghost" data-x>Остаться в новой</button><button class="btn gold big" data-go>Вернуть мою игру</button></div>',
  (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.x !== undefined) { closeModal(); toast("Она ждёт в настройках, в списке прежних игр"); }
    else if (t.dataset.go !== undefined && api.restore(b.i)) { closeModal(); toast("Игра возвращена: волна " + group(S.best)); }
  });
}
function openWipe() {                                       // стирание — только удержанием: случайный или двойной клик ничего не сотрёт
  openModal("<h2>Стереть весь прогресс?</h2><p>Пропадёт всё, что накоплено: волна " + group(S.best) + ", " + mins(S.stats.played) +
    " игры, наёмники, пепел, реликвии, предметы и их звёзды. Игра начнётся с первой волны.</p>" +
    "<p>Настройки это не трогает: для них есть отдельная кнопка «Сбросить настройки».</p>" +
    '<p class="note">Копия стёртой игры останется в настройках, в списке прежних игр.</p>' +
    '<div class="acts split"><button class="btn danger hold" data-wipe-go><span class="fill"></span><span class="lbl">Стереть: держи 3 секунды</span></button><button class="btn gold" data-x>Не стирать</button></div>',
  (e) => { if (e.target.closest("[data-x]")) openSettings(); });
  const b = $("modal").querySelector("[data-wipe-go]");
  const stop = () => { clearTimeout(wipeT); wipeT = 0; b.classList.remove("holding"); };
  b.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    b.classList.add("holding");
    clearTimeout(wipeT);
    wipeT = setTimeout(() => { wipeT = 0; api.reset(); closeModal(); toast("Игра стёрта. Копия лежит в настройках, в списке прежних игр"); }, 3000);
  });
  for (const n of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(n, stop);
  b.addEventListener("contextmenu", (e) => e.preventDefault());
}
export function applySettings() { setSound(S.set.sound); setSci(S.set.sci); FX.setCalm(S.set.calm); }
