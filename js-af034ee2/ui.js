// Интерфейс: полоса волны, счётчик душ, отряд, предметы и коллекция, реликвии, путь, чат, умения, бафы, окна.
// Правило экрана: всё, что можно открыть, видно с первой секунды — закрытое показано с условием.
import { CFG, HEROES, SKILLS, BUFFS, RELICS, UNLOCKS, ROAD_EXTRA, bossOf, ITEMS, ITEM_MAX, BRANCH, branchTier, RARITY, STARS, heroCost0, ACH_GROUPS, ACH_LADDERS, ACH_SINGLE, PATRONS, KEEP, TSKINS, TSKIN_RAR, TASKS, RPG_SKINS, RPG_RAR } from "./data.js";
import * as C from "./core.js";
import { NEG, fmt, txt, tierOf, group, setSci } from "./num.js";
import { sfx, setSound } from "./audio.js";
import { art, heroArt, applyArt, tskinArt, rpgSkinArt } from "./art.js";
import * as FX from "./fx.js";
import * as TW from "./stream.js";
import * as TOP from "./top.js";
import * as SWAP from "./swap.js";
import * as ACCT from "./acct.js";

const $ = (id) => document.getElementById(id);
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const RANK = ["", "I", "II", "III", "IV"];
const TABS = [["squad", "Отряд"], ["items", "Предметы"], ["relics", "Реликвии"], ["skins", "Скины"], ["road", "Путь"], ["top", "Топ"], ["chat", "Чат"]];
let S = null, api = null;
let buyMode = 1, tab = "squad", rows = [], shownLg = NEG, lastSfx = null, lastK = -1, bankText = null, bankSfx = null;
let slowT = 0, pipsKey = "", skillEls = {}, relicEls = {}, holdT = 0, holding = false, bulkShown = null;
let draftKey = "", itemsKey = "", rosterKey = "", roadKey = "", collSel = null, relicsBuilt = false, chatBuilt = false;
let badge = 0, achNew = [], achDrawAt = 0, achSfxAt = 0;    // ачивки: значок на вкладке, очередь уведомлений, когда рисовали и звучали
let achMsg = "", achUntil = 0, achCap = "Ачивка";          // уведомление в плашке «Дальше»: текст, до какого времени и подпись над ним
// Выбор предмета появляется прямо под курсором, а игрок в этот момент часто кликает без остановки. Поэтому карточки
// включаются не сразу: секунду после появления и ещё треть секунды после последнего клика они не нажимаются.
const DRAFT_LOCK = 1000, DRAFT_QUIET = 350;
let draftAt = 0, draftClickAt = 0, draftLocked = null;
const draftReady = () => { const t = performance.now(); return t - draftAt >= DRAFT_LOCK && t - draftClickAt >= DRAFT_QUIET; };

