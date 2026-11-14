// Наблюдение: обезличенная статистика игры. Пока вкладка на экране, браузер раз в минуту шлёт серверу короткую сводку:
// случайный номер этого браузера (не ник и не адрес), сборку, как далеко дошёл игрок, чем он пользуется, размер окна и
// ошибки скрипта. Сервер держит по одной строке на браузер в день (tools/server_patch_tele.py), отчёт — команда
// `wl-clicker-stats` на VPS. Нужна, чтобы видеть тех, кто не вошёл через Twitch: сколько их, где бросают, что ломается.
// Ничего не ломает: любая ошибка здесь глотается, игра от сервера наблюдения не зависит.
import * as C from "./core.js";
import * as A from "./acct.js";

const K = "hlystopad.did";
const hex = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join(""); };
const BUILD = (import.meta.url.match(/\/js-([0-9a-z]{6,12})\//) || [0, "dev"])[1];
const FIRST = 8, EVERY = 60;                                 // первая сводка — через 8 секунд игры, дальше раз в минуту
let get = null, did = "", sess = "", act = 0, lastTick = 0, sentAt = -1, errs = [], seen = new Set(), errN = 0;

function device() {                                          // случайный номер браузера: живёт в его хранилище, ни с чем не связан
  try {
    let d = localStorage.getItem(K);
    if (!/^[a-f0-9]{16,32}$/.test(d || "")) { d = hex(10); localStorage.setItem(K, d); }
    return d;
  } catch (e) { return hex(10); }
}
function snapshot() {
  const h = get(), S = h.state(), st = S.stats, w = window.innerWidth, hgt = window.innerHeight;
  return {
    d: did, s: sess, b: BUILD, t: Math.round(act), li: A.logged() ? 1 : 0,
    w: S.best, z: S.zrec, rb: S.rb, ecl: S.ecl || 0, p: Math.round(st.played || 0), ach: C.achCount(S),
    vw: w, vh: hgt, mob: window.matchMedia("(pointer: coarse)").matches ? 1 : 0, lay: w <= 720 ? "phone" : w <= 1180 ? "tablet" : "desk",
    tab: h.tab(), wt: h.watching() ? 1 : 0,
    f: { str: S.set.stream ? 1 : 0, src: S.set.twPick === "lofi" ? "lofi" : "auto", snd: S.set.sound ? 1 : 0, calm: S.set.calm ? 1 : 0,
      ap: S.auto && S.auto.on ? 1 : 0, au: st.auHours || 0, auon: C.auOn(S) ? 1 : 0, fig: st.figs || 0, fb: st.figBest || 0,
      sw: st.gridSw || 0, tp: st.gridTap || 0, sk: st.skills || 0, clk: st.clicks || 0, swap: st.swapped ? 1 : 0, mode: S.mode === "farm" ? "farm" : "push" },
    e: errs.splice(0, 3),
  };
}
function send(leaving) {
  if (!get) return;
  try {
    const body = JSON.stringify(snapshot()), url = A.apiUrl() + "/beat";
    sentAt = act;
    if (leaving && navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
    else fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body, keepalive: true }).catch(() => {});
  } catch (e) { /* наблюдение игре не мешает */ }
}
function tick() {                                            // раз в секунду: считаем время на экране и решаем, не пора ли слать
  const now = performance.now();
  if (document.visibilityState === "visible") {
    if (lastTick) act += Math.min(5, (now - lastTick) / 1000);
    if ((sentAt < 0 && act >= FIRST) || (sentAt >= 0 && act - sentAt >= EVERY)) send(false);
  }
  lastTick = now;
}
function fail(msg, where) {                                  // ошибка скрипта: одна и та же — один раз за заход, не больше шести разных
  const m = String(msg || "").slice(0, 200), key = m + "|" + where;
  if (!m || seen.has(key) || errN >= 6) return;
  seen.add(key); errN += 1; errs.push({ m, s: String(where || "").slice(0, 120) });
}
const file = (u) => String(u || "").split("?")[0].split("/").slice(-2).join("/");

export function mount(hooks) {                              // hooks: { state() — игра сейчас, tab() — открытая вкладка, watching() — идёт ли фоном стрим }
  try {
    get = () => hooks; did = device(); sess = hex(4); lastTick = performance.now();
    window.addEventListener("error", (e) => fail(e.message, file(e.filename) + ":" + (e.lineno || 0)));
    window.addEventListener("unhandledrejection", (e) => { const r = e.reason; fail(r && r.message ? r.message : r, r && r.stack ? file(String(r.stack).split("\n")[1] || "") : "promise"); });
    setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && act >= 3 && act !== sentAt) send(true); lastTick = performance.now(); });
    window.addEventListener("pagehide", () => { if (act >= 3 && act !== sentAt) send(true); });
  } catch (e) { get = null; }
}
export function deviceId() { if (!did) did = device(); return did; }   // случайный номер этого браузера (им же помечается облачное сохранение)
export const info = () => ({ did, sess, build: BUILD, act: Math.round(act), queued: errs.length });   // для проверки (?dev=1)
export const beatNow = () => send(false);                    // для проверки: отправить сводку сейчас
