// Звук — синтез WebAudio, без файлов (PLAN.md § 16.8). Громкость 30 %, не больше восьми голосов сразу.
let ctx = null, master = null, on = true, voices = 0;
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
  if (!on || voices >= 8) return;
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
  if (!on || voices >= 8) return;
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
};
