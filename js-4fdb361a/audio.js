// Звук — синтез WebAudio, без файлов (PLAN.md § 16.8). Громкость 30 %, не больше восьми голосов сразу.
let ctx = null, master = null, on = true, voices = 0, cap = 8;   // cap — сколько голосов можно сразу; сбор рисунка на миг поднимает его
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];       // пентатоника: каждый удар комбо выше

function ac() {
  if (!ctx) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ctx = new A();
    master = ctx.createGain(); master.gain.value = 0.3; master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
export function setSound(v) { on = !!v; if (!on) droneStop(); else if (deepLv) droneStart(deepLv); }
let hitOn = true;                                            // звук ударов по труперу (хлыст, крит, смерть трупера) — своя настройка
export function setHitSound(v) { hitOn = !!v; }
export function unlock() { ac(); }

function tone(freq, dur, type, vol, slide, delay) {
  if (!on || voices >= cap) return;
  const c = ac(); if (!c) return;
  const t = c.currentTime + (delay || 0);
  const o = c.createOscillator(), g = c.createGain();
  o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  voices++; o.onended = () => { voices--; };
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, hp, lp, delay) {
  if (!on || voices >= cap) return;
  const c = ac(); if (!c) return;
  const t = c.currentTime + (delay || 0);
  const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = hp || 2400; f.Q.value = lp || 0.8;
  const g = c.createGain(); g.gain.value = vol || 0.3;
  s.connect(f); f.connect(g); g.connect(master);
  voices++; s.onended = () => { voices--; };
  s.start(t);
}
const semi = (base, n) => base * Math.pow(2, n / 12);
// Сетка отряда — свайп, рисунки, комбо — звучит в одном строе (до-мажорная пентатоника): покупки по пути, отметки рисунка
// и аккорд сбора складываются в мелодию, а не в шум. Слои сбора рисунка идут разом, поэтому им разрешено больше голосов.
const GRID = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const loud = (fn) => { const was = cap; cap = 16; try { fn(); } finally { cap = was; } };
const big = (fn) => { const was = cap; cap = 30; try { fn(); } finally { cap = was; } };   // разлом и провал звучат поверх аккорда последнего рисунка
function swell(freq, dur, type, vol, slide, delay) {         // звук, который нарастает и обрывается: подъём перед ударом
  if (!on || voices >= cap) return;
  const c = ac(); if (!c) return;
  const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
  o.type = type || "sawtooth"; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.05, t + dur * 0.92); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  voices++; o.onended = () => { voices--; };
  o.start(t); o.stop(t + dur + 0.02);
}
const ROOTS = [0, 146.83, 130.81, 110];                      // основной тон уровня глубины
// Глубина комбо (js/deep.js): у каждого уровня свой строй сетки и свой тихий гул под ним. Улица — мажорная пентатоника,
// «Подземка» — минорная и на тон ниже, «Изнанка» — тревожный лад с малой секундой, «Пустота» — пустые квинты и кварты.
const SCALES = [GRID, [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24], [0, 1, 5, 7, 8, 12, 13, 17, 19, 20, 24], [0, 2, 7, 9, 12, 14, 19, 21, 24, 26, 31]];
const DOWN = [0, -2, -4, -7];                                // на сколько полутонов ниже звучит сетка на уровне
let deepLv = 0, drone = null;
const grid = () => SCALES[deepLv] || GRID;
const deepF = (f) => f * Math.pow(2, (DOWN[deepLv] || 0) / 12);
function droneStop() {
  if (!drone || !ctx) { drone = null; return; }
  const d = drone, t = ctx.currentTime; drone = null;
  try { d.g.gain.cancelScheduledValues(t); d.g.gain.setTargetAtTime(0.0001, t, 0.3); for (const n of d.nodes) n.stop(t + 1.6); } catch (e) { /* уже остановлен */ }
}
function droneStart(lv) {                                    // гул места: два-три тихих голоса с медленным дыханием
  droneStop();
  if (!on || !lv || (typeof document !== "undefined" && document.hidden)) return;
  const c = ac(); if (!c) return;
  const t = c.currentTime, g = c.createGain(), lp = c.createBiquadFilter(), nodes = [];
  g.gain.setValueAtTime(0.0001, t); g.gain.setTargetAtTime([0, 0.13, 0.12, 0.14][lv] || 0.12, t, 1.2);
  lp.type = "lowpass"; lp.frequency.value = [0, 380, 520, 1400][lv] || 500; lp.connect(g); g.connect(master);
  const voice = (freq, type, vol, lfoHz) => {
    const o = c.createOscillator(), v = c.createGain();
    o.type = type; o.frequency.value = freq; v.gain.value = vol; o.connect(v); v.connect(lp); o.start(t); nodes.push(o);
    if (lfoHz) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = lfoHz; lg.gain.value = vol * 0.7; l.connect(lg); lg.connect(v.gain); l.start(t); nodes.push(l); }
  };
  if (lv === 1) { voice(55, "sawtooth", 0.5, 0.11); voice(82.4, "triangle", 0.35, 0.07); voice(110.6, "sine", 0.3, 0.19); }          // гул тоннеля
  else if (lv === 2) { voice(51.9, "sawtooth", 0.4, 0.09); voice(73.4, "triangle", 0.4, 0.23); voice(155.6, "sine", 0.18, 0.31); }   // тритон: тревога
  else { voice(41.2, "sine", 0.7, 0.05); voice(61.7, "sine", 0.4, 0.08); voice(987.8, "sine", 0.05, 0.13); voice(1318.5, "sine", 0.03, 0.21); }   // пустота: низ и далёкий звон
  drone = { g, nodes, lv };
}
export function setDeep(lv) {                                // уровень глубины сменился: другой строй и гул
  lv = Math.max(0, Math.min(SCALES.length - 1, Math.floor(lv) || 0));
  if (lv === deepLv && (!!drone === !!lv || !on)) return;
  deepLv = lv;
  if (lv) droneStart(lv); else droneStop();
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.hidden) droneStop(); else if (deepLv && on) droneStart(deepLv); });

