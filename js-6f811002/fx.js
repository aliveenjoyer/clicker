// Линия: всё, что двигается. Удар, числа, осколки, сферы душ, босс, огонёк, титры, сцена возрождения.
// Тайминги и ступени силы отклика — PLAN.md § 16. Правил игры здесь нет: только картинка и звук по событиям ядра.
import { CFG } from "./data.js";
import * as C from "./core.js";
import { txt, lsum, L10 } from "./num.js";
import { sfx } from "./audio.js";
import { art, has, districtArt } from "./art.js";
import { bossOf } from "./data.js";

const $ = (id) => document.getElementById(id);
let S = null, el = {}, W = 1, H = 1, FW = 1, FH = 1, ctx = null, dpr = 1;   // W×H — холст эффектов, FW×FH — само поле
let away = false, strike = null, notice = null;             // трупер вынесен с линии: эффекты рисуются в рамке вокруг него
let docked = false, wantDock = false;                       // стрим фоном: счёт душ, комбо, цифры и Душка стоят в полосе под картинкой
const pv = { x: -999, y: -999 };                            // указатель в координатах окна
let parts = [], rings = [], orbs = [], flies = 0;
const ptr = { x: -999, y: -999, inside: false };
let lastMove = 0;
let lastPop = 0, lastHit = 0, kills = [], dieTok = 0, orbN = 0, says = [], sayUntil = 0, hpTextT = 0, comboShown = -1;
let calm = false, small = false, tall = false;

export function mount(state) {
  S = state;
  for (const id of ["field", "fxc", "enemy", "q1", "q2", "plate", "hp", "hpText", "enemyName", "enemyCount", "facDot", "crown", "lash", "lashGlow",
    "lashLine", "bossRing", "bossArc", "bossT", "combo", "comboN", "comboName", "wisp", "banner", "hint", "pops", "dushka", "say", "cursor",
    "bankBox", "rushLines", "pet", "crate", "statue", "urn", "weak", "fxl", "fxo", "foeGrip", "foeHome", "stats", "dock", "twctl"]) el[id] = $(id);
  ctx = el.fxc.getContext("2d");
  el.weak.style.backgroundImage = "url(" + art("fx-weak") + ")";
  for (const u of [el.q1, el.q2]) u.querySelector("img").src = trooper();
  el.facDot.className = "fac " + (S.set.faction === "sapphire" ? "fac-amber" : "fac-sapphire");
  resize();
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(el.field);   // поле меняет размер и без смены окна: стрим фоном делает его 16:9
  el.field.addEventListener("pointermove", onPtr);
  el.field.addEventListener("pointerdown", onPtr);
  el.field.addEventListener("pointerleave", () => { ptr.inside = false; });
  window.addEventListener("pointermove", (e) => { pv.x = e.clientX; pv.y = e.clientY; if (away) lastMove = performance.now(); });
  el.pops.addEventListener("animationend", (e) => { if (e.target.classList.contains("pop")) e.target.remove(); });
  bindFoe();
  el.enemy.querySelector("img").addEventListener("load", () => { if (away) syncFoe(); });   // босс выше трупера: не даём ему вылезти за край окна
  setEnemy();
  syncFoe();
  setDock(wantDock);
}
export function setState(state) { S = state; setEnemy(); syncFoe(); }
export function setCalm(v) { calm = !!v; document.body.classList.toggle("calm", calm); }