export function mount(state, hooks) {
  S = state; api = hooks;
  applyArt(document);
  const num = $("bankNum"); num.textContent = "";
  bankText = document.createTextNode("0"); bankSfx = document.createElement("span"); bankSfx.className = "sfx"; bankSfx.hidden = true;
  num.appendChild(bankText); num.appendChild(bankSfx);

  $("modeSeg").addEventListener("click", (e) => { const m = e.target.dataset.mode; if (m) { C.setMode(S, m); slowT = 0; } });
  $("btnBoss").addEventListener("click", () => { C.goBoss(S); slowT = 0; });
  $("buySeg").addEventListener("click", (e) => { const m = e.target.dataset.m; if (m && !e.target.classList.contains("lockd")) { buyMode = m === "ms" || m === "max" ? m : Number(m); drawBuySeg(); slowT = 0; } });
  // Покупка героев. Отряд стоит сеткой плиток, плитка и есть кнопка. Мышью — сразу по нажатию и свайпом: зажал левую
  // кнопку в сетке и ведёшь в любую сторону — покупается каждая плитка, на которую зашёл курсор (вернулся на ту же — ещё
  // раз). Плитки при этом не выглядят зажатыми: каждая коротко щёлкает, за курсором тянется тающий след. Плитки, на
  // которые не хватает душ, и закрытые свайп пропускает молча. Пальцем и с клавиатуры — обычное нажатие.
  {
    const list = $("mercList");
    const tap = (b) => { b.classList.remove("tapfx"); void b.offsetWidth; b.classList.add("tapfx"); };   // короткий щелчок плитки
    const buyTile = (b, loud) => {
      if (!b) return false;
      figTouch(Number(b.dataset.i));                         // плитка из рисунка засчитывается, даже если купить её нельзя
      if (b.classList.contains("hg-lock")) return false;
      hgShow = Number(b.dataset.i);
      if (b.classList.contains("hg-no") || !C.buy(S, Number(b.dataset.i), buyMode)) { if (loud) sfx.deny(); return false; }
      slowT = 0; tap(b);
      sfx.tap(tapN++); gridBuys += 1;                        // звук покупки — сразу и свой: каждая следующая плитка свайпа выше
      return true;
    };
    let sw = null, dotAt = null;      // sw: { last: плитка под курсором, used: мышь уже нажала плитку }
    const trail = (x, y) => {                                // след свайпа: искры тают за курсором; только над сеткой героев
      if (dotAt && Math.hypot(x - dotAt[0], y - dotAt[1]) < 5) return;
      dotAt = [x, y];
      const r = list.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const d = document.createElement("i");
      d.className = "swdot"; d.style.left = x + "px"; d.style.top = y + "px";
      document.body.appendChild(d);
      d.addEventListener("animationend", () => d.remove());
    };
    const end = () => { if (sw && sw.used) { swipeDone = true; setTimeout(() => { swipeDone = false; }, 0); } sw = null; dotAt = null; tapN = 0; };
    list.addEventListener("click", (e) => {
      if (swipeDone) { swipeDone = false; return; }          // мышью всё уже куплено: по нажатию или по пути свайпа
      buyTile(e.target.closest(".hg"), true);
    });
    list.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const b = e.target.closest(".hg");
      tapN = 0;
      sw = { last: b, used: !!b };
      if (b) buyTile(b, true);                               // покупка сразу, по нажатию
    });
    window.addEventListener("pointermove", (e) => {
      if (!sw) return;
      if (!(e.buttons & 1)) { end(); return; }              // кнопку мыши отпустили за окном
      trail(e.clientX, e.clientY);
      const el = document.elementFromPoint(e.clientX, e.clientY), b = el && el.closest ? el.closest("#mercList .hg") : null;
      if (b === sw.last) return;
      sw.used = true; sw.last = b;
      buyTile(b, false);
    });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    list.addEventListener("dragstart", (e) => e.preventDefault());
    // строка над сеткой рассказывает про героя под курсором (или про того, кого только что купили)
    list.addEventListener("pointerover", (e) => { const b = e.target.closest(".hg"); if (b) { hgShow = Number(b.dataset.i); drawInfo(); } });
    list.addEventListener("pointerleave", () => { if (!sw) { hgShow = -1; drawInfo(); } });
    if (window.ResizeObserver) new ResizeObserver(() => fitGrid()).observe(list);
    window.addEventListener("resize", fitGrid);
  }
  $("tabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) { tab = t.dataset.t; drawTabs(); slowT = 0; } });
  $("skillbar").addEventListener("click", (e) => { const s = e.target.closest(".skill"); if (s && !s.classList.contains("lock")) { if (!C.useSkill(S, s.dataset.id)) sfx.deny(); slowT = 0; } });
  $("relicList").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && !b.classList.contains("off")) { if (C.buyRelic(S, b.dataset.id)) { sfx.buy(); slowT = 0; } } });
  $("patronList").addEventListener("click", (e) => {        // покровитель: «+1» или «макс» — сколько хватит осколков
    const b = e.target.closest("button"); if (!b || b.classList.contains("off")) return;
    let n = 0;
    while (n < (b.dataset.max !== undefined ? 500 : 1) && C.buyPatron(S, b.dataset.id)) n += 1;
    if (!n) sfx.deny();
    slowT = 0; api.settings();
  });
  $("eclBox").addEventListener("click", (e) => { if (e.target.closest("[data-ecl]")) openEclipse(); });
  $("auBox").addEventListener("click", (e) => {             // автозапуск умений: купить час, выключатель продления
    if (e.target.closest("[data-au-buy]")) { if (C.auBuy(S)) sfx.buy(); else sfx.deny(); }
    else if (e.target.closest("[data-au-renew]")) { C.setAuRenew(S, !S.au.renew); sfx.buy(); api.settings(); }
    else return;
    auKey = ""; eclKey = ""; slowT = 0;
  });
  $("keepBox").addEventListener("click", keepClick); ACCT.bind($("keepBox"));
  $("liveChest").addEventListener("click", () => { tab = "skins"; drawTabs(); slowT = 0; });
  ACCT.onChange(() => { keepKey = ""; rpgAt = 0; syncRpg(true); });
  $("draft").addEventListener("pointerdown", () => { if (!draftReady()) draftClickAt = performance.now(); });   // клик по ещё не включённым карточкам отодвигает включение
  $("draft").addEventListener("click", (e) => {
    if (!draftReady()) return;                              // случайный клик на бегу ничего не берёт
    const c = e.target.closest(".dcard");
    if (c && C.pickItem(S, c.dataset.id)) { slowT = 0; draftKey = "?"; }
  });
  $("collGrid").addEventListener("click", (e) => { const t = e.target.closest(".ctile"); if (t) { collSel = t.dataset.id; itemsKey = ""; drawItems(); } });
  $("autoBox").addEventListener("click", (e) => {           // автовыбор: выключатель и любимые (нажатие на любимый открывает его в коллекции)
    const f = e.target.closest(".fav"), a = e.target.closest("[data-auto]");
    if (f) { collSel = f.dataset.id; itemsKey = ""; drawItems(); $("collDet").scrollIntoView({ block: "nearest" }); }
    else if (a && C.setAuto(S, !S.auto.on)) { sfx.buy(); itemsKey = ""; draftKey = "?"; slowT = 0; api.settings(); }
  });
  $("collDet").addEventListener("click", (e) => {           // «В любимые», «Выше», «Убрать» у выбранного предмета
    const b = e.target.closest("[data-fav]"); if (!b || !collSel) return;
    if (b.dataset.fav === "up") C.favUp(S, collSel); else C.favToggle(S, collSel);
    sfx.buy(); itemsKey = ""; drawItems(); api.settings();
  });
  $("btnSound").addEventListener("click", () => { S.set.sound = !S.set.sound; setSound(S.set.sound); drawSound(); });
  $("btnMenu").addEventListener("click", openSettings);
  $("veil").addEventListener("click", closeModal);
  bindHold($("btnRebirth"));
  TW.mount(S, { changed: () => { slowT = 0; api.settings(); }, channel: () => { if (tab === "chat") buildChat(); }, stage: (on) => FX.setDock(on) });
  TOP.mount(S, { toast });
  FX.onNotice((text) => toast(text, 7000));
  SWAP.mount(S, { openModal, closeModal, toast, changed: () => { slowT = 0; api.settings(); } });
  $("btnWho").addEventListener("click", whoClick); ACCT.onChange(drawWho); drawWho();
  drawSound(); drawBuySeg(); buildSkills(); drawTabs();
  syncRpg(true);
}
export function setState(state) {
  S = state; rows = []; $("mercList").textContent = ""; fig = null; hgFit = ""; hgShow = -1; shownLg = NEG; lastK = -1; slowT = 0;
  itemsKey = rosterKey = roadKey = keepKey = ""; draftKey = "?"; relicsBuilt = false; achNew = []; achUntil = 0; chestBadge = -1;
  TW.setState(S); TOP.setState(S); SWAP.setState(S); drawTabs();
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
function tabStrip() {                                        // на «Пути» — число ачивок, которых игрок ещё не видел
  if (tab === "road") S.achSeen = C.achCount(S);
  badge = Math.max(0, C.achCount(S) - (S.achSeen || 0));
  const cw = C.chestsWaiting(S);                             // на «Скинах» — сколько сундуков ждёт
  $("tabs").innerHTML = TABS.map(([t, l]) => '<span class="tab' + (t === tab ? " on" : "") + '" data-t="' + t + '">' + l +
    (t === "road" && badge ? '<span class="n">' + badge + "</span>" : t === "skins" && cw ? '<span class="n gold">' + cw + "</span>" : "") + "</span>").join("");
}
function drawTabs() {
  tabStrip();
  for (const [t] of TABS) $("pane" + t[0].toUpperCase() + t.slice(1)).hidden = tab !== t;
  if (tab === "relics") buildRelics();
  if (tab === "items") { itemsKey = ""; drawItems(); }
  if (tab === "road") { roadKey = ""; drawRoad(); }
  if (tab === "skins") { keepKey = ""; drawKeep(); syncRpg(false); }
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
let tapN = 0, gridBuys = 0;                                 // которая по счёту покупка в этом свайпе; сколько покупок с сетки ещё не отзвучало событием
let swipeDone = false;                                      // мышь только что купила (нажатием или свайпом): щелчок после этого не считается
let hgShow = -1, hgInfoKey = "", hgFit = "";                // про кого рассказывает строка над сеткой (-1 — подсказка); что в ней сейчас; под какой размер подобрана сетка
const TILES = HEROES.length + 1;                            // Хлыст и все наёмники
function rowHtml(i) {                                       // плитка героя: портрет, уровень, сколько уровней купит нажатие, полоска до вехи, цена
  const whip = i === 0, h = whip ? null : HEROES[i - 1];
  const sid = whip ? "lesh" : h.id;                          // скин из RPG ложится на портрет; у хлыста — скин Лэша
  return '<img class="hg-por" alt="" draggable="false" src="' + (whip && !C.hasRpgSkin(S, "lesh") ? art("whip") : porArt(sid)) + '">' +
    '<span class="hg-lv" data-f="lv"></span><span class="hg-q" data-f="q"></span><img class="hg-lk" alt="" src="' + art("lock") + '">' +
    '<span class="hg-foot"><i class="hg-ms"><u></u></i><span class="hg-price"><img alt="" src="' + art("cur-farm") + '"><b data-f="price"></b></span></span>';
}
function ensureRows() {                                     // плитки ставятся все сразу: сетка не перестраивается, когда нанят новый герой
  const list = $("mercList");
  while (rows.length < TILES) {
    const i = rows.length, d = document.createElement("div"), sid = i === 0 ? "lesh" : HEROES[i - 1].id;
    d.className = "hg" + (i === 0 ? " whip" : "") + porCls(sid);
    d.dataset.i = i;
    d.innerHTML = rowHtml(i);
    const f = {}; d.querySelectorAll("[data-f]").forEach((n) => { f[n.dataset.f] = n; });
    list.appendChild(d);
    rows.push({ root: d, f, bar: d.querySelector(".hg-ms u"), st: "" });
    if (rows.length === TILES) fitGrid();
  }
}
// Сетка без прокрутки: сколько столбцов взять, чтобы все плитки влезли в отведённое место и вышли покрупнее. На телефоне
// панель не имеет своей высоты — там столбцов столько, сколько помещается по ширине, а страница листается как обычно.
function fitGrid() {
  const list = $("mercList");
  if (!list || !rows.length || list.offsetParent === null) return;
  const cs = getComputedStyle(list), gap = parseFloat(cs.columnGap) || 6;
  const W = list.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), H = list.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const flow = matchMedia("(max-width: 720px)").matches || H < 160;
  let c = 0, r = 0, size = 0;
  if (flow) { c = Math.max(4, Math.min(9, Math.round(W / 76))); r = Math.ceil(TILES / c); size = (W - gap * (c - 1)) / c; }
  else for (let k = 4; k <= 16; k++) {
    const n = Math.ceil(TILES / k), w = (W - gap * (k - 1)) / k, h = (H - gap * (n - 1)) / n, v = Math.min(w, h * 1.04);   // плитка чуть выше ширины — тоже годится
    if (v > size + 0.01) { size = v; c = k; r = n; }
  }
  const key = [flow, c, r, Math.round(size)].join("|");
  if (key === hgFit) { drawFigLines(); return; }            // размер тот же, но плитки могли сдвинуться — линия рисунка идёт за ними
  hgFit = key;
  list.classList.toggle("hg-flow", flow);
  list.style.setProperty("--hg-c", c); list.style.setProperty("--hg-r", r); list.style.setProperty("--hg-s", Math.round(size) + "px");
  hgC = c; hgR = r;
  spawnFig();                                               // сетка другая — рисунок ставится заново
}
// ---------- рисунки на сетке отряда ----------
// Поверх сетки светится рисунок: несколько плиток отмечены кружками и соединены линией — икс, круг, зигзаг, сердце. Проведи
// по всем отмеченным плиткам (или нажми каждую) — рисунок собран: комбо растёт, души идут с прибавкой (js/core.js, figDone),
// и появляется следующий. Пока комбо больше нуля, идёт время: не собрал следующий — комбо обрывается, отметки гаснут.
// Клетки — [столбец, ряд] по ходу линии; два штриха — два массива.
const FIGS = [
  { name: "Линия", w: 4, h: 1, s: [[[0, 0], [1, 0], [2, 0], [3, 0]]] },
  { name: "Столб", w: 1, h: 4, s: [[[0, 0], [0, 1], [0, 2], [0, 3]]] },
  { name: "Диагональ", w: 4, h: 4, s: [[[0, 0], [1, 1], [2, 2], [3, 3]]] },
  { name: "Галочка", w: 4, h: 3, s: [[[0, 1], [1, 2], [2, 1], [3, 0]]] },
  { name: "Зигзаг", w: 5, h: 2, s: [[[0, 1], [1, 0], [2, 1], [3, 0], [4, 1]]] },
  { name: "Крыша", w: 5, h: 3, s: [[[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]]] },
  { name: "Угол", w: 3, h: 3, s: [[[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]] },
  { name: "Икс", w: 3, h: 3, s: [[[0, 0], [1, 1], [2, 2]], [[2, 0], [1, 1], [0, 2]]] },
  { name: "Плюс", w: 3, h: 3, s: [[[1, 0], [1, 1], [1, 2]], [[0, 1], [1, 1], [2, 1]]] },
  { name: "Ромб", w: 3, h: 3, s: [[[1, 0], [2, 1], [1, 2], [0, 1], [1, 0]]] },
  { name: "Квадрат", w: 3, h: 3, s: [[[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0]]] },
  { name: "Круг", w: 4, h: 4, s: [[[1, 0], [2, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 2], [0, 1], [1, 0]]] },
  { name: "Треугольник", w: 5, h: 3, s: [[[0, 2], [1, 1], [2, 0], [3, 1], [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]]] },
  { name: "Молния", w: 4, h: 5, s: [[[3, 0], [2, 1], [1, 2], [2, 2], [3, 2], [2, 3], [1, 4]]] },
  { name: "Волна", w: 7, h: 3, s: [[[0, 1], [1, 0], [2, 1], [3, 2], [4, 1], [5, 0], [6, 1]]] },
  { name: "Большой ромб", w: 5, h: 5, s: [[[2, 0], [3, 1], [4, 2], [3, 3], [2, 4], [1, 3], [0, 2], [1, 1], [2, 0]]] },
  { name: "Стрела", w: 5, h: 5, s: [[[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]], [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]]] },
  { name: "Большой икс", w: 5, h: 5, s: [[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]], [[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]]] },
  { name: "Двойной икс", w: 7, h: 3, s: [[[0, 0], [1, 1], [2, 2]], [[2, 0], [1, 1], [0, 2]], [[4, 0], [5, 1], [6, 2]], [[6, 0], [5, 1], [4, 2]]] },
  { name: "Сердце", w: 5, h: 5, s: [[[2, 1], [1, 0], [0, 1], [0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [4, 1], [3, 0], [2, 1]]] },
  { name: "Огромный икс", w: 6, h: 6, s: [[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], [[5, 0], [4, 1], [3, 2], [2, 3], [1, 4], [0, 5]]] },
  { name: "Корона", w: 5, h: 3, s: [[[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [4, 1], [4, 0], [3, 1], [2, 0], [1, 1], [0, 0]]] },
  { name: "Решётка", w: 4, h: 4, s: [[[1, 0], [1, 1], [1, 2], [1, 3]], [[2, 0], [2, 1], [2, 2], [2, 3]], [[0, 1], [1, 1], [2, 1], [3, 1]], [[0, 2], [1, 2], [2, 2], [3, 2]]] },
  { name: "Большой круг", w: 5, h: 5, s: [[[1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [4, 3], [3, 4], [2, 4], [1, 4], [0, 3], [0, 2], [0, 1], [1, 0]]] },
  { name: "Мишень", w: 5, h: 5, s: [[[1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [4, 3], [3, 4], [2, 4], [1, 4], [0, 3], [0, 2], [0, 1], [1, 0]], [[2, 2]]] },
  { name: "Змейка", w: 4, h: 5, s: [[[3, 0], [2, 0], [1, 0], [0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [3, 3], [3, 4], [2, 4], [1, 4], [0, 4]]] },
  { name: "Песочные часы", w: 5, h: 5, s: [[[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [3, 1], [2, 2], [1, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [3, 3], [2, 2], [1, 1], [0, 0]]] },
  { name: "Рамка", w: 5, h: 5, s: [[[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 3], [0, 2], [0, 1], [0, 0]]] },
  { name: "Спираль", w: 5, h: 5, s: [[[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 3], [0, 2], [1, 2], [2, 2]]] },
  { name: "Звезда", w: 5, h: 5, s: [[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]], [[4, 0], [3, 1], [2, 2], [1, 3], [0, 4]], [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]], [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]]] },
];
// Сложность рисунка — по числу плиток: простой (до 5) прибавляет к комбо 1, дальше 2, 3 и 4. Сложные выходят не сразу:
// пока комбо меньше 3 — только простые, с 3 — до второй ступени, с 10 — до третьей, с 25 — любые; чем сложнее из
// разрешённых, тем чаще он выпадает.
for (const f of FIGS) { f.n = new Set(f.s.flat().map((c) => c[0] + ":" + c[1])).size; f.t = f.n <= 5 ? 1 : f.n <= 9 ? 2 : f.n <= 13 ? 3 : 4; }
const figTier = (k) => (k < 3 ? 1 : k < 10 ? 2 : k < 25 ? 3 : 4);
const figLvl = (k) => (k >= 75 ? 4 : k >= 40 ? 3 : k >= 15 ? 2 : k >= 5 ? 1 : 0);   // уровень вида и звука — по комбо
let hurryAt = 0;                                            // на какой секунде уже тикнуло: время на рисунок кончается
let fig = null, hgC = 0, hgR = 0, figOn = true, figChipKey = "?";   // рисунок сейчас: { name, cells — номера плиток, segs — штрихи линии, hit — уже отмеченные }
function clearFig() {
  if (fig) for (const i of fig.cells) { const r = rows[i]; if (!r) continue; r.root.classList.remove("hg-m", "hg-hit"); const d = r.root.querySelector(".hg-dot"); if (d) d.remove(); }
  fig = null;
}
function spawnFig() {                                       // новый рисунок там, где он целиком ложится на плитки
  const was = fig ? fig.name : "";
  clearFig();
  if (figOn && rows.length === TILES && hgC) {
    const R = Math.max(hgR, Math.ceil(TILES / hgC)), top = figTier(S.fig.k);
    const fits = FIGS.filter((f) => f.w <= hgC && f.h <= R && f.t <= top && f.name !== was), bag = [];
    for (const f of fits) for (let q = 0; q < (f.t === top ? 4 : f.t === top - 1 ? 2 : 1); q++) bag.push(f);   // сложные из разрешённых — чаще
    for (let t = 0; t < 120 && bag.length; t++) {
      const f = bag[Math.floor(Math.random() * bag.length)];
      const ox = Math.floor(Math.random() * (hgC - f.w + 1)), oy = Math.floor(Math.random() * (R - f.h + 1));
      const segs = f.s.map((st) => st.map(([x, y]) => (oy + y) * hgC + ox + x));
      if (segs.some((st) => st.some((i) => i >= TILES))) continue;
      fig = { name: f.name, plus: f.t, segs, cells: [...new Set(segs.flat())], hit: new Set() };
      for (const i of fig.cells) { const d = document.createElement("i"); d.className = "hg-dot"; rows[i].root.appendChild(d); rows[i].root.classList.add("hg-m"); }
      break;
    }
  }
  drawFigLines(); drawFigChip();
}
function drawFigLines() {                                   // линия рисунка — поверх сетки, между центрами плиток
  const list = $("mercList");
  let svg = list.querySelector(".hg-fig");
  list.classList.toggle("hg-has", !!fig);                    // рисунок есть — остальные плитки чуть приглушены
  if (!fig) { if (svg) svg.remove(); return; }
  if (!svg) { svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "hg-fig"); list.appendChild(svg); }
  const lr = list.getBoundingClientRect();
  const pt = (i) => { const r = rows[i].root.getBoundingClientRect(); return (r.left + r.width / 2 - lr.left + list.scrollLeft).toFixed(1) + "," + (r.top + r.height * 0.42 - lr.top + list.scrollTop).toFixed(1); };
  svg.setAttribute("width", Math.round(lr.width)); svg.setAttribute("height", Math.round(Math.max(lr.height, list.scrollHeight)));
  // три слоя: тёмная подложка (линию видно и на светлом портрете), широкое свечение и сама бегущая линия
  const lines = fig.segs.map((st) => st.map(pt).join(" "));
  svg.innerHTML = ["hg-lo", "hg-lg", "hg-ll"].map((c) => lines.map((q) => (q.indexOf(" ") < 0 ? "" : '<polyline class="' + c + '" points="' + q + '"/>')).join("")).join("");
}
function figTouch(i) {                                      // по плитке провели или нажали: если она из рисунка — отметить
  if (!fig || fig.hit.has(i) || fig.cells.indexOf(i) < 0) return;
  fig.hit.add(i);
  rows[i].root.classList.add("hg-hit");
  sfx.mark(fig.hit.size - 1, fig.cells.length, figLvl(S.fig.k));
  const dot = rows[i].root.querySelector(".hg-dot");
  if (dot) { dot.classList.remove("hg-tick"); void dot.offsetWidth; dot.classList.add("hg-tick"); }
  if (fig.hit.size === fig.cells.length) {
    const done = fig;
    C.figDone(S, done.cells.length, done.name, done.plus);
    figBoom(done);
    spawnFig();
    if (fig) C.figNext(S, fig.cells.length);                 // время на следующий — по его размеру
    figChipKey = "?"; drawFigChip(); slowT = 0;
  }
  else drawFigChip();
}
// Рисунок собран: плитки вспыхивают, из них летят искры, поверх вылетает надпись с названием и множителем — чем выше
// комбо, тем крупнее и горячее. Сетка коротко вздрагивает. Всё живёт внутри сетки героев и само убирается.
function figBoom(done) {
  const list = $("mercList"), k = S.fig.k, lr = list.getBoundingClientRect();
  const lvl = figLvl(k);
  sfx.boom(lvl, done.plus);
  const step = [10, 25, 50, 75, CFG.figCap].map((m) => k >= m && k - done.plus < m).lastIndexOf(true);   // перешли рубеж комбо — фанфары
  if (step >= 0) setTimeout(() => sfx.fanfare(step), 240);
  let cx = 0, cy = 0;
  const pts = done.cells.map((i) => { const r = rows[i].root.getBoundingClientRect(), q = [r.left + r.width / 2 - lr.left + list.scrollLeft, r.top + r.height / 2 - lr.top + list.scrollTop]; cx += q[0]; cy += q[1]; return q; });
  cx /= pts.length; cy /= pts.length;
  for (const i of done.cells) { const t = rows[i].root; t.classList.remove("hg-win"); void t.offsetWidth; t.classList.add("hg-win"); }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const add = (cls, x, y, html) => { const n = document.createElement("div"); n.className = cls; n.style.left = x.toFixed(1) + "px"; n.style.top = y.toFixed(1) + "px"; if (html) n.innerHTML = html; list.appendChild(n); return n; };
  const per = Math.max(2, Math.min(5, Math.floor((26 + lvl * 8) / pts.length)));
  for (const q of pts) for (let j = 0; j < per; j++) {
    const a = Math.random() * 6.283, d = 34 + Math.random() * (60 + lvl * 22), n = add("hg-sp l" + lvl, q[0], q[1]);
    n.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "px"); n.style.setProperty("--dy", (Math.sin(a) * d).toFixed(1) + "px");
    n.style.animationDelay = (Math.random() * 60).toFixed(0) + "ms";
    setTimeout(() => n.remove(), 800);
  }
  const ring = add("hg-ring l" + lvl, cx, cy); setTimeout(() => ring.remove(), 700);
  const W = list.clientWidth, H = Math.max(list.clientHeight, 120);
  const pop = add("hg-pop l" + lvl, Math.max(110, Math.min(W - 110, cx)), Math.max(46, Math.min(H - 56, cy)),
    "<b>" + done.name + "!</b><span>комбо " + group(k) + (done.plus > 1 ? " <i>+" + done.plus + "</i>" : "") + " · души ×" + mulT(C.figMul(S)) + "</span>");
  const half = Math.max(pop.firstChild.offsetWidth, pop.lastChild.offsetWidth) / 2 + 14;   // длинное название не должно уезжать за край сетки
  pop.style.left = Math.max(half, Math.min(W - half, cx)).toFixed(1) + "px";
  setTimeout(() => pop.remove(), 1500);
  list.classList.remove("hg-boom"); void list.offsetWidth; list.classList.add("hg-boom");
}
const mulT = (m) => String(Math.round(m * 10) / 10).replace(".", ",");
function drawFigChip() {                                    // справа в строке над сеткой: какой рисунок, сколько отмечено, комбо и прибавка к душам
  const el = $("hgFigc"), k = S.fig.k;
  const sec = k > 0 && S.fig.left <= 3 ? Math.max(1, Math.ceil(S.fig.left)) : 0;   // последние три секунды: тикает и мигает
  if (sec && sec !== hurryAt) sfx.hurry(sec === 1);
  hurryAt = sec;
  const key = fig ? fig.name + "|" + k + "|" + fig.hit.size + "|" + (sec ? 1 : 0) : "";
  if (key === figChipKey) return;
  figChipKey = key;
  el.hidden = !fig;
  if (!fig) return;
  el.className = "hg-figc" + (k ? " on" : "") + (sec ? " hurry" : "");
  const full = C.figTime(fig.cells.length);
  el.title = "Рисунок на сетке: проведи мышью по всем отмеченным героям или нажми каждого. Собранный рисунок прибавляет к комбо (простой — 1, сложные — до 4), а комбо умножает души: комбо 5 — души ×6, " +
    "и так до ×" + mulT(1 + CFG.figStep * CFG.figCap) + ". Чем выше комбо, тем сложнее рисунки. Не успел собрать следующий — комбо обрывается";
  el.innerHTML = "<span>«" + fig.name + "» <b>" + fig.hit.size + "/" + fig.cells.length + "</b>" + (fig.plus > 1 ? " <i>+" + fig.plus + "</i>" : "") + "</span>" +
    (k ? "<span>комбо <b>" + group(k) + "</b></span><span>души <b>×" + mulT(C.figMul(S)) + '</b></span><i class="hg-figt" style="animation-duration:' + full.toFixed(1) + "s;animation-delay:-" + Math.max(0, full - S.fig.left).toFixed(2) + 's"></i>'
      : '<span class="tip">собери — пойдёт комбо</span>');
}
export function figInfo() { return fig ? { name: fig.name, plus: fig.plus, cells: fig.cells.slice(), hit: [...fig.hit] } : null; }   // для проверки
export const figList = () => FIGS.map((f) => ({ name: f.name, w: f.w, h: f.h, n: f.n, t: f.t }));
export function figSet(on) { figOn = !!on; spawnFig(); }    // для проверки: убрать рисунки или вернуть
function prevMs(lv) {
  let p = 0;
  for (const t of [10, 25, 50, 75, 100, 125, 150]) if (lv >= t) p = t;
  if (lv >= 200) p = 200 + 25 * Math.floor((lv - 200) / 25);
  return p;
}
function drawRows() {
  ensureRows();
  const shown = C.heroesShown(S);                            // до какого героя можно покупать: нанятые и следующий
  let hired = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], lv = S.lv[i], lock = i > shown, b = lock ? null : C.buyInfo(S, i, buyMode);
    if (i && lv) hired++;
    const nm = C.nextMs(lv), hire = !lock && i > 0 && lv === 0;
    const lvT = lv ? group(lv) : "", qT = lock ? "" : hire ? "нанять" : buyMode === "ms" ? "до " + group(nm) : "×" + group(b.n);
    const priceT = lock ? (i <= shown + 3 ? txt(heroCost0(i)) : "") : txt(b.cost);
    const st = lock ? "hg-lock" + (priceT ? "" : " hg-far") : (b.can ? "hg-can" : "hg-no") + (hire ? " hg-hire" : "") + (b.can && (lv + b.n >= nm || hire) ? " hg-hot" : "");
    if (r.f.lv.textContent !== lvT) r.f.lv.textContent = lvT;
    if (r.f.q.textContent !== qT) r.f.q.textContent = qT;
    if (r.f.price.textContent !== priceT) r.f.price.textContent = priceT;
    r.bar.style.setProperty("--p", lock || !lv ? "0%" : ((lv - prevMs(lv)) / (nm - prevMs(lv)) * 100).toFixed(0) + "%");
    if (r.st !== st) { for (const k of ["hg-lock", "hg-far", "hg-can", "hg-no", "hg-hire", "hg-hot"]) r.root.classList.toggle(k, (" " + st + " ").indexOf(" " + k + " ") >= 0); r.st = st; }
  }
  $("footN").textContent = hired + " из " + HEROES.length;
  $("footDps").textContent = S.d.dps === NEG ? "0" : txt(C.dpsLg(S)) + "/с";
  drawInfo();
}
// Строка над сеткой: про героя под курсором или про того, кого только что купили; никого — подсказка про свайп.
function drawInfo() {
  const i = hgShow, shown = C.heroesShown(S);
  let h;
  if (i < 0 || i >= TILES) h = '<span class="tip">' + (matchMedia("(hover: none)").matches ? "Нажми на героя — купишь уровень" : "Зажми мышь и веди по героям — купится каждый по пути") + "</span>";
  else {
    const whip = i === 0, name = whip ? "Хлыст Лэша" : HEROES[i - 1].name, lv = S.lv[i], nm = C.nextMs(lv);
    const skin = C.hasRpgSkin(S, whip ? "lesh" : HEROES[i - 1].id) ? '<span>скин из RPG: урон <b>×' + String(C.rpgSkinMul(whip ? "lesh" : HEROES[i - 1].id)).replace(".", ",") + "</b></span>" : "";
    if (i > shown) h = "<b>" + name + "</b><span>откроется, когда наймёшь предыдущего</span><span>цена <b>" + txt(heroCost0(i)) + "</b></span>";
    else if (!whip && lv === 0) h = "<b>" + name + "</b><span>нанять за <b>" + txt(C.buyInfo(S, i, 1).cost) + "</b></span><span>бьёт сам, даже когда тебя нет</span>" + skin;
    else h = "<b>" + name + "</b><span>ур. <b>" + group(lv) + "</b></span><span>" + (whip ? "удар <b>" + txt(C.clickLg(S)) : "урон <b>" + txt(S.d.hero[i]) + "/с") + "</b></span><span>до вехи " + group(nm) + ": <b>×" + C.msGain(lv) + "</b></span>" + skin;
  }
  drawFigChip();
  if (h === hgInfoKey) return;
  hgInfoKey = h;
  $("hgInfo").innerHTML = h;
}