export const sfx = {
  whip(step) {                                               // щелчок хлыста; step — ступень комбо, поднимает тон
    if (!hitOn) return;
    const k = 1 + (Math.random() * 0.12 - 0.06);
    noise(0.07, 0.34, 3200 * k, 0.9);
    tone(semi(330, PENTA[Math.min(PENTA.length - 1, step || 0) % PENTA.length]) * k, 0.07, "triangle", 0.12, 0.5);
  },
  crit() { if (!hitOn) return; noise(0.12, 0.4, 1800, 0.6); tone(880, 0.16, "square", 0.1, 1.5); },
  kill() { if (!hitOn) return; tone(220, 0.09, "sine", 0.16, 0.45); },
  orb(i) { tone(semi(784, PENTA[(i || 0) % 6]), 0.12, "sine", 0.12, 1.02); },
  buy() { tone(660, 0.06, "triangle", 0.14); tone(990, 0.09, "triangle", 0.12, 1, 0.05); },
  ms() { [0, 4, 7, 12].forEach((s, i) => tone(semi(523, s), 0.16, "triangle", 0.16, 1, i * 0.07)); },
  tier(i) { [0, 7, 12].forEach((s, k) => tone(semi(392 + i * 40, s), 0.14, "square", 0.08, 1, k * 0.05)); noise(0.2, 0.25, 500, 0.5); },
  bossIn() { tone(98, 0.7, "sawtooth", 0.2, 0.7); noise(0.35, 0.3, 300, 0.4); },
  bossWin() { [0, 4, 7, 12, 16].forEach((s, i) => tone(semi(392, s), 0.22, "triangle", 0.18, 1, i * 0.08)); },
  bossFail() { tone(196, 0.35, "sine", 0.14, 0.6); },
  wisp() { [12, 16, 19].forEach((s, i) => tone(semi(523, s), 0.2, "sine", 0.12, 1, i * 0.06)); },
  skill() { tone(440, 0.1, "square", 0.08, 2); },
  unlock() { [0, 5, 9].forEach((s, i) => tone(semi(587, s), 0.18, "sine", 0.14, 1, i * 0.09)); },
  rank() { [0, 4, 7, 12, 16, 19].forEach((s, i) => tone(semi(440, s), 0.25, "triangle", 0.16, 1, i * 0.06)); },
  rebirth() { tone(110, 1.4, "sawtooth", 0.16, 0.25); noise(1.2, 0.2, 800, 0.3); },
  dawn() { [0, 7, 12, 19].forEach((s, i) => tone(semi(294, s), 0.5, "sine", 0.14, 1, i * 0.12)); },
  deny() { tone(150, 0.08, "square", 0.06); },
  // ---- сетка отряда ----
  tap(n) {                                                   // покупка плитки; n — которая по счёту в этом свайпе: каждая следующая выше
    const i = n < 11 ? Math.max(0, n) : 5 + (n - 5) % 6, f = deepF(semi(392, grid()[i]));
    tone(f, 0.075, "triangle", 0.1); tone(f * 2, 0.05, "sine", 0.045, 1, 0.004); noise(0.018, 0.05, 5200, 1.2);
  },
  mile() { [0, 7, 12, 16].forEach((x, i) => tone(semi(784, x), 0.2, "triangle", 0.13, 1, i * 0.055)); noise(0.12, 0.08, 6500, 2, 0.02); },   // куплена веха
  mark(i, n, lvl) {                                          // отметка рисунка: i — которая по счёту из n; к последней нота доходит до верха
    const G = grid(), top = G.length - 1, at = n > 1 ? Math.round(i / (n - 1) * Math.min(top, n + 2)) : 0;
    const f = deepF(semi(523.25 * Math.pow(2, (lvl || 0) / 12), G[Math.min(top, at)]));
    tone(f, 0.16, "sine", 0.13); tone(f * 3, 0.07, "sine", 0.03); tone(f * 0.5, 0.06, "triangle", 0.05);
  },
  boom(lvl, plus) {                                          // рисунок собран: удар, аккорд и россыпь вверх; lvl 0…4 — по комбо, plus — сколько он прибавил
    const G = grid(), root = deepF(semi(261.63, G[Math.max(0, Math.min(4, lvl || 0))]));
    const chord = deepLv ? [G[0], G[2], G[4], G[5]] : [0, 4, 7, 12], run = deepLv ? [G[5], G[6], G[7], G[8], G[9]] : [12, 16, 19, 24, 28];   // на глубине аккорд и россыпь — в строе уровня
    loud(() => {
      tone(170, 0.26, "sine", 0.34, 0.24);
      noise(0.11, 0.2, 1700, 0.7);
      chord.forEach((x, i) => tone(semi(root * 2, x), 0.3 + lvl * 0.04, i % 2 ? "triangle" : "sawtooth", 0.085, 1, 0.012 * i));
      run.slice(0, 3 + Math.min(2, lvl)).forEach((x, i) => tone(semi(root * 2, x), 0.12, "sine", 0.09, 1, 0.07 + i * 0.045));
      if (lvl >= 2) noise(0.34, 0.12, 900 + lvl * 500, 0.5, 0.02);
      if (lvl >= 3) tone(root, 0.5, "square", 0.05, 2, 0.03);
      for (let j = 1; j < (plus || 1); j++) tone(semi(root * 4, 7 + j * 2), 0.08, "sine", 0.07, 1, 0.2 + j * 0.05);
    });
  },
  fanfare(step) {                                            // рубеж комбо: 0…3 — 10, 25, 50, 75; 4 — потолок
    const root = semi(392, [0, 2, 4, 5, 7][Math.max(0, Math.min(4, step || 0))]), last = step >= 4;
    loud(() => {
      [0, 4, 7, 12, 16, 19].forEach((x, i) => tone(semi(root, x), 0.2, "triangle", 0.13, 1, i * 0.07));
      [12, 16, 19, 24].forEach((x) => tone(semi(root, x), last ? 0.9 : 0.5, "sawtooth", 0.06, 1, 0.44));
      noise(0.5, 0.1, 5000, 1.5, 0.44);
      if (last) [24, 28, 31, 36].forEach((x, i) => tone(semi(root, x), 0.3, "sine", 0.09, 1, 0.9 + i * 0.09));
    });
  },
  down() { tone(520, 0.2, "triangle", 0.09, 0.55); },        // ранг комбо упал на ступень
  drop() { tone(330, 0.5, "sawtooth", 0.09, 0.22); tone(165, 0.6, "sine", 0.13, 0.3); noise(0.3, 0.1, 320, 0.5); },   // комбо оборвалось
  // ---- глубина комбо ----
  // Постановка разлома (js/rite.js). lv — уровень, куда он ведёт: аккорды — в его строе.
  riftOpen(lv) {                                             // разлом открылся: удар, треск плит, стеклянный аккорд места и тихий подъём к выходу отметок
    const G = SCALES[lv] || GRID, root = ROOTS[lv] || ROOTS[1];
    big(() => {
      tone(64, 1.6, "sine", 0.5, 0.4); tone(128, 0.5, "triangle", 0.2, 0.45);
      noise(0.55, 0.36, 420, 0.5); noise(0.3, 0.2, 1400, 0.7, 0.03);
      [[0.09, 3800, 0], [0.07, 5200, 0.12], [0.06, 2900, 0.25], [0.08, 4400, 0.44], [0.05, 6100, 0.62], [0.05, 3300, 0.8]].forEach((x) => noise(x[0], 0.22, x[1], 1.5, x[2]));
      [0, 4, 6].forEach((i, n) => tone(semi(root * 2, G[i]), 1.3, n ? "sine" : "triangle", 0.075, 1, 0.5 + n * 0.17));
      swell(root / 2, 2.6, "sawtooth", 0.04, 1.5, 0.8); swell(root, 2.6, "sine", 0.05, 1.5, 0.8);
    });
  },
  riftTick(n) {                                              // последние секунды передышки: стук сердца, всё выше
    tone(78, 0.2, "sine", 0.3, 0.55); tone(semi(880, 3 - n), 0.05, "square", 0.035, 1, 0.01);
  },
  riftDots(n, lv) {                                          // отметки выходят на трещину: пробежка вверх по строю уровня
    const G = SCALES[lv] || GRID, root = ROOTS[lv] || ROOTS[1];
    big(() => { for (let i = 0; i < n; i++) tone(semi(root * 4, G[Math.min(G.length - 1, i)]), 0.16, i % 2 ? "sine" : "triangle", 0.085, 1, i * 0.06); noise(0.3, 0.07, 6200, 1.6, 0.02); });
  },
  riftGo(lv) {                                               // часы разлома пошли
    const root = ROOTS[lv] || ROOTS[1];
    big(() => { tone(root * 4, 0.5, "triangle", 0.13); tone(root * 6, 0.5, "sine", 0.08, 1, 0.02); tone(root * 2, 0.3, "sawtooth", 0.05, 1); noise(0.22, 0.14, 5200, 1.3); });
  },
  gateFail() { tone(233, 0.5, "sawtooth", 0.1, 0.3); tone(98, 0.6, "sine", 0.15, 0.5); noise(0.3, 0.13, 420, 0.5); },   // разлом закрылся
  dive(lv) {                                                 // провал на уровень глубже: удар, свист падения, гул вниз и аккорд нового места — под титул уровня
    const G = SCALES[lv] || GRID, root = ROOTS[lv] || ROOTS[1];
    big(() => {
      tone(150, 1.3, "sine", 0.44, 0.16); tone(75, 1.5, "sawtooth", 0.12, 0.3);
      noise(1.0, 0.3, 1300, 0.4); noise(0.5, 0.16, 5200, 1.2, 0.04);
      tone(1400, 0.6, "sine", 0.05, 0.12, 0.02);             // свист: падаем
      [0, 2, 4, 6].forEach((i, n) => tone(semi(root * 2, G[i]), 1.5, n % 2 ? "triangle" : "sine", 0.1, 1, 0.5 + n * 0.11));
      [7, 9, 10].forEach((i, n) => tone(semi(root * 2, G[i]), 0.9, "sine", 0.07, 1, 1.05 + n * 0.13));
      tone(root / 2, 1.8, "sine", 0.2, 1, 0.5);              // низ под названием уровня
    });
  },
  rise() { tone(170, 0.7, "sine", 0.13, 2.8); noise(0.55, 0.11, 2400, 0.6); tone(415, 0.3, "triangle", 0.06, 0.7, 0.34); },   // всплыл на уровень выше
  spark() { [0, 7, 12].forEach((x, i) => tone(semi(1568, x), 0.15, "sine", 0.09, 1, i * 0.035)); noise(0.05, 0.08, 7200, 2); },   // поймана искра
  find() { const G = grid(); [0, 2, 4, 6, 8, 10].forEach((i, n) => tone(deepF(semi(659.3, G[i])), 0.28, n % 2 ? "sine" : "triangle", 0.11, 1, n * 0.07)); noise(0.3, 0.07, 6000, 1.6, 0.3); },   // находка глубины
  hurry(last) { tone(last ? 1568 : 1175, 0.045, "square", 0.045); if (last) tone(1568, 0.045, "square", 0.045, 1, 0.09); },   // время на рисунок кончается
  // ---- особые рисунки глубины (js/ui.js): поезд, фонари, орбита — в строе уровня ----
  trainGo() { tone(deepF(587.3), 0.2, "square", 0.05); tone(deepF(784), 0.3, "square", 0.05, 1, 0.15); noise(0.25, 0.08, 900, 0.6); },   // поезд тронулся: гудок в два тона
  clack(i) {                                                 // отметка поезда: стук колёс, тон по ходу вверх
    const G = grid(), f = deepF(semi(392, G[Math.min(G.length - 1, i)]));
    tone(f, 0.12, "triangle", 0.11); noise(0.03, 0.12, 2200, 1.4); noise(0.03, 0.09, 1500, 1.2, 0.07);
  },
  lamp(i) {                                                  // фонарь взят: звон, каждый следующий выше
    const G = grid(), f = deepF(semi(659.3, G[Math.min(G.length - 1, i)]));
    tone(f, 0.3, "sine", 0.13); tone(f * 2, 0.22, "sine", 0.06, 1, 0.01); tone(f * 3, 0.1, "sine", 0.03);
  },
  lampOut() { tone(196, 0.18, "sine", 0.08, 0.6); },          // фонарь погас
  // ---- пауза комбо (js/ui.js) ----
  pause() { [12, 7, 0].forEach((x, i) => tone(semi(523.25, x), 0.24, "sine", 0.11, 0.98, i * 0.08)); noise(0.35, 0.05, 7000, 1.6, 0.05); },   // поставил: звон вниз, «замёрзло»
  unpause() { [0, 7, 12].forEach((x, i) => tone(semi(523.25, x), 0.18, "triangle", 0.11, 1.02, i * 0.07)); },   // продолжил: звон вверх
  orbit(p, need) {                                           // шаг по орбите: тон растёт с кругами
    const f = deepF(330 * Math.pow(2, Math.min(1, p / Math.max(1, need)) * 1.5));
    tone(f, 0.1, "sine", 0.1, 1.06); tone(f * 1.5, 0.07, "sine", 0.04);
  },
};