function resize() {
  const r = el.field.getBoundingClientRect();
  FW = Math.max(1, r.width); FH = Math.max(1, r.height);
  el.field.style.setProperty("--fh", Math.round(FH) + "px");  // от высоты поля считается рост трупера, когда стрим на фоне
  el.dock.classList.toggle("wide", FW >= 1150); el.dock.classList.toggle("slim", FW < 800); el.dock.classList.toggle("tiny", FW < 600);   // полоса под картинкой подстраивается под ширину поля
  el.field.parentNode.classList.toggle("mid", FW < 900); el.field.parentNode.classList.toggle("narrow", FW < 760);   // и блоки вокруг: полоса волны, умения
  W = away ? Math.max(1, el.fxbox.clientWidth) : FW; H = away ? Math.max(1, el.fxbox.clientHeight) : FH;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  el.fxc.width = Math.round(W * dpr); el.fxc.height = Math.round(H * dpr);
  small = FW < 560;
  const t = FW / FH < 1.16;                                  // поле почти квадратное или выше — вертикальный фон
  if (t !== tall) { tall = t; el.field.classList.toggle("tallbg", tall); if (bgNow) setEnemy(); }
}
function onPtr(e) {
  const r = el.field.getBoundingClientRect();
  ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.inside = true; lastMove = performance.now();
  el.cursor.style.transform = "translate(" + (ptr.x - 6) + "px," + (ptr.y - 6) + "px)";
}
function org() {                                             // начало координат эффектов: угол поля, а с вынесенным трупером — угол рамки вокруг него
  const f = (away ? el.fxbox : el.field).getBoundingClientRect();
  return { left: f.left, top: f.top };
}
function enemyBox() {
  const r = el.enemy.getBoundingClientRect(), f = org();
  return { x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height * 0.45, w: r.width, h: r.height };
}
const rnd = (a, b) => a + Math.random() * (b - a);
function restart(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
function anim(cls) {                                        // у цели одна анимация за раз: новая снимает прежние
  el.enemy.classList.remove("sq", "die", "enter", "bossin"); void el.enemy.offsetWidth; el.enemy.classList.add(cls);
}
const facColor = () => (S.set.faction === "sapphire" ? "#ffa53d" : "#4da3ff");
const trooper = () => art(S.set.faction === "sapphire" ? "trooper-amber" : "trooper-sapphire");
let bgNow = "", spriteNow = "", moodUntil = 0, moodNow = "";
function mood(m, ms) {                                      // Душка: idle | happy | scared | sleepy
  if (m !== moodNow) { moodNow = m; el.pet.src = art("pet-" + m); }
  moodUntil = ms ? performance.now() + ms : 0;
}

// ---------- трупер вне линии: за ручку на табличке его можно утащить в любое место страницы и бить там ----------
// Пока он снаружи, слои эффектов (искры, числа, хлыст, сферы) переезжают из поля в рамку вокруг самого трупера (#foeFx).
// Растягивать их на всё окно нельзя: Twitch считает чат, накрытый любым элементом — даже прозрачным и не ловящим клики, —
// закрытым и отключает в нём ввод владельцу канала и модераторам. Поэтому рамка небольшая, а там, где она задела бы
// чат, её поле подрезается. Если на чат поставили самого трупера, игрок получает подсказку.
const FXM = { l: 220, t: 170, r: 130, b: 60 };              // поля рамки эффектов вокруг вынесенного трупера
let fxm = null, fitT = 0, dragging = false, wasOver = false;
function setAway(on) {
  if (on === away) return;
  away = on;
  parts = []; rings = [];
  for (const o of orbs) o.el.remove();
  orbs = []; el.pops.textContent = ""; el.fxl.textContent = ""; el.fxo.textContent = ""; flies = 0;
  for (const n of [el.fxc, el.lash, el.fxl, el.fxo, el.pops]) (on ? el.fxbox : el.field).appendChild(n);
  fxm = null; wasOver = false;
  if (on) fitBox(); else resize();
}
const chatFrames = () => [...document.querySelectorAll("#chatBox iframe")].map((n) => n.getBoundingClientRect()).filter((c) => c.width > 0 && c.height > 0);
function fitBox() {                                          // рамка эффектов: поля вокруг трупера, подрезанные там, где они накрыли бы чат Twitch
  if (!away) return;
  const f = el.float.getBoundingClientRect(), m = { l: FXM.l, t: FXM.t, r: FXM.r, b: FXM.b };
  for (const c of chatFrames()) {
    if (c.right <= f.left - m.l || c.left >= f.right + m.r || c.bottom <= f.top - m.t || c.top >= f.bottom + m.b) continue;   // чат рамку не задевает
    if (c.left >= f.right) m.r = Math.max(0, Math.floor(c.left - f.right) - 4);
    else if (c.right <= f.left) m.l = Math.max(0, Math.floor(f.left - c.right) - 4);
    else if (c.top >= f.bottom) m.b = Math.max(0, Math.floor(c.top - f.bottom) - 4);
    else if (c.bottom <= f.top) m.t = Math.max(0, Math.floor(f.top - c.bottom) - 4);
    // иначе на чате стоит сам трупер: подрезать нечего, об этом скажет подсказка
  }
  if (!fxm || m.l !== fxm.l || m.t !== fxm.t || m.r !== fxm.r || m.b !== fxm.b) {
    if (fxm) shiftFx(m.l - fxm.l, m.t - fxm.t);              // угол рамки сдвинулся — всё уже нарисованное остаётся на своём месте экрана
    fxm = m;
    const st = el.fxbox.style;
    st.left = -m.l + "px"; st.top = -m.t + "px"; st.right = -m.r + "px"; st.bottom = -m.b + "px";
    resize();
  } else if (el.fxbox.clientWidth !== W || el.fxbox.clientHeight !== H) resize();   // трупер сменился на босса и обратно — рамка другого размера
}
function shiftFx(dx, dy) {
  if (!dx && !dy) return;
  for (const q of parts) { q.x += dx; q.y += dy; }
  for (const r of rings) { r.x += dx; r.y += dy; }
  for (const o of orbs) { o.x += dx; o.y += dy; }
  for (const box of [el.pops, el.fxl, el.fxo]) {
    for (const n of box.children) { n.style.left = (parseFloat(n.style.left) || 0) + dx + "px"; n.style.top = (parseFloat(n.style.top) || 0) + dy + "px"; }
  }
}
function overChat() {                                        // стоит ли вынесенный трупер на чате Twitch; запас — на его тени: тень тоже считается закрытием
  if (!away) return false;
  const f = el.float.getBoundingClientRect();
  return chatFrames().some((c) => c.left < f.right + 30 && c.right > f.left - 30 && c.top < f.bottom + 30 && c.bottom > f.top - 30);
}
function stepAway(now) {                                     // четыре раза в секунду: страницу могли прокрутить, вкладку чата — открыть
  if (!away || now < fitT) return;
  fitT = now + 250;
  fitBox();
  if (dragging) return;
  const over = overChat();
  if (over && !wasOver && notice) notice("Трупер закрывает чат Twitch. Пока чат чем-то закрыт, Twitch не даёт писать в него владельцу канала и модераторам — отодвинь трупера");
  wasOver = over;
}
export function onNotice(fn) { notice = fn; }                // ui.js: чем показать подсказку

// ---------- стрим фоном: всё, что закрывало картинку постоянно, переезжает в полосу под ней ----------
// Счёт душ, комбо, цифры урона и Душка в обычном виде стоят на поле. Когда фоном идёт стрим, на картинке остаётся только
// сам бой: трупер с полоской здоровья и то, что нужно бить. Зовёт js/stream.js через UI при каждом появлении и уходе картинки.
export function setDock(on) {
  wantDock = !!on;
  if (!el.field || wantDock === docked) return;
  docked = wantDock;
  for (const n of [el.dushka, el.bankBox, el.combo, el.stats]) {
    if (docked) el.dock.insertBefore(n, el.twctl); else el.field.insertBefore(n, el.cursor);
  }
  el.dock.hidden = !docked;
  document.body.classList.toggle("twon", docked);
  resize();
}
function bankSpot() {                                        // куда летят души: банк на поле или в полосе под картинкой
  const b = el.bankBox.getBoundingClientRect(), f = org();
  if (!docked) return { x: b.left - f.left + 34, y: b.top - f.top + 40, px: b.right - f.left + 10, py: b.top - f.top + 30 };
  const x = b.left - f.left + 18, y = b.top - f.top + b.height / 2;
  // полоса лежит под полем: души уходят за нижний край картинки, а у вынесенного трупера — за край его рамки
  return { x, y: away ? y : Math.min(y, H + 34), px: Math.min(Math.max(12, b.left - f.left), W - 170), py: H - 46 };
}
function placeFoe(x, y) {                                    // поставить вынесенного трупера: левый верхний угол, в пределах окна
  const r = el.float.getBoundingClientRect();
  x = Math.max(6, Math.min(window.innerWidth - r.width - 6, x));
  y = Math.max(6, Math.min(window.innerHeight - r.height - 6, y));
  el.float.style.left = Math.round(x) + "px"; el.float.style.top = Math.round(y) + "px";
  fitBox();
}
function detach(x, y) {
  if (!el.float) {
    el.float = document.createElement("div"); el.float.className = "foe-float"; el.float.id = "foeFloat";
    document.body.appendChild(el.float);
    el.float.addEventListener("pointerdown", (e) => { if (strike) strike(e); });
    el.float.addEventListener("contextmenu", (e) => e.preventDefault());
    el.fxbox = document.createElement("div"); el.fxbox.className = "foe-fx"; el.fxbox.id = "foeFx";
    el.float.appendChild(el.fxbox);
  }
  el.float.hidden = false;
  el.float.appendChild(el.plate); el.float.appendChild(el.enemy); el.float.appendChild(el.bossRing);
  el.foeHome.hidden = false;
  el.foeGrip.title = "Перетащи трупера куда удобно";
  C.achMark(S, "away");
  setAway(true);
  placeFoe(x, y);
}
function attach() {                                          // вернуть на линию
  if (!away) return;
  el.field.appendChild(el.enemy); el.field.appendChild(el.plate); el.field.appendChild(el.bossRing);
  el.float.hidden = true;
  el.foeHome.hidden = true;
  el.foeGrip.title = "Утащи трупера в любое место страницы — и бей его там";
  setAway(false);
}
function savePos() {                                         // место запоминается долями окна — вместе с настройками
  if (!away) { delete S.set.foe; return; }
  const r = el.float.getBoundingClientRect();
  S.set.foe = { x: +(r.left / window.innerWidth).toFixed(4), y: +(r.top / window.innerHeight).toFixed(4) };
}
function syncFoe() {                                         // при запуске, смене игры и размера окна
  const p = S.set.foe;
  if (p && typeof p.x === "number" && typeof p.y === "number") { if (!away) detach(0, 0); placeFoe(p.x * window.innerWidth, p.y * window.innerHeight); }
  else if (away) attach();
}
function bindFoe() {
  let drag = null;
  const grab = () => { try { el.foeGrip.setPointerCapture(drag.id); } catch (err) { /* указатель уже отпущен */ } };
  const move = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.pointerType === "mouse" && e.buttons === 0) { end(); return; }   // кнопку отпустили там, где страница этого не увидела
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.moved = true;
      if (!away) { detach(e.clientX - drag.dx, e.clientY - drag.dy); grab(); }   // табличка переехала в другой блок — захват указателя берём заново
      document.body.classList.add("foedrag");
    }
    placeFoe(e.clientX - drag.dx, e.clientY - drag.dy);
  };
  const end = (e) => {
    if (!drag || (e && e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    const moved = drag.moved;
    try { el.foeGrip.releasePointerCapture(drag.id); } catch (err) { /* захвата уже нет */ }
    drag = null; dragging = false;
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); window.removeEventListener("blur", end);
    document.body.classList.remove("foedrag", "foegrab");
    if (moved) { savePos(); fitT = 0; }
  };
  el.foeGrip.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    e.preventDefault(); e.stopPropagation();
    if (drag) end();
    const r = (away ? el.float : el.plate).getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
    dragging = true;
    grab();
    document.body.classList.add("foegrab");                  // пока тащим, окна Twitch (чат, плеер) мышь не перехватывают
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end); window.addEventListener("blur", end);
  });
  el.foeHome.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
  el.foeHome.addEventListener("click", (e) => { e.stopPropagation(); attach(); savePos(); });
  for (const b of [el.foeGrip, el.foeHome]) {
    b.addEventListener("pointerenter", () => el.field.classList.add("nocur"));
    b.addEventListener("pointerleave", () => el.field.classList.remove("nocur"));
  }
  window.addEventListener("resize", () => { if (away) syncFoe(); });
}
export function onFoeStrike(fn) { strike = fn; }             // main.js: что делать по клику в вынесенного трупера

