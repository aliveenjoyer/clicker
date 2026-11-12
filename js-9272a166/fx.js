// Линия: всё, что двигается. Удар, числа, осколки, сферы душ, босс, огонёк, титры, сцена возрождения.
// Тайминги и ступени силы отклика — PLAN.md § 16. Правил игры здесь нет: только картинка и звук по событиям ядра.
import { CFG } from "./data.js";
import * as C from "./core.js";
import { txt, lsum, L10 } from "./num.js";
import { sfx } from "./audio.js";
import { art, has, districtArt } from "./art.js";
import { bossOf } from "./data.js";

const $ = (id) => document.getElementById(id);
let S = null, el = {}, W = 1, H = 1, ctx = null, dpr = 1;
let parts = [], rings = [], orbs = [], flies = 0;
const ptr = { x: -999, y: -999, inside: false };
let lastMove = 0;
let lastPop = 0, lastHit = 0, kills = [], dieTok = 0, orbN = 0, says = [], sayUntil = 0, hpTextT = 0, comboShown = -1;
let calm = false, small = false, tall = false;

export function mount(state) {
  S = state;
  for (const id of ["field", "fxc", "enemy", "q1", "q2", "plate", "hp", "hpText", "enemyName", "enemyCount", "facDot", "crown", "lash", "lashGlow",
    "lashLine", "bossRing", "bossArc", "bossT", "combo", "comboN", "comboName", "wisp", "banner", "hint", "pops", "dushka", "say", "cursor",
    "bankBox", "rushLines", "pet", "crate", "statue", "urn", "weak", "fxl"]) el[id] = $(id);
  ctx = el.fxc.getContext("2d");
  el.weak.style.backgroundImage = "url(" + art("fx-weak") + ")";
  for (const u of [el.q1, el.q2]) u.querySelector("img").src = trooper();
  el.facDot.className = "fac " + (S.set.faction === "sapphire" ? "fac-amber" : "fac-sapphire");
  resize();
  window.addEventListener("resize", resize);
  el.field.addEventListener("pointermove", onPtr);
  el.field.addEventListener("pointerdown", onPtr);
  el.field.addEventListener("pointerleave", () => { ptr.inside = false; });
  el.pops.addEventListener("animationend", (e) => { if (e.target.classList.contains("pop")) e.target.remove(); });
  setEnemy();
}
export function setState(state) { S = state; setEnemy(); }
export function setCalm(v) { calm = !!v; document.body.classList.toggle("calm", calm); }

