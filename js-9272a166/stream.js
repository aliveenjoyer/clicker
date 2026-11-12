// Стрим Twitch фоном линии. Плеер лежит под игрой и не ловит клики: все удары идут труперам.
// Идёт ли стрим — узнаём по картинке-превью Twitch: когда канал не в эфире, её адрес переадресует на заглушку.
// На сервере (этап 2 плана) это заменит сигнал `live` от колеса.
import * as C from "./core.js";

const Q = new URLSearchParams(location.search);
export const CHANNEL = (Q.get("channel") || "aliveenjoyer").toLowerCase().replace(/[^a-z0-9_]/g, "");
const $ = (id) => document.getElementById(id);
let S = null, hooks = null, player = null, live = false, muted = true, scriptP = null, probeT = 0, shown = false;
let playing = false, askT = 0;                              // идёт ли показ; когда предложить кнопку «Включить стрим»

const ICON_ON = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5zM14.5 4.3v2.1a6 6 0 0 1 0 11.2v2.1a8 8 0 0 0 0-15.4z"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm15.6 3 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z"/></svg>';

function loadScript() {
  if (!scriptP) {
    scriptP = new Promise((ok, bad) => {
      const s = document.createElement("script");
      s.src = "https://player.twitch.tv/js/embed/v1.js"; s.onload = ok; s.onerror = bad;
      document.head.appendChild(s);
    });
  }
  return scriptP;
}
function fits() { const f = $("field").getBoundingClientRect(); return f.width >= 400 && f.height >= 300; }   // меньше Twitch не разрешает
function fit() {                                             // плеер 16:9 закрывает всё поле, лишнее обрезается
  const f = $("field").getBoundingClientRect(), w = Math.max(f.width, f.height * 16 / 9);
  const p = $("twplayer"); p.style.width = Math.ceil(w) + "px"; p.style.height = Math.ceil(w * 9 / 16) + "px";
}

async function probe() {                                     // идёт ли стрим
  if (Q.has("forcestream")) return true;
  try {
    const r = await fetch("https://static-cdn.jtvnw.net/previews-ttv/live_user_" + CHANNEL + "-320x180.jpg?t=" + Date.now(), { cache: "no-store" });
    return r.ok && !(r.redirected && /404_preview/.test(r.url));
  } catch (e) { return false; }
}
function setLive(v) {
  if (v === live) return;
  live = v; C.setLive(S, v);
  $("live").hidden = !v;
  sync();
}
async function check() {
  clearTimeout(probeT);
  setLive(await probe());
  probeT = setTimeout(check, 60000);
}

async function start() {
  if (player) return;
  player = "loading";
  try { await loadScript(); } catch (e) { player = null; return; }
  if (player !== "loading" || !live || !S.set.stream) { if (player === "loading") player = null; return; }
  fit();
  const T = window.Twitch.Player;
  player = new T("twplayer", { channel: CHANNEL, width: "100%", height: "100%", parent: [location.hostname], muted: true, autoplay: true, controls: false });
  player.addEventListener(T.OFFLINE, () => setLive(false));
  player.addEventListener(T.ENDED, () => setLive(false));
  player.addEventListener(T.PLAYING, () => { playing = true; front(false); draw(); });
  player.addEventListener(T.PAUSE, () => { playing = false; askT = performance.now() + 1500; draw(); });
  muted = true; playing = false; askT = performance.now() + 5000;
}
function stop() {
  if (player && player !== "loading") { try { player.pause(); } catch (e) { /* плеер уже снят */ } }
  player = null; playing = false; front(false);
  $("twplayer").textContent = "";
}
export function sync() {                                     // показать или убрать плеер по настройке и по эфиру
  const want = !!S.set.stream && live && fits();
  if (want !== shown) {
    shown = want;
    $("twbg").hidden = !want; $("twdim").hidden = !want;
    $("field").classList.toggle("tw", want);
    if (want) start(); else stop();
  }
  draw();
}
export function draw() {
  const b = $("btnStream"), ok = fits();
  b.hidden = !ok;
  b.classList.toggle("on", !!S.set.stream && live);
  b.classList.toggle("off", !S.set.stream);
  b.title = !S.set.stream ? "Стрим фоном выключен" : live ? "Стрим идёт фоном линии. Нажми, чтобы убрать" : "Стрим сейчас не идёт. Когда начнётся, появится фоном линии";
  // Twitch не запускает показ сам, пока плеер чем-то закрыт: тогда нужен один клик по его кнопке ▶
  $("twplay").hidden = !(shown && !playing && player && player !== "loading" && performance.now() > askT) || $("field").classList.contains("twfront");
  const sb = $("btnStreamSound");
  sb.hidden = !shown;
  if (shown) { sb.innerHTML = muted ? ICON_OFF : ICON_ON; sb.classList.toggle("off", muted); sb.title = muted ? "Включить звук стрима" : "Выключить звук стрима"; }
}

function front(on) {                                         // плеер вперёд: по нему можно кликнуть; назад — он снова под игрой
  $("field").classList.toggle("twfront", !!on);
  $("twback").hidden = !on;
}
export const isFront = () => $("field").classList.contains("twfront");

export function mount(state, h) {
  S = state; hooks = h;
  $("twplay").addEventListener("click", () => { front(true); draw(); });
  $("twback").addEventListener("click", () => { front(false); askT = performance.now() + 8000; draw(); });
  if (S.set.stream === undefined) S.set.stream = true;
  $("btnStream").addEventListener("click", () => { S.set.stream = !S.set.stream; hooks.changed(); sync(); });
  $("btnStreamSound").addEventListener("click", () => {
    if (!player || player === "loading") return;
    muted = !muted;
    try { player.setMuted(muted); if (!muted) player.setVolume(0.5); } catch (e) { /* плеер ещё не готов */ }
    draw();
  });
  window.addEventListener("resize", () => { if (shown) fit(); sync(); });
  check();
}
export function setState(state) { S = state; if (S.set.stream === undefined) S.set.stream = true; C.setLive(S, live); sync(); }
export const isLive = () => live;
// Браузер не даёт плееру стартовать без действия человека: первый же удар по линии запускает показ.
export function nudge() {
  if (!shown || !player || player === "loading") return;
  try { if (player.isPaused()) player.play(); } catch (e) { /* плеер ещё грузится */ }
}