// ---------- мелкие эффекты ----------
function spark(x, y, n, color, speed, size) {
  const cap = calm ? 60 : small ? 120 : 300;
  for (let i = 0; i < n && parts.length < cap; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(0.4, 1) * (speed || 260);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: rnd(0.25, 0.5), max: 0.5, size: rnd(2, size || 5), color, sq: Math.random() < 0.5 });
  }
}
function ring(x, y, r1, color, dur) { if (rings.length < 6) rings.push({ x, y, r: 8, r1, life: dur || 0.25, max: dur || 0.25, color }); }
function shake(px, ms) {
  if (calm) return;
  el.field.style.setProperty("--amp", px + "px"); el.field.style.setProperty("--shk", ms + "ms");
  restart(el.field, "shake");
}
function pop(text, x, y, cls) {
  if (el.pops.childElementCount > 24) el.pops.firstElementChild.remove();
  const p = document.createElement("div");
  p.className = "pop anim " + (cls || "");
  if (cls && cls.indexOf("soul") >= 0) { const i = new Image(); i.src = art("cur-farm"); p.appendChild(i); p.appendChild(document.createTextNode(text)); }
  else p.textContent = text;
  p.style.left = x + "px"; p.style.top = y + "px"; p.style.setProperty("--dx", rnd(-26, 26).toFixed(0) + "px");
  el.pops.appendChild(p);
}
export function banner(title, sub, cls, dur) {
  el.banner.className = "banner " + (cls || "");
  el.banner.innerHTML = "<b></b>" + (sub ? "<small></small>" : "");
  el.banner.firstChild.textContent = title;
  if (sub) el.banner.lastChild.textContent = sub;
  el.banner.style.setProperty("--dur", (dur || 1400) + "ms");
  restart(el.banner, "show");
}
function lash(x, y) {
  const rx = away ? Math.min(FW * 0.34, FXM.l - 30) : FW * 0.34, ry = away ? Math.min(FH * 0.34, 130) : FH * 0.34;   // у вынесенного трупера хлыст короче: он обязан уместиться в рамку
  const ox = Math.max(0, x - rx), oy = Math.min(H, y + ry), cx = x - rx * (0.2 / 0.34), cy = y - ry * (0.42 / 0.34);
  const d = "M" + (ox / W * 100).toFixed(1) + " " + (oy / H * 100).toFixed(1) + " Q" + (cx / W * 100).toFixed(1) + " " + (cy / H * 100).toFixed(1) + " " + (x / W * 100).toFixed(1) + " " + (y / H * 100).toFixed(1);
  el.lashGlow.setAttribute("d", d); el.lashLine.setAttribute("d", d);
  restart(el.lash, "go");
}
function bumpBank() { restart(el.bankBox, "bump"); }
function flyToBank(x, y, n) {
  const spot = bankSpot(), tx = spot.x, ty = spot.y;
  for (let i = 0; i < n && flies < 24; i++) {
    const s = new Image(); s.src = art("cur-farm"); s.className = "fly";
    s.style.left = (x - 10) + "px"; s.style.top = (y - 10) + "px";
    el.fxo.appendChild(s); flies++;
    const dx = tx - x, dy = ty - y, last = i === n - 1;
    const a = s.animate([
      { transform: "translate(0,0) scale(.6)", opacity: 0 },
      { transform: "translate(" + (dx * 0.3 + rnd(-40, 40)) + "px," + (dy * 0.2 - rnd(30, 70)) + "px) scale(1.15)", opacity: 1, offset: 0.35 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(.5)", opacity: 0.3 },
    ], { duration: 360 + i * 60, easing: "cubic-bezier(.5,0,.6,1)" });
    a.onfinish = () => { s.remove(); flies--; if (last) bumpBank(); };
  }
}

// ---------- цель ----------
function setEnemy() {
  const boss = C.isBoss(S.z);
  const bg = districtArt(S.z, tall);
  if (bg !== bgNow) { bgNow = bg; el.field.style.backgroundImage = "url(" + bg + ")"; }
  const altar = S.altar > 0, elite = C.isElite(S);
  const bossArt = boss && has("boss-" + bossOf(S.z).id) ? art("boss-" + bossOf(S.z).id) : null;
  const sprite = altar ? art("ev-altar") : bossArt || (elite ? art(S.set.faction === "sapphire" ? "elite-amber" : "elite-sapphire") : trooper());
  el.enemy.classList.toggle("elite", elite && !altar); el.enemy.classList.toggle("altar", altar);
  el.plate.classList.toggle("gold", altar || elite);
  if (sprite !== spriteNow) { spriteNow = sprite; el.enemy.querySelector("img").src = sprite; }
  el.enemy.classList.toggle("boss", boss);
  el.plate.classList.toggle("boss", boss);
  el.crown.hidden = !boss || !!bossArt;
  el.bossRing.hidden = !(boss || altar); el.bossRing.classList.toggle("gold", altar);
  el.field.classList.toggle("dark", boss);
  el.q1.hidden = el.q2.hidden = boss || altar;
  const enemyFac = S.set.faction === "sapphire" ? "Янтаря" : "Сапфира";
  el.enemyName.textContent = altar ? "Жертвенник грешника" : boss ? bossOf(S.z).name : elite ? "Элитный трупер" : "Трупер " + enemyFac;
  if (away) syncFoe();
}

// ---------- сферы душ ----------
function addOrb(x, y, loot) {
  if (orbs.length >= 8) { const o = orbs[orbs.length - 1]; o.loot = lsum(o.loot, loot); o.el.classList.add("big"); o.life = Math.max(o.life, 0.8); return; }
  const n = new Image(); n.src = art("orb"); n.className = "orb";
  const o = { x: x + rnd(-40, 40), y: y + rnd(-20, 20), life: CFG.orbLife, loot, el: n };
  if (S.d.pet && Math.random() < S.d.pet) o.pet = 0.35;      // эту сферу подберёт Душка
  n.style.left = o.x + "px"; n.style.top = o.y + "px";
  el.fxo.appendChild(n); orbs.push(o);
}
function stepOrbs(dt) {
  const f = away && orbs.length ? org() : null;
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.life -= dt; o.y -= 18 * dt; o.el.style.left = o.x + "px"; o.el.style.top = o.y + "px";
    if (o.pet !== undefined) o.pet -= dt;
    const near = (f ? Math.hypot(pv.x - f.left - o.x, pv.y - f.top - o.y) < 56 : ptr.inside && Math.hypot(ptr.x - o.x, ptr.y - o.y) < 56) || o.pet <= 0;
    if (near) {
      C.orbBonus(S, o.loot);
      pop("+" + txt(o.loot + L10(CFG.orbBonus)), o.x, o.y - 26, "soul");
      flyToBank(o.x, o.y, 2); sfx.orb(orbN++); spark(o.x, o.y, 6, "#ffe58f", 160, 4);
      o.el.remove(); orbs.splice(i, 1);
    } else if (o.life <= 0) {
      const n = o.el; n.classList.add("out"); setTimeout(() => n.remove(), 280);
      orbs.splice(i, 1);
    }
  }
}

