// Постановка разлома — то, что видно на сетке отряда, когда комбо дошло до потолка уровня (15.11, его слова: «момент
// появления разлома должен быть более заметен… пауза буквально на 5 секунд… чтобы был качественный переход во время
// комбо, чтобы выглядело дорого»). Три действия:
//   1. Разлом открывается (передышка, CFG.figRest): удар, по сетке бежит трещина — по тем самым плиткам, по которым её
//      потом вести, — в трещине видно место, куда она ведёт; поверх — надпись. Комбо в это время стоит (js/core.js).
//   2. Разлом открыт: трещина живёт, взятые отметки её разжигают; не взят — затягивается.
//   3. Провал (CFG.figLand): трещина раскрывается на всю сетку, место «наезжает» — титул уровня; потом картинка
//      расходится кругом, под ней сетка уже в цветах уровня.
// Здесь только вид. Холст (.rt-stage) лежит под кружками рисунка, карточка с надписями (.rt-card) — над ними. Что и когда
// показывать, решает js/ui.js (rite*), правила — js/core.js, стили — css/deep.css. Всё живёт внутри сетки героев: на
// картинку стрима и окно чата Twitch ничего не выходит. Спокойный режим и «меньше движения» — без холста: одни надписи.
const TAU = Math.PI * 2;
// цвет уровня, его светлый оттенок, имя картинки и какая её часть по горизонтали стоит в середине сетки
const LV = [null,
  { c: [53, 224, 255], hi: [200, 246, 255], id: "sub", fx: 0.66 },
  { c: [255, 59, 107], hi: [255, 208, 220], id: "inv", fx: 0.56 },
  { c: [183, 155, 255], hi: [241, 236, 255], id: "void", fx: 0.72 }];
const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease3 = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);    // быстро в начале, мягко в конце
const easeIn = (t) => Math.pow(clamp(t, 0, 1), 2.4);         // разгон
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

let R = null;                                                // идущая постановка
const imgs = {}, sprites = {};

function image(to) {                                         // картинка места — та же, что станет фоном поля боя
  if (!imgs[to]) { const im = new Image(); im.decoding = "async"; im.src = "art/deep/bg-" + LV[to].id + ".webp"; imgs[to] = im; }
  return imgs[to];
}
export function warm(to) { if (LV[to]) image(to); }          // заранее, когда комбо подходит к разлому
function sprite(to) {                                        // светящаяся точка цвета уровня: искры и огни
  if (sprites[to]) return sprites[to];
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32), lv = LV[to];
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.2, rgba(lv.hi, 0.9)); g.addColorStop(0.5, rgba(lv.c, 0.38)); g.addColorStop(1, rgba(lv.c, 0));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (sprites[to] = c);
}

