// Стрим Twitch фоном линии. Плеер лежит под игрой и не ловит клики: все удары идут труперам.
// Пока стрим на фоне, его должно быть удобно смотреть: поле становится картинкой 16:9 без затемнения, а счёт душ,
// комбо, цифры урона, Душка и звук стрима уезжают в полосу под картинкой (hooks.stage → js/fx.js, setDock).
// Показываем свой канал, а когда он не в эфире — первый живой из списка друзей, по порядку. Как только свой стрим
// начинается, фон возвращается на него. Бонус «эфир ×2» даёт только свой канал.
// Идёт ли стрим — узнаём по картинке-превью Twitch: когда канал не в эфире, её адрес переадресует на заглушку.
import * as C from "./core.js";

// Параметры адреса для проверки (?channel=…, ?forcestream, ?fakeplay) работают только на своём компьютере. На сайте они
// выключены: иначе «своим» каналом становился бы любой, кто в эфире круглые сутки, — а это души ×2 и сундуки эфира без конца.
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const Q = new URLSearchParams(LOCAL ? location.search : "");
const FAKEPLAY = Q.has("fakeplay");                          // считать, что плеер играет, как только картинка стрима на поле: в Chrome без окна видео Twitch не стартует
const clean = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
const OWN = "aliveenjoyer";
const FRIENDS = ["sashawaify", "qissme_", "aiihosh1no", "archyyyh8", "libez"];   // по порядку: кто первый в эфире, того и показываем
const NAMES = { aliveenjoyer: "aliveenjoyer", sashawaify: "sashawaify", qissme_: "QissMe_", aiihosh1no: "aiihosh1no", archyyyh8: "archyyyh8", libez: "libez" };
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
// Качество стрима: S.set.twQ — что выбрал игрок: "auto" или группа Twitch ("chunked" — исходное, "720p60", "480p30"…),
// S.set.twQh — высота этого качества: у другого канала ступени могут называться иначе, тогда берём ближайшую не выше.
let quals = [], setQ = "", menuOpen = false;                // что предлагает плеер; что ему уже поставлено
const qH = (t) => parseInt((String(t).match(/(\d{3,4})p/) || [])[1], 10) || 0;
const qNorm = (q) => (typeof q === "string" ? { g: q, name: q, h: qH(q) } : { g: String(q.group || q.name || ""), name: String(q.name || q.group || ""), h: Number(q.height) || qH(q.name) || qH(q.group) });
const qShort = (q) => (q.g === "audio_only" ? "Звук" : q.name.replace(/\s*\(.*\)\s*$/, "") || q.g);
function readQuals() {                                       // список приходит от плеера, когда стрим пошёл
  let list = [];
  if (player && player !== "loading") { try { list = player.getQualities() || []; } catch (e) { list = []; } }
  quals = list.map(qNorm).filter((q) => q.g && q.g !== "auto");
}
function pickQ() {                                           // что поставить плееру: выбранное, а если такого тут нет — ближайшее не выше
  const w = S.set.twQ || "auto";
  if (w === "auto" || !quals.length) return "auto";
  if (quals.some((q) => q.g === w)) return w;
  const h = Number(S.set.twQh) || 0;
  const low = h ? quals.filter((q) => q.h && q.h <= h).sort((a, b) => b.h - a.h)[0] : null;
  return low ? low.g : "auto";
}
function applyQ() {                                          // зовётся, пока стрим идёт, и когда игрок выбрал качество
  if (!player || player === "loading") return;
  readQuals();
  const want = S.set.twQ || "";
  if (!want) return;                                         // игрок ничего не выбирал — оставляем как решил Twitch
  if (want !== "auto" && !quals.length) return;              // список от плеера ещё не пришёл — подождём
  const g = pickQ();
  if (g === (setQ || "auto")) { setQ = g; return; }          // уже стоит; у нового плеера и так «авто»
  try { player.setQuality(g); setQ = g; } catch (e) { /* плеер ещё не готов */ }
}
function qLabel() {
  if (!S.set.twQ || S.set.twQ === "auto") return "Авто";
  const q = quals.find((x) => x.g === pickQ());
  return q ? qShort(q) : S.set.twQh ? S.set.twQh + "p" : "Авто";
}
function drawMenu() {
  const m = $("twQMenu");
  m.textContent = "";
  const add = (g, text, sub) => {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.q = g; b.setAttribute("role", "menuitemradio");
    const on = g === (S.set.twQ && S.set.twQ !== "auto" ? pickQ() : "auto");
    b.setAttribute("aria-checked", on ? "true" : "false"); if (on) b.className = "on";
    b.appendChild(document.createTextNode(text));
    if (sub) { const s = document.createElement("small"); s.textContent = sub; b.appendChild(s); }
    m.appendChild(b);
  };
  const head = document.createElement("b"); head.textContent = "Качество стрима"; m.appendChild(head);
  add("auto", "Авто", "как решит Twitch");
  for (const q of quals) add(q.g, qShort(q), q.g === "chunked" ? "исходное" : q.g === "audio_only" ? "без картинки" : "");
  if (!quals.length) { const p = document.createElement("p"); p.textContent = playing ? "У этого стрима другого качества нет." : "Список появится, когда стрим пойдёт."; m.appendChild(p); }
}
function openMenu(on) {
  menuOpen = !!on && shown;
  if (menuOpen) { readQuals(); drawMenu(); }
  $("twQMenu").hidden = !menuOpen;
  $("btnStreamQ").setAttribute("aria-expanded", menuOpen ? "true" : "false");
}
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
function fit() {                                             // плеер 16:9 закрывает всё поле; поле само 16:9, так что картинка видна целиком
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
    if (shown && !(S.set.stream && cur && fits())) show(false);   // стрим кончился — убрать картинку; сменился на другой — только плеер
    else if (shown) stop();
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
  player.addEventListener(T.PLAYING, () => { playing = true; front(false); applySound(); applyQ(); if (menuOpen) drawMenu(); draw(); });
  player.addEventListener(T.PAUSE, () => { playing = false; askT = performance.now() + 1500; draw(); });
  playing = false; askT = performance.now() + 5000;
}
function stop() {
  if (player && player !== "loading") { try { player.pause(); } catch (e) { /* плеер уже снят */ } }
  player = null; playing = false; front(false);
  quals = []; setQ = ""; openMenu(false);
  $("twplayer").textContent = "";
}
function show(on) {                                          // картинка стрима на поле: поставить или убрать
  shown = on;
  $("twbg").hidden = !on;
  $("field").classList.toggle("tw", on);
  if (hooks && hooks.stage) hooks.stage(on);                 // счёт душ, цифры и Душка — в полосу под картинкой и обратно
  if (on) start(); else stop();
}
export function sync() {                                     // показать или убрать плеер по настройке и по эфиру
  const want = !!S.set.stream && !!cur && fits();
  if (want !== shown) show(want);
  else if (want && !player) start();                         // канал сменился: картинка осталась, плеер новый
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
  // звук стрима: значок и ползунок в полосе под картинкой, пока стрим на фоне
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
    if (playing) applyQ();                                   // список качеств приходит не сразу: ставим выбранное, как только оно появилось
    const qb = $("btnStreamQ"), ql = qLabel();
    if (qb.textContent !== ql) qb.textContent = ql;
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
  $("btnStreamQ").addEventListener("click", () => openMenu(!menuOpen));
  $("twQMenu").addEventListener("click", (e) => {              // выбор качества: запоминается вместе с настройками
    const b = e.target.closest("button[data-q]"); if (!b) return;
    const q = quals.find((x) => x.g === b.dataset.q);
    S.set.twQ = b.dataset.q; S.set.twQh = q ? q.h : 0;
    applyQ(); hooks.changed(); openMenu(false); draw();
    $("btnStreamQ").focus();
  });
  document.addEventListener("pointerdown", (e) => { if (menuOpen && !e.target.closest("#twQMenu, #btnStreamQ")) openMenu(false); }, true);
  document.addEventListener("keydown", (e) => { if (menuOpen && e.code === "Escape") { openMenu(false); $("btnStreamQ").focus(); } });
  window.addEventListener("resize", () => { if (shown) fit(); sync(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (shown) fit(); }).observe($("field"));   // поле меняет высоту без смены окна
  check();
}
export function setState(state) { S = state; if (S.set.stream === undefined) S.set.stream = true; C.setLive(S, live); sync(); }
export const isLive = () => live;
export const watching = () => shown && (playing || FAKEPLAY);              // стрим сейчас идёт фоном линии
export function info() {                                     // для проверки (?dev=1): что говорит сам плеер
  const on = player && player !== "loading";
  let q = null, list = [];
  if (on) { try { q = player.getQuality(); list = player.getQualities() || []; } catch (e) { /* плеер не готов */ } }
  return { channel: cur, shown, playing, want: S.set.twQ || "", sent: setQ, quality: q, qualities: list.map((x) => (typeof x === "string" ? x : x.group + "=" + x.name)) };
}
// Браузер не даёт плееру стартовать без действия человека: первый же удар по линии запускает показ.
export function nudge() {
  if (!shown || !player || player === "loading") return;
  try { if (player.isPaused()) player.play(); } catch (e) { /* плеер ещё грузится */ }
}