// ---------- картинки-вспышки: крит, трещина, ударная волна, облачко ----------
function fximg(name, x, y, size, cls) {
  if (calm && name !== "fx-puff") return;
  if (el.fxl.childElementCount > 10) el.fxl.firstElementChild.remove();
  const n = new Image(); n.src = art(name); n.className = "fxi " + (cls || "");
  n.style.left = x + "px"; n.style.top = y + "px"; n.style.width = size + "px"; n.style.marginLeft = -size / 2 + "px"; n.style.marginTop = -size / 2 + "px";
  n.addEventListener("animationend", () => n.remove());
  el.fxl.appendChild(n);
}
function center(node, fx, fy) {                              // середина элемента в координатах поля; спрятан — запасная точка
  const r = node.getBoundingClientRect(), f = org(), q = el.field.getBoundingClientRect();
  return r.width ? { x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2 } : { x: q.left - f.left + FW * fx, y: q.top - f.top + FH * fy };
}
// ---------- слабое место босса ----------
const weak = { next: 0, on: false };                        // мишень сидит на самом боссе и двигается вместе с ним
export function weakAt(cx, cy) {                             // попал ли клик в мишень
  if (!weak.on) return false;
  const r = el.weak.getBoundingClientRect();
  return r.width > 0 && Math.hypot(cx - r.left - r.width / 2, cy - r.top - r.height / 2) < Math.max(38, r.width * 0.55);
}
function stepWeak(now) {
  const on = !!S.un.weak && C.isBoss(S.z) && !(S.altar > 0);
  if (on !== weak.on) { weak.on = on; el.weak.hidden = !on; weak.next = 0; }
  if (!on || now < weak.next) return;
  weak.next = now + 3000;
  el.weak.style.left = rnd(26, 74) + "%"; el.weak.style.top = rnd(42, 70) + "%";   // ниже таблички с именем
  restart(el.weak, "in");
}
// ---------- ящик, статуя, урна: видны, пока есть в состоянии игры ----------
let statueShown = false;
function stepObjects(now) {
  if (el.crate.hidden !== !S.crate) { el.crate.hidden = !S.crate; if (S.crate) restart(el.crate, "in"); }
  const st = S.statueOn > 0;
  if (st !== statueShown) {
    statueShown = st; el.statue.hidden = !st;
    if (st) { el.statue.style.left = (small ? rnd(36, 40) : rnd(33, 38)) + "%"; restart(el.statue, "in"); }
  }
  if (st) el.statue.classList.toggle("hurry", S.statueOn < 4);
  const urn = S.urnOn > 0;
  if (el.urn.hidden !== !urn) el.urn.hidden = !urn;
  if (urn) {
    const k = 1 - S.urnOn / 20;
    el.urn.style.left = (-8 + 112 * k) + "%";
    el.urn.style.top = (40 + 7 * Math.sin(now / 420)) + "%";      // летит на высоте груди: не закрывает ни банк, ни табличку врага
  }
}