function resize() {
  const r = el.field.getBoundingClientRect();
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  el.fxc.width = Math.round(W * dpr); el.fxc.height = Math.round(H * dpr);
  small = W < 560;
  const t = W / H < 1.16;                                    // поле почти квадратное или выше — вертикальный фон
  if (t !== tall) { tall = t; el.field.classList.toggle("tallbg", tall); if (bgNow) setEnemy(); }
}
function onPtr(e) {
  const r = el.field.getBoundingClientRect();
  ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.inside = true; lastMove = performance.now();
  el.cursor.style.transform = "translate(" + (ptr.x - 6) + "px," + (ptr.y - 6) + "px)";
}
function enemyBox() {
  const r = el.enemy.getBoundingClientRect(), f = el.field.getBoundingClientRect();
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
  const ox = Math.max(0, x - W * 0.34), oy = Math.min(H, y + H * 0.34), cx = x - W * 0.2, cy = y - H * 0.42;
  const d = "M" + (ox / W * 100).toFixed(1) + " " + (oy / H * 100).toFixed(1) + " Q" + (cx / W * 100).toFixed(1) + " " + (cy / H * 100).toFixed(1) + " " + (x / W * 100).toFixed(1) + " " + (y / H * 100).toFixed(1);
  el.lashGlow.setAttribute("d", d); el.lashLine.setAttribute("d", d);
  restart(el.lash, "go");
}
function bumpBank() { restart(el.bankBox, "bump"); }
function flyToBank(x, y, n) {
  const b = el.bankBox.getBoundingClientRect(), f = el.field.getBoundingClientRect();
  const tx = b.left - f.left + 34, ty = b.top - f.top + 40;
  for (let i = 0; i < n && flies < 24; i++) {
    const s = new Image(); s.src = art("cur-farm"); s.className = "fly";
    s.style.left = (x - 10) + "px"; s.style.top = (y - 10) + "px";
    el.field.appendChild(s); flies++;
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
}

// ---------- сферы душ ----------
function addOrb(x, y, loot) {
  if (orbs.length >= 8) { const o = orbs[orbs.length - 1]; o.loot = lsum(o.loot, loot); o.el.classList.add("big"); o.life = Math.max(o.life, 0.8); return; }
  const n = new Image(); n.src = art("orb"); n.className = "orb";
  const o = { x: x + rnd(-40, 40), y: y + rnd(-20, 20), life: CFG.orbLife, loot, el: n };
  if (S.d.pet && Math.random() < S.d.pet) o.pet = 0.35;      // эту сферу подберёт Душка
  n.style.left = o.x + "px"; n.style.top = o.y + "px";
  el.field.appendChild(n); orbs.push(o);
}
function stepOrbs(dt) {
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.life -= dt; o.y -= 18 * dt; o.el.style.top = o.y + "px";
    if (o.pet !== undefined) o.pet -= dt;
    const near = (ptr.inside && Math.hypot(ptr.x - o.x, ptr.y - o.y) < 56) || o.pet <= 0;
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
  const r = node.getBoundingClientRect(), f = el.field.getBoundingClientRect();
  return r.width ? { x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2 } : { x: W * fx, y: H * fy };
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
      spark(b.x, b.y, 60, "#ffe58f", 520, 8); ring(b.x, b.y, Math.max(W, H) * 0.6, "rgba(255,229,143,.9)", 0.45);
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
      ring(b.x, b.y + b.h * 0.4, W * 0.5, "rgba(255,255,255,.85)", 0.25); shake(4, 150); fximg("fx-shock", b.x, b.y + b.h * 0.44, small ? 220 : 320, "shock");
      el.comboName.textContent = e.name; restart(el.combo, "stamp"); sfx.tier(e.i);
      break;
    }
    case "wisp": sfx.wisp(); break;
    case "wisp_take": {
      const r = el.wisp.getBoundingClientRect(), f = el.field.getBoundingClientRect();
      const x = r.width ? r.left - f.left + r.width / 2 : W * 0.4, y = r.width ? r.top - f.top + r.height / 2 : H * 0.4;
      el.wisp.hidden = true;
      spark(x, y, 30, "#ffe58f", 420, 7); ring(x, y, 220, "rgba(255,229,143,.9)", 0.35);
      banner(e.title, e.text, "gold", 1700); sfx.wisp();
      if (e.id === "catch") { pop("+" + txt(e.loot), x - 40, y - 30, "soul big"); flyToBank(x, y, 8); }
      break;
    }
    case "gift": {
      const b = el.bankBox.getBoundingClientRect(), f = el.field.getBoundingClientRect();
      pop("+" + txt(e.loot), b.right - f.left + 10, b.top - f.top + 30, "soul big"); bumpBank(); sfx.wisp();
      break;
    }
    case "skill": {
      if (e.id === "ult") { banner("Ульта Лэша", "вся волна — оземь", "gold", 1200); shake(9, 320); const b = enemyBox(); ring(b.x, b.y + b.h * 0.4, W * 0.7, "rgba(255,197,61,.9)", 0.4); fximg("fx-shock", b.x, b.y + b.h * 0.44, small ? 300 : 460, "shock"); }
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
  }
}

// ---------- Душка говорит ----------
function stepSay(now) {
  if (now < sayUntil || !says.length) { if (now >= sayUntil && !el.say.hidden) { el.say.hidden = true; el.field.classList.remove("saying"); } return; }
  const e = says.shift();
  el.say.innerHTML = "<b></b>"; el.say.firstChild.textContent = "Открыто: " + e.title;
  el.say.appendChild(document.createTextNode(e.say));
  el.say.hidden = false; restart(el.say, "say");
  el.field.style.setProperty("--sayh", Math.round(Math.min(el.say.offsetHeight + 40, H * 0.4)) + "px"); el.field.classList.add("saying");   // ящик и статуя встают над репликой
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
export function rebirthScene(doRebirth, ashText) {
  const o = document.createElement("div");
  o.className = "ashfx"; o.innerHTML = '<div class="n"></div><div class="l">пепла</div>';
  o.firstChild.textContent = "+" + ashText;
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