// ---------- предметы: выбор после босса, ячейки, ветки, коллекция ----------
function drawDraft() {
  const key = S.draft ? S.draft.join("|") + ":" + S.drafts : "";
  if (key === draftKey) return;
  draftKey = key;
  const box = $("draft");
  if (!S.draft) { box.hidden = true; box.textContent = ""; return; }
  draftAt = performance.now(); draftClickAt = 0; draftLocked = null;   // новые карточки — новая пауза
  box.innerHTML = "<h3>Выбери предмет</h3><p class=\"dhint\" id=\"draftHint\"></p><div class=\"dcards\">" + S.draft.map((id, i) => {
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
  const key = JSON.stringify(S.items) + S.d.slots + JSON.stringify(S.col) + JSON.stringify(S.feat) + collSel + (S.un.items ? 1 : 0) + JSON.stringify(S.statues) + JSON.stringify(S.auto) + (C.autoOpen(S) ? 1 : 0);
  if (key === itemsKey) return;
  itemsKey = key;
  // автовыбор: до первого возрождения — под замком с условием; дальше выключатель и любимые по порядку
  const fav = S.auto.fav, autoOn = C.autoOpen(S);
  $("autoBox").innerHTML = !autoOn
    ? '<div class="autolock"><img alt="" src="' + art("lock") + '"><span>Откроется после первого возрождения: предметы после босса будут браться сами, без выбора.</span></div>'
    : '<button type="button" class="autosw" data-auto="1" aria-pressed="' + (S.auto.on ? "true" : "false") + '"><span class="sw' + (S.auto.on ? " on" : "") + '"></span><span><b>Брать предмет после босса самому</b>' +
      "<small>Сначала любимые по номерам, потом те, что уже в ячейках, потом самый редкий.</small></span></button>" +
      (fav.length ? '<div class="favs">' + fav.map((id, i) => { const q = ITEMS.find((y) => y.id === id); return '<button type="button" class="fav" data-id="' + id + '" title="' + q.name + '"><i>' + (i + 1) + '</i><img alt="" src="' + art(id) + '"></button>'; }).join("") + "</div>"
        : '<p class="note">Любимых пока нет. Нажми на предмет в коллекции ниже и выбери «В любимые».</p>');
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
    const n = S.col[x.id] || 0, st = C.starsOf(S, x.id), open = !x.feat || S.feat[x.feat], secret = x.rar === "x" && !open, fp = C.favPos(S, x.id);
    return '<button class="ctile rar-' + x.rar + (n ? "" : " never") + (open ? "" : " shut") + (collSel === x.id ? " sel" : "") + '" data-id="' + x.id + '" style="--rc:' + RARITY[x.rar].color + '">' +
      (secret ? '<span class="q">?</span>' : '<img alt="" src="' + art(x.id) + '">') + (open ? "" : '<img class="lk" alt="" src="' + art("lock") + '">') +
      (fp >= 0 ? '<span class="fv">' + (fp + 1) + "</span>" : "") +
      '<span class="st">' + (n ? stars(st) : "") + "</span></button>";
  }).join("");
  const x = ITEMS.find((q) => q.id === collSel) || null, det = $("collDet");
  if (!x) { det.innerHTML = '<p class="note">Нажми на предмет, чтобы узнать, что он даёт и как его добыть. Чем чаще берёшь предмет, тем больше у него звёзд: каждая звезда после первой — +10 % к его силе, навсегда.</p>'; return; }
  const n = S.col[x.id] || 0, st = C.starsOf(S, x.id), open = !x.feat || S.feat[x.feat], secret = x.rar === "x" && !open, nx = C.starNext(S, x.id);
  det.innerHTML = '<div class="dh"><b style="color:' + RARITY[x.rar].color + '">' + (secret ? "Тайный предмет" : x.name) + "</b><span>" + RARITY[x.rar].name + (secret ? "" : " · " + BRANCH[x.branch].name) + "</span></div>" +
    "<p>" + (secret ? "Что он даёт — узнаешь, когда откроешь." : x.text + " за ранг, до ранга " + RANK[x.max || ITEM_MAX] + ".") + "</p>" +
    '<p class="how">' + (open ? (x.feat ? "Открыт. Выпадает после боссов, реже обычных." : x.need && !S.un[x.need] ? "Начнёт выпадать, когда откроется нужная механика." : "Выпадает после боссов.")
      : (x.rar === "x" ? "Намёк: " : "Как открыть: ") + x.how + ".") + "</p>" +
    (n ? '<p class="stl">' + stars(st) + " · взят " + n + " " + plural(n, "раз", "раза", "раз") + (nx ? " · до следующей звезды: " + nx : " · максимум") + "</p>" : open ? '<p class="stl">ещё ни разу не взят</p>' : "") +
    favActs(x, open);
}
function favActs(x, open) {                                  // кнопки автовыбора у выбранного предмета: закрытый любимым не сделать
  const fp = C.favPos(S, x.id);
  if (!C.autoOpen(S) || (!open && fp < 0)) return "";
  return '<div class="favacts">' + (fp >= 0
    ? "<span>Любимый № " + (fp + 1) + ": автовыбор берёт его " + (fp ? "после номеров выше" : "первым") + "</span>" +
      (fp > 0 ? '<button type="button" class="btn ghost sm" data-fav="up">Выше</button>' : "") + '<button type="button" class="btn ghost sm" data-fav="del">Убрать</button>'
    : '<span>Автовыбор берёт любимые первыми</span><button type="button" class="btn ghost sm" data-fav="add">В любимые</button>') + "</div>";
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
// Ачивки: сводка, потом группы. В группе — лестницы (кружки — пороги, под ними ближайшая цель и сколько до неё) и одиночные.
const medal = (done, all) => art(done >= all ? "medal-gold" : done * 3 >= all ? "medal-silver" : "medal-bronze");
function achHtml() {
  const n = C.achCount(S), h = [];
  h.push('<div class="achsum"><div class="achhead"><b>Ачивки</b><span><b>' + n + "</b> из " + C.ACH_TOTAL + "</span><em>+" + n + ' % урона</em></div><div class="achbar"><i style="width:' +
    (n / C.ACH_TOTAL * 100).toFixed(1) + '%"></i></div><p>Каждая ачивка навсегда прибавляет 1 % урона. Возрождение их не сбрасывает.</p></div>');
  for (const [g, title] of ACH_GROUPS) {
    const rows = [];
    let got = 0, all = 0;
    for (const l of ACH_LADDERS) {
      if (l.g !== g) continue;
      const v = C.achValue(S, l.id), m = l.at.length;
      let d = 0;
      while (d < m && S.ach[l.id + ":" + d]) d += 1;
      got += d; all += m;
      let pips = "";
      for (let i = 0; i < m; i++) pips += '<i class="' + (i < d ? "on" : i === d ? "now" : "") + '"></i>';
      let body = '<div class="an">Все цели взяты</div>';
      if (d < m) {
        const lo = d ? l.at[d - 1] : 0, p = Math.max(0, Math.min(1, (v - lo) / (l.at[d] - lo)));
        body = '<div class="an">' + C.achGoal(l, d) + "<em>сейчас " + C.achNow(l, v) + '</em></div><div class="achbar sm"><i style="width:' + (p * 100).toFixed(0) + '%"></i></div>';
      }
      rows.push('<div class="ach' + (d >= m ? " done" : d ? "" : " zero") + '"><img class="am" alt="" src="' + medal(d, m) + '"><div class="ab"><div class="at"><b>' + l.name +
        "</b><span>" + d + " / " + m + '</span></div><div class="apips">' + pips + "</div>" + body + "</div></div>");
    }
    for (const a of ACH_SINGLE) {
      if (a.g !== g) continue;
      const done = !!S.ach[a.id];
      all += 1; if (done) got += 1;
      rows.push('<div class="ach one' + (done ? " done" : " zero") + '"><img class="am" alt="" src="' + art(done ? "medal-gold" : "medal-bronze") + '"><div class="ab"><div class="at"><b>' + a.name +
        "</b><span>" + (done ? "есть" : "") + '</span></div><div class="an">' + a.text + "</div></div></div>");
    }
    h.push('<h4 class="achg">' + title + "<span>" + got + " / " + all + "</span></h4>" + rows.join(""));
  }
  return h.join("");
}
function achKey() {                                          // меняется, когда меняется что-то из показанного
  let k = C.achCount(S) + "";
  for (const l of ACH_LADDERS) k += "|" + C.achNow(l, C.achValue(S, l.id));
  return k;
}
// Уведомления об ачивках идут в плашку «Дальше» под линией: в начале игры ачивки сыплются часто, а всплывающая
// подсказка внизу страницы закрывала бы умения. Сколько бы ачивок ни пришло разом — одна строка.
function flushAch() {
  if (!achNew.length) return;
  if (achCap !== "Ачивка" && performance.now() < achUntil) return;   // под линией сейчас сундук или задание дня: ачивки подождут своей очереди
  const n = achNew.length, last = achNew[n - 1], now = performance.now();
  achMsg = n === 1 ? "«" + last.name + "»: " + last.text.charAt(0).toLowerCase() + last.text.slice(1) + ". +1 % урона"
    : "Новых ачивок: " + n + ", +" + n + " % урона. Последняя — «" + last.name + "»";
  achUntil = now + 3800; achCap = "Ачивка";
  if (now - achSfxAt > 8000) { achSfxAt = now; sfx.ms(); }
  achNew = []; roadKey = "";
}
export function achBoot(n) {                                 // при загрузке: сколько ачивок засчитано задним числом
  if (n > 0) { achCap = "Ачивка"; achMsg = "Засчитано ачивок: " + n + ", +" + n + " % урона. Список — во вкладке «Путь»"; achUntil = performance.now() + 12000; }
}
function stepAch() {                                         // зовётся несколько раз в секунду: то, что знает только интерфейс
  if (ACCT.logged()) C.achMark(S, "login");
  const r = TOP.myRank();
  if (r > 0) { if (r <= 10) C.achMark(S, "top10"); if (r <= 3) C.achMark(S, "top3"); if (r === 1) C.achMark(S, "top1"); }
  flushAch();
  const b = tab === "road" ? 0 : Math.max(0, C.achCount(S) - (S.achSeen || 0));
  if (b !== badge || (tab === "road" && S.achSeen !== C.achCount(S))) tabStrip();
}
function drawRoad() {
  if (tab !== "road") return;
  const now = performance.now(), ak = achKey();
  const key = Object.keys(S.un).length + ":" + Object.keys(S.feat).length + ":" + ak;
  if (key === roadKey || (roadKey && now - achDrawAt < 1000 && roadKey.split(":")[2].split("|")[0] === ak.split("|")[0])) return;   // цифры прогресса — не чаще раза в секунду
  roadKey = key; achDrawAt = now;
  const ord = (u) => (u.kind === "rb" ? 1000 + u.at : u.kind === "souls" ? 0 : u.at);
  const list = UNLOCKS.slice().sort((a, b) => ord(a) - ord(b));
  const open = list.filter((u) => S.un[u.key]).length;
  let next = false, h = achHtml() + '<h4 class="achg">Что открывается<span>' + open + " / " + list.length + '</span></h4><p class="note pad">Всё, что есть в игре. Открытое отмечено, остальное ждёт.</p>';
  for (const u of list) {
    const done = !!S.un[u.key], cur = !done && !next; if (cur) next = true;
    h += '<div class="rd' + (done ? " done" : cur ? " cur" : "") + '"><i>' + (done ? "✓" : "") + "</i><div><b>" + u.title + "</b><span>" + condText(u) + "</span><p>" + u.say + "</p></div></div>";
  }
  for (const x of ROAD_EXTRA) {
    const done = x.key === "ecl" || x.key === "grd" || x.key === "au" ? C.eclOpen(S) : x.key === "chaos" ? C.chaosOpen(S) : false;
    h += '<div class="rd' + (x.soon ? " soon" : done ? " done" : "") + '"><i>' + (done ? "✓" : "") + "</i><div><b>" + x.title + "</b><span>" + x.cond + "</span><p>" + x.text + "</p></div></div>";
  }
  $("roadList").innerHTML = h;
}

// ---------- чат Twitch ----------
let chatFor = "";
function buildChat() {                                      // чат того канала, чей стрим сейчас фоном; никто не в эфире — свой
  if (chatBuilt && chatFor === TW.CHANNEL) return;
  chatBuilt = true; chatFor = TW.CHANNEL;
  const box = $("chatBox");
  box.textContent = "";
  const f = document.createElement("iframe");
  f.src = "https://www.twitch.tv/embed/" + TW.CHANNEL + "/chat?parent=" + encodeURIComponent(location.hostname) + "&darkpopout";
  f.title = "Чат Twitch: " + TW.CHANNEL;
  box.appendChild(f);
}

// ---------- умения и бафы ----------
const BUFF_ICON = { flurry: "sk-flurry", rage: "sk-rage", greed: "sk-greed", mark: "sk-mark", ult: "sk-ult", harvest: "buff-harvest", storm: "buff-storm",
  help: "buff-help", gold: "buff-gold", tide: "buff-tide", clock: "buff-clock" };
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
  $("skillbar").classList.toggle("au-on", C.auOn(S));        // автозапуск работает — на умениях метка «авто»
  for (const s of SKILLS) {
    const e = skillEls[s.id], open = C.skillOpen(S, s), on = S.act[s.id] > 0, cd = S.cd[s.id];
    e.root.classList.toggle("lock", !open);
    e.root.classList.toggle("on", open && on);
    e.root.classList.toggle("ready", open && !on && cd <= 0);
    e.cap.textContent = open ? s.name : s.need === "ecl" ? "волна 1000" : s.need ? "возрождение" : "волна " + s.wave;
    e.dur.hidden = !on; e.cd.hidden = !open || on || cd <= 0;
    if (on) { e.bar.style.setProperty("--p", Math.min(100, S.act[s.id] / s.dur * 100).toFixed(0) + "%"); e.t.textContent = clock(S.act[s.id]); }
    else if (open && cd > 0) { e.cd.style.setProperty("--p", (cd / s.cd * 100).toFixed(1) + "%"); e.t.textContent = clock(cd); }
    else e.t.textContent = "";
  }
  const pills = [];
  for (const id in BUFFS) {                                  // плашки — только для бафов без своей кнопки (огоньки): умение показывает время на себе
    const left = S.buff[id] || 0;
    if (left > 0 && pills.length < 2) pills.push('<span><img alt="" src="' + art(BUFF_ICON[id] || "wisp") + '"><b>' + BUFFS[id].name + "</b> " + clock(left) + "</span>");
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
// ---------- второй слой: Затмение и покровители — под реликвиями, видны с первой минуты ----------
const hms = (s) => (s >= 3600 ? Math.floor(s / 3600) + " ч " + Math.floor(s % 3600 / 60) + " мин" : s >= 60 ? Math.ceil(s / 60) + " мин" : Math.ceil(s) + " с");
let patronEls = null, eclKey = "";
function buildPatrons() {
  $("patronList").innerHTML = PATRONS.map((p) => '<div class="relic patron"><img alt="" src="' + art(p.icon) + '"><h4>' + p.name + '<small data-l></small></h4><p>' + p.text +
    '</p><div class="pbuy"><button data-id="' + p.id + '"><img alt="" src="' + art("cur-shard") + '"><span></span></button><button class="mx" data-id="' + p.id + '" data-max>макс</button></div></div>').join("") +
    '<div class="relic patron chaos" id="chaosRow"><img alt="" src="' + art("thief") + '"><h4>Скупщик теней<small data-l></small></h4><p data-t></p></div>';
  patronEls = {};
  for (const p of PATRONS) {
    const b = $("patronList").querySelector('button[data-id="' + p.id + '"]:not(.mx)'), card = b.closest(".relic");
    patronEls[p.id] = { b, mx: card.querySelector(".mx"), cost: b.querySelector("span"), lv: card.querySelector("[data-l]") };
  }
}
// Страж Затмения: карточка над Затмением. Доли здоровья: 37 %, 4,2 %, 0,35 %, «меньше 0,01».
const pc = (f) => { const v = f * 100; return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1).replace(".", ",") : v >= 0.01 ? v.toFixed(2).replace(".", ",") : v > 0 ? "меньше 0,01" : "0"; };
let grdKey = "";
function drawGuard() {
  const open = C.grdOpen(S), g = S.grd, on = S.act.siege > 0, now = on ? C.grdNow(S) : 0, n = C.grdShards(S);
  const key = [open, g.lv, pc(g.left), pc(g.last), on, pc(now), n, S.stats.guards || 0, S.cd.siege > 0].join("|");
  if (key === grdKey) return;
  grdKey = key;
  $("grdBox").innerHTML = !open
    ? "<div>Страж Затмения — цель между Затмениями</div><div class=\"big\">после босса 1000-й волны</div><div>Откроется вместе с Затмением. Умение <b>«Натиск»</b>: полминуты весь твой урон идёт ещё и в Стража. " +
      "Победишь — <b>осколки сразу</b>, не дожидаясь Затмения.</div>"
    : '<div class="ghead"><img alt="" src="' + art("boss-guardian") + '"><div><div>Страж Затмения № ' + (g.lv + 1) + '</div><div class="big">осталось ' + pc(Math.max(0, g.left - now)) + " %</div></div></div>" +
      '<div class="gbar"><i style="width:' + Math.max(0, (g.left - now) * 100).toFixed(2) + '%"></i></div>' +
      "<div>" + (on ? "<b>Идёт натиск:</b> уже снято " + pc(now) + " %. Бей, жми умения, лови огоньки." :
        "Жми умение <b>«Натиск»</b> (седьмое в ряду, клавиша 7): полминуты весь твой урон идёт ещё и в Стража. Больше всего натиск снимает, когда забег упёрся в стену и горят бафы: «Ярость», «Жатва», «Подмога», «Буря».") +
      " Здоровье не восстанавливается. Награда: <b>+" + n + " " + plural(n, "осколок", "осколка", "осколков") + " сразу</b>." +
      (g.last > 0 && !on ? " Прошлый натиск снял " + pc(g.last) + " %." : "") +
      (S.stats.guards ? " Стражей повержено: <b>" + group(S.stats.guards) + "</b>." : "") + "</div>";
}
// Автозапуск умений: карточка под Стражем. Пока час не куплен — цена и сколько вернётся; пока идёт — сколько осталось и
// сколько осколков уже вернулось.
let auKey = "";
function drawAu() {
  const open = C.auOpen(S), a = S.au, on = C.auOn(S), free = C.shardsFree(S);
  const w = C.auWave(S), p = C.auPrice(S, w), g = C.auBonus(S, w), sh = (n) => group(n) + " " + plural(n, "осколок", "осколка", "осколков");
  const key = [open, on, on ? Math.ceil(a.left) : 0, a.back, a.pay, a.total, a.renew, p, w, free >= p, S.stats.auGain || 0].join("|");
  if (key === auKey) return;
  auKey = key;
  const sw = '<button type="button" class="autosw" data-au-renew="1" aria-pressed="' + (a.renew ? "true" : "false") + '"><span class="sw' + (a.renew ? " on" : "") + '"></span><span><b>Продлевать самому</b>' +
    "<small>Час кончился — сразу берётся следующий, по цене волны, на которой забег в эту минуту.</small></span></button>";
  const sum = S.stats.auGain ? " Всего автозапуск принёс сверх цены: <b>+" + sh(S.stats.auGain) + "</b>." : "";
  $("auBox").innerHTML = !open
    ? "<div>Автозапуск умений — час за осколки</div><div class=\"big\">после босса 1000-й волны</div><div>Откроется вместе с Затмением. Платишь осколки — и час все умения включаются сами, <b>«Натиск»</b> тоже. " +
      "Осколки за этот час <b>возвращаются все, и ещё сверху</b>.</div>"
    : on
    ? "<div>Автозапуск умений работает</div><div class=\"big\">осталось " + clock(a.left) + "</div>" +
      '<div class="gbar"><i style="width:' + (a.left / CFG.auHour * 100).toFixed(2) + '%"></i></div>' +
      "<div>Умения включаются сами, как только готовы. Вернулось <b>" + group(a.back) + " из " + sh(a.total) + "</b>: " + group(a.pay) + " " + plural(a.pay, "твой", "твоих", "твоих") +
      " и <b>+" + group(a.total - a.pay) + " сверху</b>. Час куплен на волне " + group(a.w) + " и идёт, пока игра на экране." + sum + "</div>" + sw
    : "<div>Автозапуск умений</div><div class=\"big\">час за " + sh(p) + " → вернётся " + group(p + g) + "</div>" +
      "<div>Час умения включаются сами, как только готовы, <b>«Натиск»</b> тоже. Осколки за этот час вернутся все и ещё <b>+" + group(g) + " сверху</b>. " +
      "Прибавка растёт с волной забега: сейчас волна <b>" + group(w) + "</b>, каждые " + group(CFG.auStep) + " волн — ещё +1 сверху. Цена — вчетверо больше прибавки. " +
      "Час идёт, пока игра на экране." + sum + "</div>" +
      (free >= p ? '<button class="btn ecl" data-au-buy="1">Включить на час — ' + sh(p) + "</button>"
        : '<button class="btn ecl off" disabled>Нужно ' + sh(p) + ", свободно " + group(Math.max(0, free)) + "</button>") + sw;
}
function drawEclipse() {
  if (tab !== "relics") return;
  drawGuard();
  drawAu();
  if (!patronEls) buildPatrons();
  const open = C.eclOpen(S), wait = open ? C.eclWait(S) : 0, n = open ? C.shardsGain(S) : 0, free = C.shardsFree(S);
  const key = [open, Math.ceil(wait / 30), n, free, S.shards, S.ecl, C.chaosStep(S), C.chaosOpen(S), JSON.stringify(S.pat)].join("|");
  if (key === eclKey) return;
  eclKey = key;
  $("eclBox").innerHTML = !open
    ? '<div>Затмение — второй слой</div><div class="big">после босса 1000-й волны</div><div>Победишь босса на 1000-й волне — откроется <b>Затмение</b>: пепел и реликвии сгорят, а взамен дадут <b>осколки</b>. ' +
      "За осколки берут покровителей — они остаются навсегда, и каждый следующий заход уходит глубже прежнего. Сейчас рекорд: волна " + group(S.best) + ".</div>"
    : "<div>Затмение сейчас даст</div><div class=\"big\">" + (n > 0 ? "+" + group(n) + " " + plural(n, "осколок", "осколка", "осколков") : "пока ничего") + "</div>" +
      "<div>Сгорят пепел и реликвии, забег начнётся заново. Осколки, покровители, ачивки и коллекция остаются. Затмение приходит <b>раз в сутки</b>. Затмений было: <b>" + S.ecl +
      "</b>, осколков свободно: <b>" + group(free) + "</b>.</div>" +
      (wait > 0 ? '<button class="btn ecl off" disabled>Следующее Затмение через ' + hms(wait) + "</button>"
        : n > 0 ? '<button class="btn ecl" data-ecl>Затмение…</button>' : '<button class="btn ecl off" disabled>Сначала возродись и набери пепла</button>');
  for (const p of PATRONS) {
    const e = patronEls[p.id], lv = S.pat[p.id] || 0, max = p.cap && lv >= p.cap, c = C.patronCost(S, p), off = !open || max || c > free;
    e.lv.textContent = "ур. " + group(lv) + (p.cap ? " / " + p.cap : "");
    e.cost.textContent = max ? "максимум" : group(c);
    e.b.classList.toggle("off", off); e.mx.classList.toggle("off", off);
  }
  $("patronList").classList.toggle("shut", !open);
  const row = $("chaosRow"), st = C.chaosStep(S);
  row.classList.toggle("lockd", !C.chaosOpen(S));
  row.querySelector("[data-l]").textContent = "шаг " + st + " / " + CFG.chaosMax;
  row.querySelector("[data-t]").textContent = "Третий слой, Великий хаос. Цена уровня наёмника растёт медленнее: сейчас +" + ((C.costG(S) - 1) * 100).toFixed(2).replace(".", ",") +
    " % за уровень. " + (C.chaosOpen(S) ? (st >= CFG.chaosMax ? "Все шаги взяты." : "Шаг даётся за каждое Затмение.") : "Шаг даётся за каждое Затмение после 15 000-й волны.");
}
function openEclipse() {                                     // окно Затмения: что сгорит, что останется; само действие — удержанием
  const n = C.shardsGain(S);
  if (!C.eclOpen(S) || n < 1 || C.eclWait(S) > 0) return;
  const step = C.chaosOpen(S) && C.chaosStep(S) < CFG.chaosMax;
  let t0 = 0, timer = 0;
  const m = openModal('<img class="eclart" alt="" src="' + art("ev-rift") + '"><h2>Затмение</h2><div class="bignum ecl">+' + group(n) + " " + plural(n, "осколок", "осколка", "осколков") + "</div>" +
    "<p><b>Сгорит:</b> весь пепел (" + txt(S.ash) + "), все реликвии, наёмники, предметы и души этого забега. Забег начнётся с первой волны.</p>" +
    "<p><b>Останется:</b> осколки и покровители, ачивки, коллекция предметов и звёзды, рекорды, всё открытое.</p>" +
    (step ? "<p><b>Великий хаос:</b> это Затмение даст шаг «Скупщика теней» — уровни наёмников станут дешевле.</p>" : "") +
    "<p>Следующее Затмение — через 20 часов. Осколки потрать на покровителей во вкладке «Реликвии».</p>" +
    '<div class="acts split"><button class="btn ghost" data-x>Не сейчас</button><button class="btn hold ecl" data-go><span class="fill"></span><span class="lbl">Держи 2 секунды — Затмение</span></button></div>',
  (e) => { if (e.target.closest("[data-x]")) closeModal(); });
  const go = m.querySelector("[data-go]");
  const stop = () => { clearTimeout(timer); timer = 0; go.classList.remove("holding"); };
  go.addEventListener("pointerdown", (e) => {
    e.preventDefault(); t0 = performance.now(); go.classList.add("holding");
    timer = setTimeout(() => { stop(); closeModal(); api.eclipse(); }, CFG.eclHold * 1000);
  });
  for (const k of ["pointerup", "pointerleave", "pointercancel"]) go.addEventListener(k, stop);
}
function drawRelics() {
  drawEclipse();
  if (tab !== "relics" || !relicsBuilt) return;
  const g = C.ashGain(S), open = !!S.un.relics;
  $("reBox").innerHTML = !S.un.rebirth
    ? '<div>Реликвии — навсегда</div><div class="big">с 50-й волны</div><div>Дойдёшь до 50-й волны — откроется <b>Возрождение</b>: забег начнётся заново, а ты получишь <b>пепел</b>. За пепел покупают реликвии, они не сгорают никогда.</div>'
    : "<div>Возрождение сейчас даст</div><div class=\"big\">" + (g === NEG ? "пока ничего" : "+" + txt(g) + " пепла") +
      "</div><div>Каждый пепел, полученный " + (S.ecl ? "с прошлого Затмения" : "за всё время") + ", — <b>+2 % урона</b>. Всего получено: <b>" + txt(S.ashAll) + "</b>. Тратить не жалко: бонус считается от всего заработанного." +
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
// Датчик темпа в полосе волны: сколько сейчас уходит на волну, вердикт, полоска «до порога возрождения» и средние —
// своё за забег и по всем игрокам (приходит с сервером таблицы). Пишется в DOM, только когда текст изменился.
const secs = (s) => (s < 0.1 ? "меньше 0,1 с" : s < 10 ? s.toFixed(1).replace(".", ",") + " с" : s < 100 ? Math.round(s) + " с"
  : s < 3600 ? Math.floor(s / 60) + " мин " + Math.floor(s % 60) + " с" : Math.floor(s / 3600) + " ч " + Math.floor(s % 3600 / 60) + " мин");
const runT = (s) => (s < 60 ? Math.round(s) + " с" : s < 3600 ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : Math.floor(s / 3600) + " ч " + Math.floor(s % 3600 / 60) + " мин");
const PACE_WORD = { fly: "идёшь хорошо", slow: "замедляешься", farm: "стоишь в «Фарме»" };
let paceKey = "";
function drawPace() {
  const p = C.pace(S), all = TOP.reachAll(), allW = TOP.paceAll();
  const now = p.now === null ? "—" : secs(p.now);
  const word = p.state === "stuck" ? (p.canRb ? "пора возрождаться" : "упёрся: качай отряд") : PACE_WORD[p.state] || "";
  const fill = p.state === "stuck" ? 100 : p.now === null ? 0 : Math.round(Math.min(1, p.now / p.limit) * 100);
  // Нижняя строка — путь до рекорда: сколько прошло с возрождения, за сколько забег вернулся к рекорду, с которым начался,
  // как обычно и как у игроков. Пока возрождений не было — прежнее: среднее время волны и предел.
  // Варианты строки от полного к короткому: в узкой полосе (стрим рядом, кнопка «На босса») берётся первый, что помещается.
  const B = (s) => "<b>" + s + "</b>", J = (...a) => a.filter(Boolean).join(" · ");
  const subs = p.since === null ? [J(p.mine === null ? "" : "среднее " + B(secs(p.mine)), "предел " + B(secs(p.limit))), "предел " + B(secs(p.limit))]
    : p.reach !== null ? [J("рекорд за " + B(runT(p.reach)), p.usual !== null ? "обычно " + B(runT(p.usual)) : "", all ? "у игроков " + B(runT(all.avg)) : ""),
      J("рекорд за " + B(runT(p.reach)), p.usual !== null ? "обычно " + B(runT(p.usual)) : ""), "рекорд за " + B(runT(p.reach))]
    : [J("с возрождения " + B(runT(p.since)), !p.target ? "" : p.usual !== null ? "до рекорда обычно " + B(runT(p.usual)) : "до рекорда " + group(Math.max(0, p.target - S.zrec)) + " волн"),
      J("с возрождения " + B(runT(p.since)), p.target && p.usual !== null ? "обычно " + B(runT(p.usual)) : ""), "с возрождения " + B(runT(p.since))];
  const sub = subs[0];
  const key = [now, word, p.state, fill, sub].join("|");
  if (key === paceKey) return;
  paceKey = key;
  const box = $("paceBox"), v = $("paceVerdict");
  box.className = "pace p-" + p.state;
  $("paceNow").textContent = now;
  v.hidden = !word; v.textContent = word;
  $("paceFill").style.width = fill + "%";
  const line = $("paceSub");
  for (let i = 0; i < subs.length; i++) {
    if (i && subs[i] === subs[i - 1]) continue;
    line.innerHTML = "<span>" + subs[i] + "</span>";
    const have = line.getBoundingClientRect().width;       // мерим с долями пикселя: многоточие ставится и при нехватке в полпикселя
    if (!have || line.firstChild.getBoundingClientRect().width <= have + 0.02) break;   // помещается (или блок не виден — мерить нечего)
  }
  box.title = (p.now === null ? "Здесь видно, сколько времени уходит на волну." : "Сейчас на волну уходит " + now + ".") +
    " У босса здоровья как у целой волны, а времени на него — " + secs(p.limit) + ". Когда волна идёт дольше, босса уже не взять: ты упёрся" +
    (p.canRb ? " — пора возрождаться." : S.un.rebirth ? " — качай отряд." : " — качай отряд; возрождение откроется на 50-й волне.") +
    (p.mine === null ? "" : " В среднем за забег у тебя " + secs(p.mine) + " на волну.") +
    (allW ? " У игроков в среднем " + secs(allW.avg) + " на волну." : "") +
    (p.since === null ? "" : " С возрождения прошло " + runT(p.since) + " игры." +
      (p.reach !== null ? " До рекорда, с которым начался забег (волна " + group(p.target) + "), ты дошёл за " + runT(p.reach) + "." : p.target ? " Рекорд, с которым начался забег, — волна " + group(p.target) + "." : "") +
      (p.usual !== null ? " Обычно доходишь за " + runT(p.usual) + " (среднее по прошлым забегам, до пяти)." : "")) +
    (all ? " У игроков путь до рекорда в среднем " + runT(all.avg) + " (замерено игроков: " + all.n + ", за сегодня и вчера)." : "");
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
  drawWave(); drawPace();
  const r = C.rateLg(S);
  $("bankRate").innerHTML = r === NEG ? "бей труперов — души твои" : "<b>+" + txt(r) + "</b> в секунду";
  $("stClick").textContent = txt(C.clickLg(S));
  $("stDpsBox").hidden = S.d.dps === NEG;
  if (S.d.dps !== NEG) $("stDps").textContent = txt(C.dpsLg(S)) + "/с";
  $("stCrit").textContent = Math.round(C.critChance(S) * 100) + " %";
  if (!!S.un.bulk !== bulkShown) { bulkShown = !!S.un.bulk; drawBuySeg(); }
  if (tab === "squad") drawRows();
  drawRelics(); drawItems(); drawRoad(); drawDraft(); drawKeep();
  drawSkills();
  TW.draw();
  TOP.tick(tab === "top");
  SWAP.tick();
  stepAch();
  $("chipAsh").hidden = S.ashAll === NEG && !S.ecl;
  if (S.ashAll !== NEG || S.ecl) $("ashNum").textContent = txt(S.ash);
  $("chipShard").hidden = !S.shards;
  if (S.shards) $("shardNum").textContent = group(C.shardsFree(S));
  if (S.act.siege > 0) {                                     // идёт натиск: в плашке «Дальше» — его ход
    achCap = "Натиск на Стража"; achUntil = performance.now() + 600;
    achMsg = "Снято " + pc(C.grdNow(S)) + " % · осталось " + Math.ceil(S.act.siege) + " с · бей и жми умения";
  }
  const nx = C.nextUp(S), nl = $("nextLine"), flash = performance.now() < achUntil;
  const hint = flash ? achMsg : nx ? nx.text : S.stats.clicks < 5 ? "Бей труперов и собирай души. Справа видно всё, что можно открыть" : "Всё идёт своим чередом: качай отряд и иди вперёд";
  if (nl.textContent !== hint) { nl.textContent = hint; nl.title = hint; }   // строка обрезается на двух строках — целиком видна по наведению
  if ($("nextBox").classList.contains("flash") !== flash) $("nextBox").classList.toggle("flash", flash);
  const cap = flash ? achCap : "Дальше";
  if ($("nextCap").textContent !== cap) $("nextCap").textContent = cap;
  const rb = $("btnRebirth"), g = C.ashGain(S);
  rb.hidden = false;
  rb.classList.toggle("weak", g === NEG || !S.un.rebirth);
  const gt = g === NEG ? "" : txt(g);                       // длинное число — без приписки «(держи)»: кнопка узкая, а про удержание говорит подсказка
  rb.querySelector(".lbl").textContent = !S.un.rebirth ? "Возрождение — с 50-й волны" : g === NEG ? "Возрождение: пока рано" : "Возрождение: +" + gt + " пепла" + (gt.length > 5 ? "" : " (держи)");
  rb.title = S.un.rebirth && g !== NEG ? "Держи кнопку, чтобы возродиться" : "";
}

function stepDraft() {                                       // карточки предметов: включаются, когда пауза выдержана
  if (!S.draft) return;
  const lock = !draftReady();
  if (lock !== draftLocked) { draftLocked = lock; $("draft").classList.toggle("lock", lock); }
  const h = $("draftHint");
  if (!h) return;
  const t = !lock ? "" : performance.now() - draftAt < DRAFT_LOCK ? "Секунду: посмотри, что выпало" : "Останови клики — и выбирай";
  if (h.textContent !== t) h.textContent = t;
}

export function frame(dt) {
  if (TW.watching()) C.achNote(S, "tw", dt);                // ачивка «Кино и клики»: время игры со стримом на фоне
  C.setWatch(S, TW.watching() && TW.isLive() && TW.ownShown());              // сундук эфира копится, пока свой стрим идёт фоном
  drawBank(dt);
  stepHold(dt);
  stepDraft();
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
    if (gridBuys > 0) { gridBuys -= 1; if (e.ms) sfx.mile(); }   // покупка с сетки: щелчок уже прозвучал при нажатии
    else if (e.ms) sfx.ms(); else sfx.buy();
    slowT = 0;
  } else if (e.t === "unlock") { if (e.key === "bulk") drawBuySeg(); slowT = 0; }
  else if (e.t === "rebirth" || e.t === "eclipse") { rows = []; $("mercList").textContent = ""; fig = null; hgFit = ""; shownLg = NEG; lastSfx = null; lastK = -1; slowT = 0; itemsKey = rosterKey = ""; draftKey = "?"; eclKey = ""; grdKey = ""; }
  else if (e.t === "draft" || e.t === "item" || e.t === "feat" || e.t === "star") {
    slowT = 0; itemsKey = "";
    if (e.t === "item" && e.auto) { const x = ITEMS.find((q) => q.id === e.id); note("Автовыбор", "Взят предмет «" + x.name + "», ранг " + RANK[e.rank], 2600); }   // вместо карточек — строка в плашке «Дальше»
  }
  else if (e.t === "siege_end") { note("Страж Затмения", e.took > 0 ? "Натиск снял " + pc(e.took) + " %, у Стража осталось " + pc(e.left) + " %" : "Натиск не пробил Стража: бей его, когда забег упёрся в стену и горят бафы", 7000); grdKey = ""; }
  else if (e.t === "fig") {                                  // рисунок на сетке собран
    figChipKey = "?";
    if (S.stats.figs === 1) note("Рисунок «" + e.name + "» собран", "Пошло комбо: души ×" + mulT(C.figMul(S)) + ". Собери следующий, пока идёт время, — множитель вырастет", 4200);
  }
  else if (e.t === "fig_end") {
    if (fig) { for (const i of fig.hit) if (rows[i]) rows[i].root.classList.remove("hg-hit"); fig.hit.clear(); }
    figChipKey = "?";
    sfx.drop();
    spawnFig();                                              // сложный рисунок уходит: новое комбо начинается с простого
    const list = $("mercList");
    if (list.offsetParent !== null && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const n = document.createElement("div"); n.className = "hg-pop lose"; n.style.left = (list.clientWidth / 2) + "px"; n.style.top = Math.max(60, list.clientHeight / 2) + "px";
      n.innerHTML = "<b>Комбо оборвалось</b><span>было " + group(e.k) + "</span>"; list.appendChild(n); setTimeout(() => n.remove(), 1500);
    }
    if (e.k >= 5) note("Комбо рисунков оборвалось", "Было " + group(e.k) + ". Собери рисунок на сетке отряда — начнётся новое", 3400);
  }
  else if (e.t === "au_on") { note("Автозапуск включён", "Час умения включаются сами. Вернётся " + group(e.pay) + " и ещё +" + group(e.gain) + " " + plural(e.gain, "осколок", "осколка", "осколков") + " сверху", 4200); auKey = ""; eclKey = ""; }
  else if (e.t === "au_gain") { auKey = ""; eclKey = ""; }
  else if (e.t === "au_end") { note("Автозапуск закончился", "Осколки вернулись, сверху +" + group(e.gain) + " — во вкладке «Реликвии» можно включить ещё", 5200); auKey = ""; eclKey = ""; }
  else if (e.t === "guard_kill") { note("Страж повержен", "+" + e.shards + " " + plural(e.shards, "осколок", "осколка", "осколков") + " сразу — потрать на покровителей во вкладке «Реликвии». Вышел страж № " + (e.n + 1), 12000); grdKey = ""; eclKey = ""; sfx.rank(); }
  else if (e.t === "reach") {                                // забег вернулся к рекорду, с которым начался
    const u = C.pace(S).usual;
    note("До рекорда", "Дошёл до прошлого рекорда за " + runT(e.sec) + (u === null ? "" : e.sec < u ? " — на " + runT(u - e.sec) + " быстрее обычного" : " — обычно " + runT(u)), 6000);
  }
  else if (e.t === "ach") achNew.push(e);
  else if (e.t === "chest_in") {
    note("Сундук", (e.kind === "air" ? "Выпал сундук эфира" : "Все задания дня сделаны — сундук дня твой" + (e.streak > 1 ? ", серия " + e.streak + " " + plural(e.streak, "день", "дня", "дней") : "")) + ". Открой во вкладке «Скины»", 9000);
    keepKey = "";
  } else if (e.t === "task") { note("Задание дня", "«" + e.text + "» — готово: +" + txt(e.loot) + " душ", 6000); sfx.ms(); keepKey = ""; }
  else if (e.t === "rpgskins") { note("Скины RPG", "Из RPG пришло скинов: " + e.added.length + ". Они на твоих наёмниках, весь урон от скинов " + mulText(S.d.rpg), 9000); resetRows(); keepKey = ""; }
}

// ---------- окна ----------
export function closeModal() { clearTimeout(wipeT); wipeT = 0; const m = $("modal"); m.onclick = null; $("veil").hidden = true; m.hidden = true; m.textContent = ""; }
function openModal(html, onClick) {                         // onClick — единственный обработчик кликов этого окна
  clearTimeout(wipeT); wipeT = 0;
  const m = $("modal"); m.innerHTML = html; m.onclick = onClick || null; m.hidden = false; m.scrollTop = 0; $("veil").hidden = false; return m;
}
export function toast(text, ms) {                           // всплывает над серединой линии: поверх чата Twitch ничего показывать нельзя
  const t = $("toast"), s = document.querySelector(".stage").getBoundingClientRect();
  t.style.left = Math.round(s.left + s.width / 2) + "px"; t.style.maxWidth = Math.max(220, Math.round(s.width - 24)) + "px";
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms || 2600);
}
export function showOffline(o) {
  const h = Math.floor(o.counted / 3600), m = Math.floor(o.counted % 3600 / 60);
  const m2 = openModal('<h2>Пока тебя не было</h2><p>Наёмники фармили ' + (h ? h + " ч " : "") + m + " мин на " + Math.round(o.eff * 100) + ' % скорости.</p>' +
    '<div class="bignum">+' + txt(o.gained) + ' душ</div><p>' + (o.waves > 0 ? "Пройдено волн: " + group(o.waves) + "." : "Волна та же: босс пока не по зубам.") + '</p>' +
    '<div class="acts"><button class="btn gold big" data-x>Забрать</button></div>');
  m2.querySelector("[data-x]").addEventListener("click", closeModal);
}
// ---------- вход через Twitch: плашка наверху ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function drawWho() {
  const b = $("btnWho"), inn = ACCT.logged(), busy = ACCT.state.phase === "code" || ACCT.state.phase === "start";
  b.classList.toggle("in", inn);
  b.querySelector(".t").textContent = inn ? ACCT.who() : busy ? "Вход…" : "Войти";
  b.title = inn ? "Ты вошёл через Twitch как " + ACCT.who() : "Вход через Twitch: для таблицы рекордов и обмена на души RPG";
}
function whoClick() {
  if (!ACCT.logged()) { tab = "top"; drawTabs(); ACCT.login(); slowT = 0; return; }   // вкладка «Топ» покажет код входа
  openModal("<h2>" + esc(ACCT.who()) + "</h2><p>Ты вошёл через Twitch. Вход нужен для таблицы рекордов и обмена на души RPG. Прогресс игры хранится в этом браузере и к аккаунту не привязан.</p>" +
    '<div class="acts split"><button class="btn ghost sm" data-out>Выйти</button><button class="btn" data-x>Готово</button></div>',
  (e) => { const t = e.target.closest("button"); if (!t) return; if (t.dataset.out !== undefined) ACCT.logout(); closeModal(); });
}