// ---------- холст и геометрия ----------
function fit() {                                             // холст — по размеру сетки (на телефоне сетка выше экрана)
  const l = R.list, lr = l.getBoundingClientRect();
  const W = Math.max(2, Math.round(lr.width)), H = Math.max(2, Math.round(l.classList.contains("hg-flow") ? Math.max(lr.height, l.scrollHeight) : lr.height));
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  if (W === R.W && H === R.H && dpr === R.dpr) return;
  R.W = W; R.H = H; R.dpr = dpr; R.D = Math.hypot(W, H);
  R.st.style.width = W + "px"; R.st.style.height = H + "px";
  for (const c of [R.cv, R.win]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
}
// Трещина идёт через середины отмеченных плиток: между ними — изломы, за первой и последней отметкой — хвосты, сходящие
// в остриё, по бокам — тонкие трещинки. Случайность — от R.seed: при смене размера сетки рисунок трещины тот же.
function build() {
  const pts = R.pts, n = pts.length, rnd = rng(R.seed), q = [];
  // Все размеры — от стороны плитки, а не от расстояния между отметками: у разлома-звезды отметки далеко друг от друга,
  // и хвосты, лучи и трещинки вышли бы в полсетки.
  const pitch = R.size;
  R.half = clamp(R.size * 0.15, 7, 16);
  const unit = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
  const push = (x, y, w, dot) => q.push({ x, y, w, dot });
  // 1) Осевая линия: между отметками — один-три излома в случайных местах, а не через равный шаг (частая «пила»
  //    читалась молнией, а не трещиной). Вершина: [x, y, ширина 0…1, номер отметки или −1].
  const K = [];
  const tail = (p, u, out) => {                              // хвост за крайней отметкой: чем дальше, тем уже
    const L = pitch * 0.85, list = [1, 0.62, 0.3].map((f) => { const o = (rnd() - 0.5) * 18 * f; return [p[0] + u[0] * L * f - u[1] * o, p[1] + u[1] * L * f + u[0] * o, 1 - f, -1]; });
    for (const t of out ? list.reverse() : list) K.push(t);
  };
  if (n > 1) tail(pts[0], unit(pts[1], pts[0]), false);
  for (let i = 0; i < n; i++) {
    K.push([pts[i][0], pts[i][1], 1, i]);
    if (i === n - 1) break;
    const a = pts[i], b = pts[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]), u = unit(a, b), amp = Math.min(12, d * 0.12);
    const kinks = 1 + (d > 70 && rnd() < 0.55 ? 1 : 0) + Math.floor(d / 150);
    for (let j = 0; j < kinks; j++) {                        // по излому в каждой доле отрезка
      const f = (j + 0.25 + rnd() * 0.5) / kinks, o = (rnd() < 0.5 ? -1 : 1) * amp * (0.45 + rnd() * 0.55);
      K.push([a[0] + (b[0] - a[0]) * f - u[1] * o, a[1] + (b[1] - a[1]) * f + u[0] * o, 1, -1]);
    }
  }
  if (n > 1) tail(pts[n - 1], unit(pts[n - 2], pts[n - 1]), true);
  // 2) Частые точки вдоль осевой: по ним гуляет ширина (где-то щель, где-то провал) и то, в какую сторону трещина «съехала».
  const kink = [];
  for (let i = 0; i < K.length; i++) {
    const a = K[i]; if (a[3] < 0 && a[2] === 1) kink.push(q.length);
    push(a[0], a[1], a[2], a[3]);
    if (i === K.length - 1) break;
    const b = K[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.round(d / 8));
    for (let j = 1; j < m; j++) push(a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m, a[2] + (b[2] - a[2]) * j / m, -1);
  }
  let s = 0, wide = 1, lean = 0;
  q.forEach((p, i) => {
    if (i) s += Math.hypot(p.x - q[i - 1].x, p.y - q[i - 1].y);
    wide = clamp(wide + (rnd() - 0.5) * 0.34, 0.6, 1.4); lean = clamp(lean + (rnd() - 0.5) * 0.26, -0.35, 0.35);
    p.s = s; p.jl = wide * (1 + lean) * (0.88 + rnd() * 0.24); p.jr = wide * (1 - lean) * (0.88 + rnd() * 0.24);
  });
  q.forEach((p, i) => { const a = q[Math.max(0, i - 1)], b = q[Math.min(q.length - 1, i + 1)], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; p.nx = -(b.y - a.y) / d; p.ny = (b.x - a.x) / d; });
  R.q = q; R.len = s || 1;
  R.dotS = []; for (const p of q) if (p.dot >= 0) R.dotS[p.dot] = p.s;
  R.cx = pts.reduce((a, p) => a + p[0], 0) / n; R.cy = pts.reduce((a, p) => a + p[1], 0) / n;
  R.br = [];                                                 // боковые трещинки — от изломов
  for (const i of kink) {
    if (rnd() > 0.62) continue;
    const side = rnd() < 0.5 ? 1 : -1, len = pitch * (0.35 + rnd() * 0.7), seg = [[q[i].x, q[i].y]];
    let a = Math.atan2(q[i].ny * side, q[i].nx * side) + (rnd() - 0.5) * 1.1, x = q[i].x, y = q[i].y;
    for (let k = 0; k < 3; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * len / 3; y += Math.sin(a) * len / 3; seg.push([x, y]); }
    R.br.push({ s: q[i].s, seg });
  }
  R.rays = [];                                               // столбы света из трещины
  const gap = Math.max(pitch * 0.34, s / 24);                // лучей — не больше двух дюжин, какой бы длинной трещина ни была
  for (let at = pitch * 0.5; at < s - pitch * 0.4; at += gap * (0.75 + rnd() * 0.6)) R.rays.push({ s: at, len: pitch * (1.1 + rnd() * 1.7), ph: rnd() * TAU, sp: 0.9 + rnd() * 1.4, lean: (rnd() - 0.5) * 0.4 });
}
function at(s) {                                             // точка трещины на длине s
  const q = R.q;
  if (s <= 0) return q[0];
  for (let i = 1; i < q.length; i++) if (q[i].s >= s) { const a = q[i - 1], b = q[i], f = (s - a.s) / (b.s - a.s || 1); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f }; }
  return q[q.length - 1];
}
function ribbon(c, sMax, wf) {                               // контур трещины до длины sMax; wf(p) — полуширина в точке; на конце — остриё
  const q = R.q, A = [], B = [];
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    if (p.s > sMax) { if (i) { const a = q[i - 1], f = (sMax - a.s) / (p.s - a.s || 1), tip = [a.x + (p.x - a.x) * f, a.y + (p.y - a.y) * f]; A.push(tip); B.push(tip); } break; }
    const h = wf(p); A.push([p.x + p.nx * h * p.jl, p.y + p.ny * h * p.jl]); B.push([p.x - p.nx * h * p.jr, p.y - p.ny * h * p.jr]);
  }
  if (A.length < 2) return false;
  c.beginPath(); c.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < A.length; i++) c.lineTo(A[i][0], A[i][1]);
  for (let i = B.length - 1; i >= 0; i--) c.lineTo(B[i][0], B[i][1]);
  c.closePath(); return true;
}
function spine(c) {                                          // осевая линия трещины целиком
  const q = R.q; c.beginPath(); c.moveTo(q[0].x, q[0].y);
  for (let i = 1; i < q.length; i++) c.lineTo(q[i].x, q[i].y);
}
function place(c, zoom, ox, oy) {                            // картинка места на весь холст, с запасом на сдвиг
  const im = R.img, W = R.W, H = R.H;
  if (!im || !im.complete || !im.naturalWidth) {             // ещё не пришла — свет цвета уровня
    const g = c.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, R.D * 0.7); g.addColorStop(0, rgba(R.lv.c, 1)); g.addColorStop(1, "#05030e");
    c.fillStyle = g; c.fillRect(0, 0, W, H); return;
  }
  const sc = Math.max(W / im.naturalWidth, H / im.naturalHeight) * zoom, dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
  c.drawImage(im, clamp(W / 2 - dw * R.lv.fx + ox, W - dw, 0), clamp(H / 2 - dh * 0.46 + oy, H - dh, 0), dw, dh);
}