// ---------- события ядра ----------
export function onEvent(e) {
  const now = performance.now();
  switch (e.t) {
    case "hit": {
      lastHit = now;
      const b = enemyBox(), x = b.x + rnd(-0.2, 0.2) * b.w, y = b.y + rnd(-0.28, 0.12) * b.h;
      el.enemy.classList.remove("idle"); anim("sq");
      el.enemy.classList.add("hit"); setTimeout(() => el.enemy.classList.remove("hit"), 80);
      if (e.src !== "flurry" || Math.random() < 0.5) lash(x, y);
      spark(x, y, e.crit ? 14 : 5, "#fff6d8", e.crit ? 380 : 240);
      if (e.weak) { const c = center(el.weak, 0.62, 0.5); fximg("fx-crack", c.x, c.y, 130); pop(txt(e.dmg), c.x - 30, c.y - 60, "crit"); shake(4, 140); sfx.crit(); lastPop = now; }
      else if (e.crit) { fximg("fx-hit", x, y, 120); pop(txt(e.dmg), x - 30, y - 46, "crit"); shake(3, 120); sfx.crit(); lastPop = now; }
      else if (now - lastPop > 60) { pop(txt(e.dmg), x - 20, y - 30, ""); lastPop = now; }
      if (e.src !== "flurry" || Math.random() < 0.35) sfx.whip(Math.min(10, Math.floor(S.combo / 6)));
      break;
    }
    case "kill": {
      kills.push(now);
      if (kills.length > 40 && (kills.length & 7)) break;     // прорыв на десятки волн в секунду: рисуем каждое восьмое убийство
      const b = enemyBox(), fast = kills.length > 6;
      spark(b.x, b.y, fast ? 4 : 12, facColor(), 300, 7);
      if (!fast) {
        const tok = ++dieTok;
        anim("die"); sfx.kill(); fximg("fx-puff", b.x, b.y + b.h * 0.12, e.elite ? 230 : 150, "puff");
        setTimeout(() => { if (tok === dieTok && el.enemy.classList.contains("die")) anim("enter"); }, 170);
      }
      if (e.elite) { banner("Элита повержена", "+" + txt(e.loot) + " душ", "gold", 1100); spark(b.x, b.y, 30, "#ffe58f", 420, 7); mood("happy", 1500); }
      if (S.un.orbs && e.src !== "ult") addOrb(b.x, b.y - b.h * 0.1, e.loot);
      else flyToBank(b.x, b.y, fast ? 1 : 3);
      break;
    }
    case "wave": setEnemy(); break;
    case "boss_in": {
      setEnemy(); anim("bossin");
      banner(e.boss.name, "волна " + e.z + " · " + Math.round(S.d.bossTime) + " секунд", "boss", 1500);
      shake(7, 300); sfx.bossIn(); mood("scared", 2500);
      break;
    }
    case "boss_win": {
      const b = enemyBox();
      spark(b.x, b.y, 60, "#ffe58f", 520, 8); ring(b.x, b.y, Math.max(FW, FH) * 0.6, "rgba(255,229,143,.9)", 0.45);
      flyToBank(b.x, b.y, 10); shake(8, 300);
      if (!calm) restart(el.field, "flash");
      banner("Повержен!", "+" + txt(e.loot) + " душ", "gold", 1500);
      el.dushka.classList.remove("cheer"); void el.dushka.offsetWidth; el.dushka.classList.add("cheer"); mood("happy", 2500);
      sfx.bossWin(); setEnemy();
      break;
    }
    case "boss_fail": banner("Отступаем", "подкачаемся и вернёмся", "", 1400); sfx.bossFail(); setEnemy(); break;
    case "tier": {
      const b = enemyBox();
      ring(b.x, b.y + b.h * 0.4, FW * 0.5, "rgba(255,255,255,.85)", 0.25); shake(4, 150); fximg("fx-shock", b.x, b.y + b.h * 0.44, small ? 220 : 320, "shock");
      el.comboName.textContent = e.name; restart(el.combo, "stamp"); sfx.tier(e.i);
      break;
    }
    case "wisp": sfx.wisp(); break;
    case "wisp_take": {
      const wc = center(el.wisp, 0.4, 0.4), x = wc.x, y = wc.y;
      el.wisp.hidden = true;
      spark(x, y, 30, "#ffe58f", 420, 7); ring(x, y, 220, "rgba(255,229,143,.9)", 0.35);
      banner(e.title, e.text, "gold", 1700); sfx.wisp();
      if (e.id === "catch") { pop("+" + txt(e.loot), x - 40, y - 30, "soul big"); flyToBank(x, y, 8); }
      break;
    }
    case "gift": {
      const spot = bankSpot(), b = away ? enemyBox() : null;
      pop("+" + txt(e.loot), b ? b.x - 40 : spot.px, b ? Math.max(8, b.y - b.h * 0.5) : spot.py, "soul big"); bumpBank(); sfx.wisp();
      break;
    }
    case "skill": {
      if (e.id === "ult") { banner("Ульта Лэша", "вся волна — оземь", "gold", 1200); shake(9, 320); const b = enemyBox(); ring(b.x, b.y + b.h * 0.4, FW * 0.7, "rgba(255,197,61,.9)", 0.4); fximg("fx-shock", b.x, b.y + b.h * 0.44, small ? 300 : 460, "shock"); }
      sfx.skill();
      break;
    }
    case "unlock": says.push(e); break;
    case "draft": sfx.unlock(); break;
    case "crate_in": sfx.orb(0); break;
    case "crate": {
      const c = center(el.crate, 0.32, 0.72);
      spark(c.x, c.y, 18, "#c98a4a", 360, 8); fximg("fx-puff", c.x, c.y, 130, "puff");
      pop("+" + txt(e.loot), c.x - 30, c.y - 54, "soul big"); flyToBank(c.x, c.y, 5); sfx.buy();
      break;
    }
    case "statue": sfx.wisp(); break;
    case "statue_take": {
      const c = center(el.statue, 0.44, 0.7);
      spark(c.x, c.y, 30, "#ffe58f", 420, 7); ring(c.x, c.y, 200, "rgba(255,229,143,.9)", 0.35);
      banner("Золотая статуя", e.text + " до возрождения", "gold", 1800); sfx.ms(); mood("happy", 2000);
      break;
    }
    case "urn": sfx.wisp(); break;
    case "urn_hit": {
      const c = center(el.urn, 0.5, 0.2);
      spark(c.x, c.y, 5, "#7fe0bf", 240, 5); pop("+" + e.n * 2 + " %", c.x - 14, c.y - 44, "small"); sfx.orb(e.n);
      restart(el.urn, "hit");
      break;
    }
    case "urn_done": if (e.hits > 0) { banner("Урна доставлена", "+" + txt(e.loot) + " душ", "gold", 1700); bumpBank(); sfx.bossWin(); mood("happy", 2000); } break;
    case "altar_in": banner("Жертвенник грешника", "15 секунд: каждый удар — души", "gold", 1600); sfx.bossIn(); break;
    case "altar_hit": {
      lastHit = now;
      const b = enemyBox(), x = b.x + rnd(-0.2, 0.2) * b.w, y = b.y + rnd(-0.25, 0.1) * b.h;
      el.enemy.classList.remove("idle"); anim("sq"); lash(x, y); spark(x, y, 6, "#ffe58f", 260, 5); sfx.whip(Math.min(10, Math.floor(S.combo / 6)));
      if (e.loot > -Infinity && now - lastPop > 110) { pop("+" + txt(e.loot), x - 20, y - 36, "soul"); flyToBank(x, y, 1); lastPop = now; }
      break;
    }
    case "altar_out": {
      setEnemy();
      if (e.loot > -Infinity) { banner("Жертва принята", "+" + txt(e.loot) + " душ", "gold", 1500); bumpBank(); sfx.bossWin(); }
      break;
    }
    case "feat": {
      const leg = e.rar === "l";
      banner(e.name, leg ? "легендарный предмет открыт" : "тайна раскрыта", "gold", 2200); sfx.rank(); mood("happy", 3000);
      says.push({ title: leg ? "легендарный предмет" : "тайный предмет", say: "«" + e.name + "» теперь может выпасть после босса. Загляни в коллекцию." });
      break;
    }
    case "star": sfx.ms(); break;
    case "item": sfx.ms(); mood("happy", 1500); break;
    case "barrier": banner("Divine Barrier", "ещё одна попытка", "gold", 1300); sfx.wisp(); break;
    case "rebirth": setEnemy(); for (const o of orbs) o.el.remove(); orbs = []; break;
    case "eclipse": {
      setEnemy(); for (const o of orbs) o.el.remove(); orbs = [];
      banner("Затмение", "+" + e.shards + " осколков" + (e.chaos ? " · Скупщик теней: шаг " + e.chaos : ""), "gold", 2600); mood("happy", 3000);
      break;
    }
    case "patron": sfx.ms(); break;
  }
}