// ---------- микрообучение: три шага при первом запуске ----------
const INTRO = [
  ["cur-farm", "Бей труперов — собирай души", "Кликай по врагу или держи кнопку мыши. Души — главная валюта: на них нанимают отряд, а лишние меняют на души RPG стрима — кнопка «Обмен» наверху."],
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
    if (last) C.achMark(S, "intro");
    if (b.dataset.skip !== undefined || last) closeModal(); else showIntro(i + 1);
  });
}

// ---------- настройки и стирание ----------
// У окна всегда один обработчик кликов: его ставит openModal. Раньше обработчики копились с каждым открытием настроек.
// Копий сохранения и загрузки прогресса нет намеренно: любая такая дверь — способ накрутить рекорд.
const mins = (s) => (s >= 3600 ? Math.floor(s / 3600) + " ч " + Math.floor(s % 3600 / 60) + " мин" : Math.max(1, Math.floor(s / 60)) + " мин");
let wipeT = 0;

function openSettings() {
  const sw = (k, label) => '<div class="row"><span>' + label + '</span><button class="sw' + (S.set[k] ? " on" : "") + '" data-k="' + k + '" aria-label="' + label + '"></button></div>';
  openModal("<h2>Настройки</h2>" + sw("sound", "Звук игры") + sw("stream", "Стрим Twitch фоном линии, когда он идёт") + sw("calm", "Спокойный режим: без тряски и вспышек") +
    sw("sci", "Научная запись чисел") + sw("autoBoss", "Сам идти на босса, когда наёмники справятся") +
    '<div class="row"><span>Как играть: три шага</span><button class="btn ghost sm" data-intro>Показать</button></div>' +
    '<div class="row"><span>Настройки как в начале. Прогресс не трогает</span><button class="btn ghost sm" data-defaults>Сбросить настройки</button></div>' +
    '<div class="row"><span>Сыграно</span><b>' + mins(S.stats.played) + " · ударов " + group(S.stats.clicks) + "</b></div>" +
    '<div class="acts split"><button class="btn danger sm" data-wipe>Стереть весь прогресс…</button><button class="btn" data-x>Готово</button></div>',
  (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (d.k) { S.set[d.k] = !S.set[d.k]; b.classList.toggle("on", S.set[d.k]); api.settings(); drawSound(); TW.sync(); }
    else if (d.x !== undefined) closeModal();
    else if (d.defaults !== undefined) { api.defaults(); drawSound(); openSettings(); toast("Настройки сброшены. Прогресс не тронут"); }
    else if (d.intro !== undefined) showIntro(0);
    else if (d.wipe !== undefined) openWipe();
  });
}
function openWipe() {                                       // стирание — только удержанием: случайный или двойной клик ничего не сотрёт
  openModal("<h2>Стереть весь прогресс?</h2><p>Пропадёт всё, что накоплено: волна " + group(S.best) + ", " + mins(S.stats.played) +
    " игры, наёмники, пепел, реликвии, предметы и их звёзды. Игра начнётся с первой волны.</p>" +
    "<p><b>Вернуть стёртое будет нельзя.</b> Настройки это не трогает: для них есть отдельная кнопка «Сбросить настройки».</p>" +
    '<div class="acts split"><button class="btn danger hold" data-wipe-go><span class="fill"></span><span class="lbl">Стереть: держи 3 секунды</span></button><button class="btn gold" data-x>Не стирать</button></div>',
  (e) => { if (e.target.closest("[data-x]")) openSettings(); });
  const b = $("modal").querySelector("[data-wipe-go]");
  const stop = () => { clearTimeout(wipeT); wipeT = 0; b.classList.remove("holding"); };
  b.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    b.classList.add("holding");
    clearTimeout(wipeT);
    wipeT = setTimeout(() => { wipeT = 0; api.reset(); closeModal(); toast("Прогресс стёрт. Начинаем с первой волны"); }, 3000);
  });
  for (const n of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(n, stop);
  b.addEventListener("contextmenu", (e) => e.preventDefault());
}
export function applySettings() { setSound(S.set.sound); setSci(S.set.sci); FX.setCalm(S.set.calm); }

