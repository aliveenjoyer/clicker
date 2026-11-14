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
export function setSound(v) { on = !!v; }
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

export const sfx = {
  whip(step) {                                               // щелчок хлыста; step — ступень комбо, поднимает тон
    const k = 1 + (Math.random() * 0.12 - 0.06);
    noise(0.07, 0.34, 3200 * k, 0.9);
    tone(semi(330, PENTA[Math.min(PENTA.length - 1, step || 0) % PENTA.length]) * k, 0.07, "triangle", 0.12, 0.5);
  },
  crit() { noise(0.12, 0.4, 1800, 0.6); tone(880, 0.16, "square", 0.1, 1.5); },
  kill() { tone(220, 0.09, "sine", 0.16, 0.45); },
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
    const i = n < 11 ? Math.max(0, n) : 5 + (n - 5) % 6, f = semi(392, GRID[i]);
    tone(f, 0.075, "triangle", 0.1); tone(f * 2, 0.05, "sine", 0.045, 1, 0.004); noise(0.018, 0.05, 5200, 1.2);
  },
  mile() { [0, 7, 12, 16].forEach((x, i) => tone(semi(784, x), 0.2, "triangle", 0.13, 1, i * 0.055)); noise(0.12, 0.08, 6500, 2, 0.02); },   // куплена веха
  mark(i, n, lvl) {                                          // отметка рисунка: i — которая по счёту из n; к последней нота доходит до верха
    const top = GRID.length - 1, at = n > 1 ? Math.round(i / (n - 1) * Math.min(top, n + 2)) : 0;
    const f = semi(523.25 * Math.pow(2, (lvl || 0) / 12), GRID[Math.min(top, at)]);
    tone(f, 0.16, "sine", 0.13); tone(f * 3, 0.07, "sine", 0.03); tone(f * 0.5, 0.06, "triangle", 0.05);
  },
  boom(lvl, plus) {                                          // рисунок собран: удар, аккорд и россыпь вверх; lvl 0…4 — по комбо, plus — сколько он прибавил
    const root = semi(261.63, [0, 2, 4, 7, 9][Math.max(0, Math.min(4, lvl || 0))]);
    loud(() => {
      tone(170, 0.26, "sine", 0.34, 0.24);
      noise(0.11, 0.2, 1700, 0.7);
      [0, 4, 7, 12].forEach((x, i) => tone(semi(root * 2, x), 0.3 + lvl * 0.04, i % 2 ? "triangle" : "sawtooth", 0.085, 1, 0.012 * i));
      [12, 16, 19, 24, 28].slice(0, 3 + Math.min(2, lvl)).forEach((x, i) => tone(semi(root * 2, x), 0.12, "sine", 0.09, 1, 0.07 + i * 0.045));
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
  drop() { tone(330, 0.5, "sawtooth", 0.09, 0.22); tone(165, 0.6, "sine", 0.13, 0.3); noise(0.3, 0.1, 320, 0.5); },   // комбо оборвалось
  hurry(last) { tone(last ? 1568 : 1175, 0.045, "square", 0.045); if (last) tone(1568, 0.045, "square", 0.045, 1, 0.09); },   // время на рисунок кончается
};