// ---------- искры, осколки, кольца ----------
const ring = (x, y, r1, dur, w, delay) => R.rings.push({ x, y, r1, dur, w, t: -(delay || 0) });
function burst(x, y, n, sp) {                                // россыпь искр из точки
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = (sp || 150) * (0.25 + Math.random()); R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: -30, drag: 2.4, life: 0, max: 0.5 + Math.random() * 0.7, r: 3 + Math.random() * 5 }); }
}
function particles(c, dt) {
  c.globalCompositeOperation = "lighter";
  const P = R.parts, spr = R.spr;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.life += dt;
    if (p.life >= p.max) { P[i] = P[P.length - 1]; P.pop(); continue; }
    if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
    p.vy += p.ay * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.sw) p.x += Math.sin(R.age * p.sw + p.max * 20) * 12 * dt;
    c.globalAlpha = Math.sin(Math.PI * p.life / p.max) * (p.a || 1);
    c.drawImage(spr, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  c.globalAlpha = 1;
  for (let i = R.rings.length - 1; i >= 0; i--) {
    const g = R.rings[i]; g.t += dt;
    if (g.t < 0) continue;
    if (g.t >= g.dur) { R.rings.splice(i, 1); continue; }
    const f = g.t / g.dur, a = Math.pow(1 - f, 1.4);
    c.beginPath(); c.arc(g.x, g.y, Math.max(1, g.r1 * ease3(f)), 0, TAU);
    c.strokeStyle = rgba(R.lv.c, 0.5 * a); c.lineWidth = g.w * (1 - f) * 2.4 + 2; c.stroke();
    c.strokeStyle = "rgba(255,255,255," + (0.85 * a).toFixed(3) + ")"; c.lineWidth = g.w * (1 - f) + 1; c.stroke();
  }
  c.globalCompositeOperation = "source-over";
  for (let i = R.shards.length - 1; i >= 0; i--) {           // осколки плит: вылетают из-под кончика трещины и падают
    const p = R.shards[i]; p.life += dt;
    if (p.life >= p.max) { R.shards.splice(i, 1); continue; }
    p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    const a = 1 - Math.pow(p.life / p.max, 2);
    c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = a;
    c.beginPath(); c.moveTo(-p.r, p.r * 0.6); c.lineTo(p.r * 0.2, -p.r); c.lineTo(p.r, p.r * 0.5); c.closePath();
    c.fillStyle = "rgba(14,11,34,.96)"; c.fill(); c.strokeStyle = rgba(R.lv.hi, 0.85); c.lineWidth = 1; c.stroke();
    c.restore();
  }
  c.globalAlpha = 1;
}
function flashOut(c, dt, dur) {                              // вспышка на весь холст: белая (удар) или цвета уровня
  if (R.flash <= 0.004) return;
  c.globalCompositeOperation = "source-over";
  c.fillStyle = R.white ? "rgba(255,255,255," + R.flash.toFixed(3) + ")" : rgba(R.lv.hi, R.flash);
  c.fillRect(0, 0, R.W, R.H);
  R.flash = Math.max(0, R.flash - dt / dur);
}

