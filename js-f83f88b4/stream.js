// Стрим Twitch фоном линии. Плеер лежит под игрой и не ловит клики: все удары идут труперам.
// Показываем свой канал, а когда он не в эфире — первый живой из списка друзей, по порядку. Как только свой стрим
// начинается, фон возвращается на него. Бонус «эфир ×2» даёт только свой канал.
// Идёт ли стрим — узнаём по картинке-превью Twitch: когда канал не в эфире, её адрес переадресует на заглушку.
import * as C from "./core.js";

const Q = new URLSearchParams(location.search);
const clean = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
const OWN = "aliveenjoyer";
const FRIENDS = ["sashawaify", "qissme_", "aiihosh1no", "archyyyh8"];   // по порядку: кто первый в эфире, того и показываем
const NAMES = { aliveenjoyer: "aliveenjoyer", sashawaify: "sashawaify", qissme_: "QissMe_", aiihosh1no: "aiihosh1no", archyyyh8: "archyyyh8" };
const LIST = clean(Q.get("channel")) ? [clean(Q.get("channel"))] : [OWN].concat(FRIENDS);   // ?channel=<имя> — проверка на чужом канале
const DEAD_MS = 5 * 60000;                                   // плеер сказал «не в эфире» — столько канал не предлагаем: превью у Twitch запаздывает
export let CHANNEL = LIST[0];                                // чей стрим сейчас фоном (и чей чат во вкладке); никто не в эфире — свой
const $ = (id) => document.getElementById(id);
let S = null, hooks = null, player = null, cur = "", live = false, scriptP = null, probeT = 0, shown = false;
// Звук стрима: S.set.twSound — включён ли, S.set.twVol — громкость 0–100. Запоминаются вместе с настройками.
const vol = () => Math.max(0, Math.min(100, Number(S.set.twVol === undefined ? 50 : S.set.twVol) || 0));
const sound = () => !!S.set.twSound && vol() > 0;
function applySound() {                                      // передать плееру громкость и «без звука»
  if (!player || player === "loading") return;
  try { player.setVolume(vol() / 100); player.setMuted(!sound()); } catch (e) { /* плеер ещё не готов */ }
}
let playing = false, askT = 0;                              // идёт ли показ; когда предложить кнопку «Включить стрим»
const dead = {};

const ICON_ON = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5zM14.5 4.3v2.1a6 6 0 0 1 0 11.2v2.1a8 8 0 0 0 0-15.4z"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm15.6 3 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z"/></svg>';
const nice = (ch) => NAMES[ch] || ch;

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

async function probe(ch) {                                   // идёт ли стрим на канале
  try {
    const r = await fetch("https://static-cdn.jtvnw.net/previews-ttv/live_user_" + ch + "-320x180.jpg?t=" + Date.now(), { cache: "no-store" });
    return r.ok && !(r.redirected && /404_preview/.test(r.url));
  } catch (e) { return false; }
}
async function pick() {                                      // кого показывать: свой канал, иначе друзья по порядку; "" — никто не в эфире
  if (Q.has("forcestream")) return LIST[0];
  const now = Date.now();
  for (const ch of LIST) {
    if (dead[ch] > now) continue;
    if (await probe(ch)) return ch;
  }
  return "";
}
function setChannel(ch) {
  const own = !!ch && ch === LIST[0];
  if (ch === cur && own === live) return;
  const changed = ch !== cur;
  cur = ch; live = own; CHANNEL = ch || LIST[0];
  C.setLive(S, own);
  drawLive();
  if (changed) {
    if (shown) { shown = false; stop(); $("twbg").hidden = true; $("twdim").hidden = true; $("field").classList.remove("tw"); }
    if (hooks && hooks.channel) hooks.channel(CHANNEL);     // чат во вкладке идёт за показанным каналом
  }
  sync();
}
function drawLive() {                                        // плашка наверху: свой эфир — фарм ×2; чужой — просто чей стрим на фоне
  const el = $("live");
  el.hidden = !cur;
  if (!cur) return;
  el.textContent = "";
  const dot = document.createElement("span"); dot.className = "dot"; el.appendChild(dot);
  el.appendChild(document.createTextNode(live ? "Стрим идёт — фарм " : "На фоне стрим "));
  const b = document.createElement("b"); b.textContent = live ? "×2" : nice(cur); el.appendChild(b);
}
async function check() {
  clearTimeout(probeT);
  setChannel(await pick());
  probeT = setTimeout(check, 60000);
}

