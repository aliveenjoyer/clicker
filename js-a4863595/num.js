// Числа игры — десятичные логарифмы (lg). 1e30000 хранится как 30000. Ноль — NEG.
// Так же считает tools/sim.py, поэтому формулы клиента и симулятора совпадают буква в букву.
export const NEG = -Infinity;
export const L10 = Math.log10;

export function lsum(a, b) {                       // lg(10^a + 10^b)
  if (a === NEG) return b;
  if (b === NEG) return a;
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return hi - lo < 17 ? hi + L10(1 + Math.pow(10, lo - hi)) : hi;
}
export function lsub(a, b) {                       // lg(10^a − 10^b), не меньше нуля
  if (b === NEG) return a;
  if (b >= a) return NEG;
  return a - b < 17 ? a + L10(1 - Math.pow(10, b - a)) : a;
}
export const lg = (x) => (x > 0 ? L10(x) : NEG);   // обычное число → lg
export const val = (a) => (a === NEG ? 0 : Math.pow(10, a));   // lg → обычное число (до 1e308)

const SUF = ["", "тыс", "млн", "млрд", "трлн", "квдр", "квнт", "скст", "сптл", "октл", "нонл", "дцл"];
const ABC = "abcdefghijklmnopqrstuvwxyz";
let SCI = false;
export function setSci(on) { SCI = !!on; }

// «812,4» + «скст». До тысячи — целое. После «дцл» — буквы aa, ab…; после 1e303 или в научной записи — 1,23e1000.
export function fmt(a) {
  if (a === NEG || a < 0 && Math.pow(10, a) < 0.5) return { n: "0", s: "" };
  if (a < 3) return { n: String(Math.floor(Math.pow(10, a) + 1e-9)), s: "" };
  if (SCI || a >= 303) {
    const e = Math.floor(a), m = Math.pow(10, a - e);
    return { n: m.toFixed(2).replace(".", ",") + "e" + group(e), s: "" };
  }
  const k = Math.floor(a / 3 + 1e-12);
  let m = Math.pow(10, a - k * 3);
  let digits = m >= 99.95 ? 0 : m >= 9.995 ? 1 : 2;
  let n = m.toFixed(digits);
  if (n === "1000") return fmt(k * 3 + 3);          // округление перевалило разряд
  const s = k < SUF.length ? SUF[k] : ABC[Math.floor((k - SUF.length) / 26)] + ABC[(k - SUF.length) % 26];
  return { n: n.replace(".", ","), s };
}
export const txt = (a) => { const f = fmt(a); return f.s ? f.n + " " + f.s : f.n; };
export function group(n) {                          // 1204 → «1 204»
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
// Порядок величины для «знака разряда»: 0 бронза, 1 серебро, 2 золото, 3 рубин, 4 пламя хаоса, 5 затмение.
export function tierOf(a) {
  return a < 6 ? 0 : a < 12 ? 1 : a < 33 ? 2 : a < 100 ? 3 : a < 1000 ? 4 : 5;
}