// ---------- кадр: трещина ----------
function drawCrack(c, dt) {
  const W = R.W, H = R.H, lv = R.lv, t = R.t, pitch = R.size, w = R.wctx;
  const sealing = R.mode === "seal", k = sealing ? 1 - easeIn(t / 0.5) : 1;          // затягивается
  const grow = R.mode === "open" ? R.len * ease3((t - 0.05) / 0.95) : R.len;         // трещина бежит от первой отметки к последней
  const settle = R.mode === "open" ? smooth((t - 0.75) / 0.8) : 1;                   // и ещё немного расходится
  R.lit += (R.litS - R.lit) * Math.min(1, dt * 10);
  const hurry = R.hurry ? 0.5 + 0.5 * Math.sin(R.age * 17) : 0;
  const wf = (p) => R.half * p.w * smooth((grow - p.s) / (pitch * 1.15)) * (0.5 + 0.5 * settle) * (p.s <= R.lit ? 1.65 : 1) * (1 + 0.07 * Math.sin(R.age * 2.3 + p.s * 0.03)) * k;
  // сетка под надписью темнее; когда вышли отметки — светлеет: под ними видны герои
  const dim = sealing ? 0.1 * k : R.pulse >= 0 ? 0.52 - 0.42 * smooth(R.pulse / 0.5) : 0.52 * smooth(t / 0.22);
  if (dim > 0.004) { c.fillStyle = "rgba(5,3,14," + dim.toFixed(3) + ")"; c.fillRect(0, 0, W, H); }
  // свет из трещины вверх
  c.globalCompositeOperation = "lighter";
  for (const r of R.rays) {
    if (r.s > grow) continue;
    const p = at(r.s), on = smooth((grow - r.s) / pitch) * settle * k, L = r.len * (0.5 + 0.5 * Math.sin(R.age * r.sp + r.ph)) * on * (r.s <= R.lit ? 1.45 : 1);
    if (L < 6) continue;
    const tx = p.x + r.lean * L, ty = p.y - L, b = R.half * 0.7, tw = b + L * 0.17, g = c.createLinearGradient(p.x, p.y, tx, ty);
    g.addColorStop(0, rgba(lv.hi, 0.34 + 0.2 * hurry)); g.addColorStop(0.5, rgba(lv.c, 0.12)); g.addColorStop(1, rgba(lv.c, 0));
    c.fillStyle = g; c.beginPath(); c.moveTo(p.x - b, p.y); c.lineTo(p.x + b, p.y); c.lineTo(tx + tw, ty); c.lineTo(tx - tw, ty); c.closePath(); c.fill();
  }
  c.globalCompositeOperation = "source-over";
  // окно в глубину: в трещине видно место, куда она ведёт
  w.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); w.globalCompositeOperation = "source-over"; w.clearRect(0, 0, W, H);
  if (ribbon(w, grow, wf)) {
    w.fillStyle = "#fff"; w.fill();
    w.globalCompositeOperation = "source-in"; w.filter = "brightness(1.6) saturate(1.3)";   // место в трещине — ярче, чем на фоне поля: это свет из глубины
    place(w, 1.24, Math.sin(R.age * 0.7) * 8, Math.cos(R.age * 0.55) * 6); w.filter = "none";
    w.globalCompositeOperation = "source-atop";
    w.fillStyle = sealing ? "rgba(20,20,40," + (0.9 * (1 - k)).toFixed(3) + ")" : rgba(lv.hi, 0.14 + 0.16 * hurry); w.fillRect(0, 0, W, H);   // свет из глубины
    ribbon(w, grow, wf); w.lineJoin = "miter"; w.strokeStyle = "rgba(2,1,8,.62)"; w.lineWidth = Math.max(2, R.half * 0.6); w.stroke();        // тень по краям: трещина уходит вглубь
    c.drawImage(R.win, 0, 0, W, H);
    c.globalCompositeOperation = "lighter"; c.lineJoin = "round";
    ribbon(c, grow, wf);
    c.strokeStyle = rgba(lv.c, 0.06 * k); c.lineWidth = R.half * 7.5; c.stroke();
    c.strokeStyle = rgba(lv.c, 0.11 * k); c.lineWidth = R.half * 4.6; c.stroke();
    c.strokeStyle = rgba(lv.c, 0.22 * k); c.lineWidth = R.half * 2.2; c.stroke();
    c.strokeStyle = rgba(lv.hi, 0.5 * k); c.lineWidth = R.half * 0.75; c.stroke();
    c.globalCompositeOperation = "source-over"; c.lineJoin = "miter";
    c.strokeStyle = "rgba(255,255,255," + (0.9 * k).toFixed(3) + ")"; c.lineWidth = 1.2; c.stroke();
  }
  // боковые трещинки
  c.lineJoin = "round"; c.lineCap = "round";
  for (const b of R.br) {
    if (b.s > grow) continue;
    const a = smooth((grow - b.s) / (pitch * 0.8)) * k, m = b.seg.length - 1, upto = a * m;
    c.beginPath(); c.moveTo(b.seg[0][0], b.seg[0][1]);
    for (let i = 1; i <= m; i++) { const f = clamp(upto - (i - 1), 0, 1); if (f <= 0) break; c.lineTo(b.seg[i - 1][0] + (b.seg[i][0] - b.seg[i - 1][0]) * f, b.seg[i - 1][1] + (b.seg[i][1] - b.seg[i - 1][1]) * f); }
    c.strokeStyle = "rgba(3,2,10," + (0.9 * a).toFixed(3) + ")"; c.lineWidth = 3.4; c.stroke();
    c.strokeStyle = rgba(lv.hi, 0.9 * a); c.lineWidth = 1.1; c.stroke();
  }
  // искры поднимаются из трещины; пока она бежит — из-под кончика летят осколки
  if (!sealing) {
    R.emit += dt * (26 + 30 * settle + (R.lit > 0 ? 26 : 0) + 40 * hurry);
    while (R.emit >= 1) {
      R.emit -= 1;
      const p = at(Math.random() * grow); if (!(p.w > 0.25)) continue;
      R.parts.push({ x: p.x + (Math.random() - 0.5) * R.half, y: p.y, vx: (Math.random() - 0.5) * 26, vy: -(22 + Math.random() * 60), ay: -46, sw: 2 + Math.random() * 3, life: 0, max: 0.7 + Math.random() * 1.1, r: 2 + Math.random() * 4.5 });
    }
    if (R.mode === "open" && grow < R.len - 1) {
      R.chip += dt;
      while (R.chip > 0.02) { R.chip -= 0.02; const p = at(grow); R.shards.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 300, vy: -(90 + Math.random() * 230), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16, r: 3 + Math.random() * 6, life: 0, max: 0.5 + Math.random() * 0.4 }); }
      const p = at(grow); c.globalCompositeOperation = "lighter"; c.drawImage(R.spr, p.x - R.half * 5, p.y - R.half * 5, R.half * 10, R.half * 10); c.globalCompositeOperation = "source-over";   // раскалённый кончик
    }
  }
  particles(c, dt);
  // отметки выходят: свет пробегает по трещине от первой к последней
  if (R.pulse >= 0) {
    const n = R.dotS.length, kf = R.pulse / 0.06;
    if (kf < n - 1 + 0.01) { const i = Math.floor(kf), p = at(R.dotS[i] + (R.dotS[Math.min(n - 1, i + 1)] - R.dotS[i]) * (kf - i)), r = R.half * 7; c.globalCompositeOperation = "lighter"; c.drawImage(R.spr, p.x - r, p.y - r, r * 2, r * 2); c.globalCompositeOperation = "source-over"; }
    R.pulse += dt;
  }
  flashOut(c, dt, 0.26);
}