// ---------- Душка говорит ----------
function stepSay(now) {
  if (now < sayUntil || !says.length) { if (now >= sayUntil && !el.say.hidden) { el.say.hidden = true; el.field.classList.remove("saying"); } return; }
  const e = says.shift();
  el.say.innerHTML = "<b></b>"; el.say.firstChild.textContent = "Открыто: " + e.title;
  el.say.appendChild(document.createTextNode(e.say));
  el.say.hidden = false; restart(el.say, "say");
  el.field.style.setProperty("--sayh", Math.round(Math.min(el.say.offsetHeight + 40, FH * 0.4)) + "px"); el.field.classList.add("saying");   // ящик и статуя встают над репликой
  el.dushka.classList.remove("cheer"); void el.dushka.offsetWidth; el.dushka.classList.add("cheer");
  sayUntil = now + 6500; sfx.unlock(); mood("happy", 2500);
}
export function say(title, text, ms) { says.push({ title, say: text }); if (ms) sayUntil = Math.min(sayUntil, performance.now()); }

// ---------- кадр ----------
let zShown = -1;
export function frame(dt) {
  const now = performance.now();
  const zk = S.z + (S.altar > 0 ? "a" : "") + (C.isElite(S) ? "e" : "");
  if (zk !== zShown) { zShown = zk; setEnemy(); }             // вид цели не зависит от того, дошло ли событие
  stepWeak(now); stepObjects(now);
  if (el.hint.hidden !== (S.stats.clicks > 0)) el.hint.hidden = S.stats.clicks > 0;
  while (kills.length && now - kills[0] > 1000) kills.shift();
  el.field.classList.toggle("rush", kills.length >= 8);
  if (now - lastHit > 600) el.enemy.classList.add("idle");
  if (moodUntil && now > moodUntil) mood("idle");
  if (!moodUntil) mood(now - Math.max(lastHit, lastMove) > 60000 ? "sleepy" : "idle");

  // здоровье
  const p = S.altar > 0 ? 100 : Math.max(0, Math.min(1, S.hp)) * 100;
  el.hp.style.setProperty("--p", p.toFixed(1) + "%"); el.hp.style.setProperty("--g", p.toFixed(1) + "%");
  if (now - hpTextT > 120) {
    hpTextT = now;
    const full = C.targetHp(S);
    el.hpText.textContent = S.altar > 0 ? "бей, пока стоит!" : txt(full + L10(Math.max(1e-9, S.hp))) + " / " + txt(full);
    el.enemyCount.textContent = S.altar > 0 ? "" : C.isBoss(S.z) ? "босс" : C.isElite(S) ? "элита" : (S.kills + 1) + " / " + CFG.mobs;
  }
  // босс
  if (S.altar > 0) {
    el.bossArc.setAttribute("stroke-dashoffset", (194.8 * (1 - S.altar / 15)).toFixed(1));
    el.bossT.textContent = Math.ceil(S.altar); el.bossRing.classList.toggle("hot", S.altar <= 5);
  } else if (C.isBoss(S.z)) {
    const k = Math.max(0, S.bossT / S.d.bossTime);
    el.bossArc.setAttribute("stroke-dashoffset", (194.8 * (1 - k)).toFixed(1));
    el.bossT.textContent = Math.ceil(Math.max(0, S.bossT));
    el.bossRing.classList.toggle("hot", S.bossT <= 10);
  }
  // комбо
  const cn = Math.floor(S.combo);
  if (S.un.combo && cn >= 5) {
    if (el.combo.hidden) el.combo.hidden = false;
    if (cn !== comboShown) {
      const t = C.comboTier(S);
      if (cn > comboShown) restart(el.combo, "pulse");
      comboShown = cn; el.comboN.textContent = cn;
      el.combo.className = "combo " + (t >= 0 ? "t" + t : "") + (el.combo.classList.contains("pulse") ? " pulse" : "");
      el.comboName.textContent = t >= 0 ? CFG.combo[t][2] : "комбо";
    }
  } else if (!el.combo.hidden) { el.combo.hidden = true; comboShown = -1; }

  // огонёк виден, пока он есть в состоянии игры
  if (S.wispOn > 0 && el.wisp.hidden) {
    el.wisp.style.left = rnd(26, 46) + "%"; el.wisp.style.top = rnd(26, 52) + "%";
    el.wisp.hidden = false; restart(el.wisp, "in");
  } else if (S.wispOn <= 0 && !el.wisp.hidden) el.wisp.hidden = true;

  stepOrbs(dt);
  stepSay(now);
  stepAway(now);

  // осколки и кольца
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.life -= dt;
    if (q.life <= 0) { parts.splice(i, 1); continue; }
    q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    ctx.globalAlpha = Math.min(1, q.life / q.max * 1.6);
    ctx.fillStyle = q.color;
    if (q.sq) ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    else { ctx.beginPath(); ctx.arc(q.x, q.y, q.size / 2, 0, 6.283); ctx.fill(); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    if (r.life <= 0) { rings.splice(i, 1); continue; }
    const k = 1 - r.life / r.max;
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, 8 + (r.r1 - 8) * k, (8 + (r.r1 - 8) * k) * 0.45, 0, 0, 6.283); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- сцена возрождения: мир выгорает, число пепла, рассвет ----------
export function rebirthScene(doRebirth, ashText, label, cls) {   // та же сцена у Затмения: label «осколков», cls «ecl»
  const o = document.createElement("div");
  o.className = "ashfx " + (cls || ""); o.innerHTML = '<div class="n"></div><div class="l"></div>';
  o.firstChild.textContent = "+" + ashText; o.lastChild.textContent = label || "пепла";
  document.body.appendChild(o);
  sfx.rebirth();
  const t0 = performance.now(), burn = calm ? 300 : 900, hold = 900, dawn = calm ? 300 : 600;
  let done = false;
  (function step() {
    const t = performance.now() - t0;
    if (t < burn) o.style.setProperty("--r", (110 * (1 - t / burn)).toFixed(1) + "%");
    else if (t < burn + hold) {
      o.style.setProperty("--r", "-20%");
      if (!done) { done = true; doRebirth(); o.classList.add("num"); }
    } else if (t < burn + hold + dawn) {
      if (o.classList.contains("num")) { o.classList.remove("num"); sfx.dawn(); }
      o.style.setProperty("--r", (110 * (t - burn - hold) / dawn).toFixed(1) + "%");
    } else { o.remove(); return; }
    requestAnimationFrame(step);
  })();
}
export const wispEl = () => el.wisp;
export const fieldEl = () => el.field;