// ---------- вкладка «Скины»: сундуки, задания дня, скины труперов, скины героев из RPG ----------
// Правила — core.js, раздел «удержание». Вкладка строится заново, только когда поменялось что-то по существу
// (keepKey); таймер сундука и счёт заданий обновляются на месте, чтобы кнопки не прыгали под курсором.
let keepKey = "", keepEls = null, chestBadge = -1, rpgAt = 0, rpgBusy = false;
const RPG_URL = "https://rpg.aliveenjoyer.art/game/hero";
const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const mulText = (l) => { const v = Math.pow(10, l); return "×" + (v < 1000 ? String(Math.round(v * 10) / 10).replace(".", ",") : txt(l)); };
const porArt = (id) => (C.hasRpgSkin(S, id) ? rpgSkinArt(id) : heroArt(id));
const porCls = (id) => (C.hasRpgSkin(S, id) ? " skin rar-" + RPG_SKINS[id][1] : "");
const porTip = (id) => (C.hasRpgSkin(S, id) ? ' title="Скин из RPG «' + RPG_SKINS[id][0] + "»: весь урон ×" + String(C.rpgSkinMul(id)).replace(".", ",") + '"' : "");
function resetRows() { rows = []; $("mercList").textContent = ""; fig = null; hgFit = ""; rosterKey = ""; slowT = 0; }
function note(cap, text, ms) { achCap = cap; achMsg = text; achUntil = performance.now() + ms; slowT = 0; }
function airNote() {
  const c = S.chest;
  if (c.air >= KEEP.airCap) return "Ждёт " + c.air + " — открой, и начнут копиться новые";
  if (S.live && S.watch) return "Следующий через " + mmss(Math.max(0, KEEP.airEvery - c.airT));
  if (S.live) return "Стрим идёт! Включи его фоном — кнопка Twitch над линией";
  return "Копится, пока идёт стрим aliveenjoyer и он включён здесь фоном: 10 минут — сундук";
}
function taskLine(i) {                                       // «312 / 400» или «12 / 20 мин»
  const q = S.tsk.list[i], t = TASKS.find((x) => x.id === q.id), v = C.taskNow(S, i);
  return t.min ? Math.floor(v / 60) + " / " + Math.round(t.need / 60) + " мин" : group(Math.floor(v)) + " / " + group(t.need);
}
function buildKeep() {
  const c = S.chest, T = S.tsk, h = [];
  const streakPct = Math.round(KEEP.streakStep * Math.min(KEEP.streakMax, T.streak) * 100);
  const done = T.done.filter(Boolean).length;
  h.push('<div class="kchest air' + (c.air ? " ready" : "") + '"><img alt="" src="' + art(c.air ? "ev-chest" : "ev-chest") + '"><div class="kc"><b>Сундук эфира' + (c.air ? " · " + c.air : "") +
    '</b><span data-k="airNote"></span><div class="achbar sm"><i data-k="airBar"></i></div></div><button class="btn gold sm' + (c.air ? "" : " off") + '" data-open="air"' + (c.air ? "" : " disabled") + ">Открыть</button></div>");
  h.push('<div class="kchest day' + (c.day ? " ready" : "") + '"><img alt="" src="' + art("ev-chest") + '"><div class="kc"><b>Сундук дня' + (c.day ? " · " + c.day : "") + "</b><span>" +
    (T.all ? "Сегодняшний получен. Новые задания — завтра" : "За три задания дня. Сделано " + done + " из " + T.list.length) +
    '</span></div><button class="btn gold sm' + (c.day ? "" : " off") + '" data-open="day"' + (c.day ? "" : " disabled") + ">Открыть</button></div>");
  h.push('<p class="note kn">В сундуках — души, а иногда скин трупера. ' + (C.tskinCount(S) < TSKINS.length ? "Новый скин выпадет не позже чем через " + Math.max(1, KEEP.pity - c.dry + 1) + " " +
    plural(Math.max(1, KEEP.pity - c.dry + 1), "сундук", "сундука", "сундуков") + "." : "Все скины труперов собраны: за повторку души сундука удваиваются.") + "</p>");

  h.push('<h4 class="achg">Задания дня<span>' + done + " / " + T.list.length + "</span></h4>");
  for (let i = 0; i < T.list.length; i++) {
    const t = TASKS.find((x) => x.id === T.list[i].id);
    h.push('<div class="ktask' + (T.done[i] ? " done" : "") + '"><div class="kt"><b>' + C.taskText(t) + '</b><span data-k="task' + i + '"></span></div><div class="achbar sm"><i data-k="bar' + i + '"></i></div></div>');
  }
  h.push('<p class="note kn">Каждое задание — 10 минут дохода душами. Все три — сундук дня и день в серию. Серия: <b>' + T.streak + " " + plural(T.streak, "день", "дня", "дней") +
    "</b>, души <b>+" + streakPct + " %</b> (по 10 % за день, до +100 %). Пропустишь день — серия уменьшится вдвое.</p>");

  const own = C.tskinCount(S);
  h.push('<h4 class="achg">Скины труперов<span>' + own + " / " + TSKINS.length + '</span></h4><p class="note kn">Выпадают из сундуков. Отмеченные выходят на линию вперемешку — нажми, чтобы убрать или вернуть.</p><div class="tskins">');
  h.push('<button type="button" class="tsk' + (S.skins.on.std ? " on" : "") + '" data-skin="std"><img alt="" src="' + art(S.set.faction === "sapphire" ? "trooper-amber" : "trooper-sapphire") + '"><b>Обычный</b><small>' + (S.skins.on.std ? "в строю" : "отдыхает") + "</small></button>");
  for (const x of TSKINS) {
    const n = S.skins.own[x.id] || 0, on = n > 0 && S.skins.on[x.id];
    h.push('<button type="button" class="tsk rar-' + x.rar + (n ? "" : " lockd") + (on ? " on" : "") + '" data-skin="' + x.id + '" style="--bc:' + TSKIN_RAR[x.rar].color + '"' + (n ? "" : ' title="Ещё не выпал: ищи в сундуках"') +
      '><img alt="" loading="lazy" src="' + tskinArt(x.id) + '"><b>' + x.name + "</b><small>" + (n ? (on ? "в строю" : "отдыхает") + (n > 1 ? " · ×" + n : "") : TSKIN_RAR[x.rar].name.toLowerCase()) + "</small></button>");
  }
  h.push("</div>");

  const have = S.rpg.skins.length;
  h.push('<h4 class="achg">Скины героев из RPG<span>' + have + " / " + Object.keys(RPG_SKINS).length + "</span></h4>");
  h.push('<div class="rpgsum"><b>' + (have ? "Весь урон " + mulText(S.d.rpg) : "Скин из RPG — и герой дерётся в нём") + "</b><span>Скины, выбитые на странице RPG стрима, надеваются на твоих наёмников и умножают весь урон: серебро ×1,5, золото ×2, хаос ×3 — каждый скин. " +
    'Сундук скинов — на странице персонажа.</span><a class="btn sm" href="' + RPG_URL + '" target="_blank" rel="noopener">Открыть RPG</a></div>');
  h.push('<div id="rpgLogin"></div><div class="rskins">');
  const ids = Object.keys(RPG_SKINS).sort((a, b) => (C.hasRpgSkin(S, b) ? 1 : 0) - (C.hasRpgSkin(S, a) ? 1 : 0));
  for (const id of ids) {
    const sk = RPG_SKINS[id], mine = C.hasRpgSkin(S, id), hero = id === "lesh" ? "Лэш" : (HEROES.find((x) => x.id === id) || { name: id }).name;
    h.push('<div class="rsk rar-' + sk[1] + (mine ? " own" : "") + '" title="' + hero + " — «" + sk[0] + "», " + RPG_RAR[sk[1]].name.toLowerCase() + ": весь урон ×" + String(KEEP.rpgMul[sk[1]]).replace(".", ",") +
      (mine ? "" : ". Ещё не выбит") + '"><img alt="" loading="lazy" src="' + rpgSkinArt(id) + '"><span>×' + String(KEEP.rpgMul[sk[1]]).replace(".", ",") + "</span></div>");
  }
  h.push("</div>");
  const box = $("keepBox");
  box.innerHTML = h.join("");
  keepEls = {};
  box.querySelectorAll("[data-k]").forEach((n) => { keepEls[n.dataset.k] = n; });
  if (!ACCT.logged()) ACCT.card(box.querySelector("#rpgLogin"), "Войди через Twitch — и скины, которые ты выбил в RPG стрима, появятся на твоих наёмниках.");
}
function drawKeep() {
  const cw = C.chestsWaiting(S);
  if (cw !== chestBadge) { chestBadge = cw; tabStrip(); }
  drawLiveChest();
  if (Date.now() - rpgAt > 600000) syncRpg(false);
  if (tab !== "skins") return;
  const T = S.tsk, c = S.chest;
  const key = [c.air, c.day, c.dry, T.day, T.done.join(""), T.all, T.streak, JSON.stringify(S.skins), S.rpg.skins.join(), S.set.faction, ACCT.logged(), ACCT.state.phase, ACCT.state.code, ACCT.state.err].join("|");
  if (key !== keepKey) { keepKey = key; buildKeep(); }
  const E = keepEls;
  if (!E || !E.airNote) return;
  const an = airNote();
  if (E.airNote.textContent !== an) E.airNote.textContent = an;
  E.airBar.style.width = (c.air >= KEEP.airCap ? 100 : Math.min(100, c.airT / KEEP.airEvery * 100)).toFixed(1) + "%";
  for (let i = 0; i < T.list.length; i++) {
    const tn = E["task" + i], tb = E["bar" + i];
    if (!tn) continue;
    const t = TASKS.find((x) => x.id === T.list[i].id), line = T.done[i] ? "готово" : taskLine(i);
    if (tn.textContent !== line) tn.textContent = line;
    tb.style.width = (C.taskNow(S, i) / t.need * 100).toFixed(0) + "%";
  }
}
function drawLiveChest() {                                   // рядом с плашкой «Стрим идёт»: сколько до сундука эфира
  const b = $("liveChest"), c = S.chest;
  const text = c.air > 0 ? "Сундук эфира ждёт" + (c.air > 1 ? " · " + c.air : "") : !S.live ? "" : S.watch ? "Сундук через " + mmss(Math.max(0, KEEP.airEvery - c.airT)) : "Включи стрим — будут сундуки";
  if (b.hidden !== !text) b.hidden = !text;
  if (text && b.textContent !== text) b.textContent = text;
  b.classList.toggle("ready", c.air > 0);
}
function openChest(kind) {                                   // открыть сундук и показать, что внутри
  const r = C.openChest(S, kind);
  if (!r) { sfx.deny(); return; }
  sfx.rank(); keepKey = ""; slowT = 0; api.settings();
  const more = C.chestsWaiting(S), next = S.chest.air > 0 ? "air" : "day";
  let h = '<img class="chestart" alt="" src="' + art("ev-chest-open") + '"><h2>' + (kind === "air" ? "Сундук эфира" : "Сундук дня") + '</h2><div class="bignum chest">+' + txt(r.loot) + " душ</div>";
  if (r.skin) {
    const ra = TSKIN_RAR[r.rar];
    h += '<div class="gotskin" style="--bc:' + ra.color + '"><img alt="" src="' + tskinArt(r.skin) + '"><div><b>' + r.name + "</b><span>" + ra.name + " скин трупера</span><em>" +
      (r.dupe ? "Такой уже есть — зато души этого сундука удвоены" : "Новый! Уже вышел на линию") + "</em></div></div>";
    if (!r.dupe) FX.refreshLine();
  } else if (C.tskinCount(S) < TSKINS.length) {
    const k = Math.max(1, KEEP.pity - S.chest.dry + 1);
    h += "<p>Скина в этот раз нет. Новый выпадет не позже чем через " + k + " " + plural(k, "сундук", "сундука", "сундуков") + ".</p>";
  }
  if (kind === "air") h += "<p>В придачу — «Жатва»: урон ×5 на минуту.</p>";
  h += '<div class="acts split">' + (more ? '<button class="btn gold" data-more="' + next + '">Открыть ещё · ' + more + "</button>" : "<span></span>") + '<button class="btn ghost" data-x>Забрать</button></div>';
  openModal(h, (e) => { const b = e.target.closest("[data-more]"); if (b) openChest(b.dataset.more); else if (e.target.closest("[data-x]")) closeModal(); });
}
function keepClick(e) {
  const o = e.target.closest("[data-open]");
  if (o) { if (!o.disabled) openChest(o.dataset.open); return; }
  const s = e.target.closest("[data-skin]");
  if (s) {
    const id = s.dataset.skin;
    if (id !== "std" && !(S.skins.own[id] > 0)) { sfx.deny(); return; }
    C.wearSkin(S, id, !S.skins.on[id]); FX.refreshLine(); sfx.buy(); keepKey = ""; slowT = 0; api.settings();
  }
}
async function syncRpg(force) {                              // скины героев из RPG: сервер отдаёт их вошедшему через Twitch
  const before = S.rpg.skins.join();
  if (!ACCT.logged()) {                                      // вышел из аккаунта — чужие скины не остаются
    if (before) { C.setRpgSkins(S, []); resetRows(); keepKey = ""; api.settings(); }
    return;
  }
  const now = Date.now();
  if (rpgBusy || (!force && now - rpgAt < 60000)) return;
  rpgBusy = true; rpgAt = now;
  const d = await ACCT.api("/me", { sid: ACCT.sid() });
  rpgBusy = false;
  if (!d || !d.ok || !Array.isArray(d.skins)) return;        // нет связи или сервер ещё не знает про скины — оставляем как было
  C.setRpgSkins(S, d.skins);
  if (S.rpg.skins.join() !== before) { resetRows(); keepKey = ""; api.settings(); }
}