// ---------- кадр: провал ----------
function shade(c, a) {                                       // место темнеет под надписи титула
  if (a <= 0.004) return;
  const g = c.createLinearGradient(0, 0, 0, R.H);
  g.addColorStop(0, "rgba(4,3,12," + (0.16 * a).toFixed(3) + ")"); g.addColorStop(0.42, "rgba(4,3,12," + (0.5 * a).toFixed(3) + ")"); g.addColorStop(1, "rgba(4,3,12," + (0.76 * a).toFixed(3) + ")");
  c.fillStyle = g; c.fillRect(0, 0, R.W, R.H);
}
const zoomAt = (t) => 1.03 + 0.2 * ease3(t / 0.9) + 0.012 * t;   // место «наезжает»: рывок и медленный ход дальше
function drawDive(c, dt) {
  const W = R.W, H = R.H, lv = R.lv, t = R.t, w = R.wctx;
  if (R.mode === "land") {                                   // картинка расходится кругом от середины: под ней сетка уже в цветах уровня
    place(c, zoomAt(R.tDive + t), 0, 0); shade(c, 1);
    c.globalCompositeOperation = "destination-out";
    const r = R.D * 0.8 * smooth(t / 0.5) + 1, g = c.createRadialGradient(W / 2, R.vy, r * 0.7, W / 2, R.vy, r);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "lighter";                  // по кромке круга — свет
    c.beginPath(); c.arc(W / 2, R.vy, r * 0.86, 0, TAU); c.strokeStyle = rgba(lv.hi, 0.5 * (1 - smooth(t / 0.5))); c.lineWidth = 5; c.stroke();
    c.globalCompositeOperation = "source-over";
    return;
  }
  const lw = R.half * 2.6 + easeIn(t / 0.62) * R.D * 2.3, full = lw >= R.D * 2.2;
  if (full) place(c, zoomAt(t), 0, 0);
  else {                                                     // трещина раскрывается на всю сетку
    c.globalCompositeOperation = "lighter"; c.lineJoin = c.lineCap = "round";
    spine(c); c.strokeStyle = rgba(lv.c, 0.5); c.lineWidth = lw + 26; c.stroke();
    c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = lw + 7; c.stroke();
    c.globalCompositeOperation = "source-over";
    w.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); w.globalCompositeOperation = "source-over"; w.clearRect(0, 0, W, H);
    w.lineJoin = w.lineCap = "round"; spine(w); w.strokeStyle = "#fff"; w.lineWidth = lw; w.stroke();
    w.globalCompositeOperation = "source-in"; place(w, zoomAt(t), 0, 0);
    c.drawImage(R.win, 0, 0, W, H);
  }
  shade(c, smooth((t - 0.3) / 0.55));
  // полосы скорости: падаем в середину разлома
  if (t < 1) {
    c.globalCompositeOperation = "lighter"; c.lineCap = "round";
    const a = 1 - smooth(t / 1);
    for (const s of R.streaks) {
      const r0 = s.r + s.v * t, r1 = r0 + s.len * (0.35 + t * 1.6);
      c.strokeStyle = "rgba(255,255,255," + (s.a * a).toFixed(3) + ")"; c.lineWidth = s.w;
      c.beginPath(); c.moveTo(R.cx + s.cos * r0, R.cy + s.sin * r0); c.lineTo(R.cx + s.cos * r1, R.cy + s.sin * r1); c.stroke();
    }
    c.globalCompositeOperation = "source-over";
  }
  // живое в месте: огни медленно поднимаются
  if (t > 0.35) {
    R.emit += dt * 16;
    while (R.emit >= 1) { R.emit -= 1; R.parts.push({ x: Math.random() * W, y: H * (0.25 + Math.random() * 0.8), vx: (Math.random() - 0.5) * 12, vy: -(10 + Math.random() * 30), ay: -6, sw: 1 + Math.random() * 2, life: 0, max: 1.6 + Math.random() * 2, r: 2 + Math.random() * 5, a: 0.7 }); }
  }
  particles(c, dt);
  flashOut(c, dt, 0.42);
}