async function start() {
  if (player) return;
  player = "loading";
  const ch = cur;
  try { await loadScript(); } catch (e) { player = null; return; }
  if (player !== "loading" || ch !== cur || !cur || !S.set.stream) { if (player === "loading") player = null; return; }
  fit();
  const T = window.Twitch.Player;
  player = new T("twplayer", { channel: ch, width: "100%", height: "100%", parent: [location.hostname], muted: true, autoplay: true, controls: false });
  const gone = () => { if (ch !== cur) return; dead[ch] = Date.now() + DEAD_MS; check(); };   // эфир кончился — ищем следующего
  player.addEventListener(T.OFFLINE, gone);
  player.addEventListener(T.ENDED, gone);
  player.addEventListener(T.PLAYING, () => { playing = true; front(false); applySound(); draw(); });
  player.addEventListener(T.PAUSE, () => { playing = false; askT = performance.now() + 1500; draw(); });
  playing = false; askT = performance.now() + 5000;
}
function stop() {
  if (player && player !== "loading") { try { player.pause(); } catch (e) { /* плеер уже снят */ } }
  player = null; playing = false; front(false);
  $("twplayer").textContent = "";
}
export function sync() {                                     // показать или убрать плеер по настройке и по эфиру
  const want = !!S.set.stream && !!cur && fits();
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
  b.classList.toggle("on", !!S.set.stream && !!cur);
  b.classList.toggle("off", !S.set.stream);
  b.title = !S.set.stream ? "Стрим фоном выключен" : cur ? "Фоном линии идёт стрим " + nice(cur) + ". Нажми, чтобы убрать"
    : "Сейчас никто не в эфире. Когда стрим начнётся, он появится фоном линии";
  // Twitch не запускает показ сам, пока плеер чем-то закрыт: тогда нужен один клик по его кнопке ▶
  $("twplay").hidden = !(shown && !playing && player && player !== "loading" && performance.now() > askT) || $("field").classList.contains("twfront");
  // звук стрима: значок и ползунок прямо на поле, пока стрим на фоне
  $("twctl").hidden = !shown;
  if (shown) {
    const on = sound(), sb = $("btnStreamSound"), sl = $("twVol");
    sb.innerHTML = on ? ICON_ON : ICON_OFF;
    sb.classList.toggle("on", on);
    sb.title = on ? "Выключить звук стрима" : "Включить звук стрима";
    const v = String(on ? vol() : 0);
    if (document.activeElement !== sl && sl.value !== v) sl.value = v;
    sl.style.setProperty("--v", (on ? vol() : 0) + "%");
    sl.title = "Громкость стрима: " + (on ? vol() : 0) + " %";
    $("twWho").textContent = nice(cur);
  }
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
  $("btnStreamSound").addEventListener("click", () => {      // значок: звук включить или выключить
    const on = !sound();
    if (on && vol() === 0) S.set.twVol = 50;
    S.set.twSound = on;
    applySound(); hooks.changed(); draw();
  });
  const sl = $("twVol");
  sl.addEventListener("input", () => {                       // ползунок: громкость; в ноль — без звука
    const v = Math.max(0, Math.min(100, Number(sl.value) || 0));
    if (v > 0) S.set.twVol = v;
    S.set.twSound = v > 0;
    applySound(); draw();
  });
  sl.addEventListener("change", () => hooks.changed());
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