// ---------- карточка с надписями ----------
function placeCard() {                                       // по видимой части сетки: на телефоне сетка выше экрана
  if (!R || !R.card) return;
  const lr = R.list.getBoundingClientRect(), W = Math.round(lr.width), H = R.H || Math.round(Math.max(lr.height, R.list.scrollHeight));
  const top = clamp(-lr.top, 0, Math.max(0, H - 160)), bot = clamp(window.innerHeight - lr.top, top + 160, Math.max(top + 160, H));
  const s = R.card.style; s.width = W + "px"; s.top = top + "px"; s.height = Math.min(H - top, bot - top) + "px"; s.setProperty("--rt-w", W + "px");
  R.vy = top + Math.min(H - top, bot - top) / 2;
}
function card(html, cls, vars) {
  cardOff(true);
  const el = document.createElement("div");
  el.className = "rt-card " + cls + (R.calm ? " rt-calm" : ""); el.dataset.lv = String(R.to); el.setAttribute("aria-hidden", "true");
  el.innerHTML = html;
  for (const k in vars || {}) el.style.setProperty(k, vars[k]);
  R.list.appendChild(el); R.card = el; placeCard();
}
function cardOff(now) {
  const el = R && R.card; if (!el) return;
  R.card = null;
  if (now) { el.remove(); return; }
  el.classList.add("rt-out"); setTimeout(() => el.remove(), 380);
}

// ---------- что зовёт js/ui.js ----------
function init(o) {
  stop();
  R = { list: o.list, to: o.to, lv: LV[o.to], calm: !!o.calm, size: o.size || 80, pts: o.pts, seed: ((Math.random() * 1e9) | 0) + 1, mode: "open", t: 0, age: 0, tDive: 0, flash: 0, white: true,
    lit: 0, litS: 0, pulse: -1, hurry: false, emit: 0, chip: 0, parts: [], shards: [], rings: [], streaks: [], card: null, later: null, W: 0, H: 0, dpr: 1, D: 1, vy: 0 };
  if (R.calm) return;
  R.st = document.createElement("div"); R.st.className = "rt-stage"; R.st.setAttribute("aria-hidden", "true");
  R.cv = document.createElement("canvas"); R.st.appendChild(R.cv); o.list.appendChild(R.st);
  R.ctx = R.cv.getContext("2d"); R.win = document.createElement("canvas"); R.wctx = R.win.getContext("2d");
  R.img = image(o.to); R.spr = sprite(o.to);
  fit(); build(); R.vy = R.H / 2;
}
// Разлом открывается. o: list — сетка, pts — середины отметок по порядку, size — сторона плитки, to — уровень, куда ведёт,
// html — надписи (выходят через cardAt секунд: сначала трещина пробегает по сетке, и её ничто не закрывает), calm — без
// движения, resume — трещина уже есть (сетку перестроили посреди разлома): без удара.
export function open(o) {
  init(o);
  if (o.resume) { R.t = 9; R.pulse = 9; if (o.run) R.mode = "run"; }
  else if (!R.calm) {
    const p = R.q.find((x) => x.dot === 0) || R.q[0];
    R.flash = 0.8; ring(p.x, p.y, R.D * 0.95, 0.8, 9); ring(p.x, p.y, R.D * 0.6, 0.65, 5, 0.13); burst(p.x, p.y, 36, 260);
  }
  if (o.html) {
    const cls = "rt-open" + (o.quick ? " rt-quick" : "");
    if (R.calm || !(o.cardAt > 0)) card(o.html, cls, o.vars); else R.later = { at: o.cardAt, html: o.html, cls, vars: o.vars };
  }
}
export function shape(pts, size) {                           // сетка сменила размер: трещина — по новым местам отметок
  if (!R) return;
  R.pts = pts; if (size) R.size = size;
  if (!R.calm) { fit(); build(); }
  placeCard();
}
export function reveal() {                                   // вышли отметки: надпись уходит, по трещине пробегает свет
  if (!R) return;
  R.pulse = 0; R.later = null; cardOff(false);
}
export function go() {                                       // часы разлома пошли
  if (!R) return;
  R.later = null; cardOff(false);
  if (R.pulse < 0) R.pulse = 9;
  if (R.mode === "open") { R.mode = "run"; R.t = 9; }
  if (!R.calm) { R.flash = 0.34; R.white = false; const p = at(R.dotS[0] || 0); ring(p.x, p.y, R.size * 2.4, 0.5, 5); }
}
export function mark(k) {                                    // взято k отметок: трещина до этого места разгорается
  if (!R || R.calm || !R.dotS) return;
  R.litS = k > 0 ? R.dotS[Math.min(R.dotS.length - 1, k - 1)] + 1 : 0;
  if (k > 0) { const p = at(R.litS); burst(p.x, p.y, 9, 170); }
}
export function hurry(on) { if (R) R.hurry = !!on; }         // время на исходе: трещина дрожит
export function seal() {                                     // разлом не взят: затягивается
  if (!R) return;
  R.later = null; cardOff(false);
  if (R.calm || R.mode === "dive" || R.mode === "land") { stop(); return; }
  R.mode = "seal"; R.t = 0; R.hurry = false; R.flash = 0;
}
// Провал. o — как у open: если разлом шёл без постановки (сетка была не видна), она начинается отсюда. html — титул уровня.
export function dive(o) {
  if (!R || R.to !== o.to || R.list !== o.list || !R.list.isConnected) init(o);
  R.later = null; cardOff(true);
  R.mode = "dive"; R.t = 0; R.hurry = false; R.emit = 0; R.rings.length = 0;
  if (!R.calm) {
    R.flash = 1; R.white = true;
    R.streaks = Array.from({ length: 54 }, () => { const a = Math.random() * TAU; return { cos: Math.cos(a), sin: Math.sin(a), r: R.D * (0.04 + Math.random() * 0.3), v: R.D * (0.9 + Math.random() * 1.9), len: R.D * (0.05 + Math.random() * 0.16), w: 1 + Math.random() * 2.2, a: 0.25 + Math.random() * 0.5 }; });
    for (const p of R.q) if (p.dot >= 0) burst(p.x, p.y, 7, 320);
  }
  if (o.html) card(o.html, "rt-land", o.vars);
}
export function land() {                                     // титул уходит, картинка расходится
  if (!R) return;
  cardOff(false);
  if (R.calm || R.mode !== "dive") { stop(); return; }
  R.tDive = R.t; R.mode = "land"; R.t = 0; R.parts.length = 0;
}
export function stop() {
  if (!R) return;
  cardOff(true);
  if (R.st) R.st.remove();
  R = null;
}
export function frame(dt) {
  if (!R) return;
  if (!R.list.isConnected || (R.st && !R.st.isConnected)) { stop(); return; }
  R.t += dt; R.age += dt;
  if (R.later && R.t >= R.later.at) { const q = R.later; R.later = null; card(q.html, q.cls, q.vars); }
  if ((R.mode === "seal" && R.t > 0.6) || (R.mode === "land" && R.t > 0.54)) { stop(); return; }
  if (R.calm) return;
  fit();
  const c = R.ctx;
  c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
  c.clearRect(0, 0, R.W, R.H);
  if (R.mode === "dive" || R.mode === "land") drawDive(c, dt); else drawCrack(c, dt);
}
export const busy = () => !!R;
export const info = () => (R ? { mode: R.mode, t: R.t, calm: R.calm, to: R.to, W: R.W, H: R.H, card: R.card ? R.card.className : "", parts: R.parts.length, lit: R.litS, pulse: R.pulse } : null);   // для проверки
