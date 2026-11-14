// Стрим Twitch фоном линии. Плеер лежит под игрой и не ловит клики: все удары идут труперам.
// Пока стрим на фоне, его должно быть удобно смотреть: поле становится картинкой 16:9 без затемнения, а счёт душ,
// комбо, цифры урона, Душка и звук стрима уезжают в полосу под картинкой (hooks.stage → js/fx.js, setDock).
// Показываем свой канал, а когда он не в эфире — первый живой из списка друзей, по порядку. Как только свой стрим
// начинается, фон возвращается на него. Бонус «эфир ×2» даёт только свой канал.
// Вместо этого «рекомендуемого» канала игрок может поставить фоном LoFi-музыку (канал lofigirl, идёт круглые сутки):
// выбор — в пилюле под картинкой, рядом с именем рекомендуемого канала, запоминается в настройках (S.set.twPick). LoFi —
// чужой канал: ни «эфира ×2», ни сундуков эфира он не даёт, чат во вкладке остаётся свой. Свой эфир начался — фон
// возвращается на него и выбор сбрасывается.
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
const LOFI = "lofigirl";                                     // LoFi-музыка: тот же канал, на котором игра проверяется
const NAMES = { aliveenjoyer: "aliveenjoyer", sashawaify: "sashawaify", qissme_: "QissMe_", aiihosh1no: "aiihosh1no", archyyyh8: "archyyyh8", libez: "libez", lofigirl: "LoFi-музыка" };
const LIST = clean(Q.get("channel")) ? [clean(Q.get("channel"))] : [OWN].concat(FRIENDS);   // ?channel=<имя> — проверка на чужом канале
const DEAD_MS = 5 * 60000;                                   // плеер сказал «не в эфире» — столько канал не предлагаем: превью у Twitch запаздывает
export let CHANNEL = LIST[0];                                // чей стрим сейчас фоном (и чей чат во вкладке); никто не в эфире — свой
const $ = (id) => document.getElementById(id);
let S = null, hooks = null, player = null, cur = "", live = false, scriptP = null, probeT = 0, shown = false;
let rec = "", ownWas = null;                                 // кто сейчас рекомендуемый ("" — никто не в эфире); был ли свой канал в эфире при прошлой проверке
const lofi = () => S.set.twPick === "lofi";
// Звук стрима: S.set.twSound — включён ли, S.set.twVol — громкость 0–100. Запоминаются вместе с настройками.
const vol = () => Math.max(0, Math.min(100, Number(S.set.twVol === undefined ? 50 : S.set.twVol) || 0));
const sound = () => !!S.set.twSound && vol() > 0;
function applySound() {                                      // передать плееру громкость и «без звука»
  if (!player || player === "loading") return;
  const on = sound() && !hush;
  try { player.setVolume(vol() / 100); if (on && player.getMuted()) unmutedAt = performance.now(); player.setMuted(!on); } catch (e) { /* плеер ещё не готов */ }
}
let playing = false, askT = 0;                              // идёт ли показ; когда предложить кнопку «Включить стрим»
// Сторож плеера. Twitch перед показом крутит рекламу, и после неё плеер часто встаёт на паузу или так и не стартует, а своих
// кнопок у него нет (controls: false) — раньше спасала только кнопка «Включить стрим». Теперь сам плеер подталкивается:
//   — встал на паузу, а игрок его не останавливал (плеер не выведен вперёд) — через 0,6 с и дальше раз в 2 с play();
//   — браузер не пускает показ со звуком без нажатия — показ идёт без звука (hush), звук вернётся с первым ударом по линии;
//   — картинка не пошла за 90 секунд (ни показа, ни движения времени; реклама столько обычно не длится) — плеер создаётся
//     заново, не чаще двух раз за 15 минут.
const STUCK_MS = Number(Q.get("stuckms")) || 90000, REBORN_MAX = 2, REBORN_WIN = 15 * 60000;   // ?stuckms= — только на своём компьютере, для проверки
let hush = false, unmutedAt = 0, watchT = 0, movedAt = 0, lastPos = -1, reborn = [];
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
  if (!scriptP && window.Twitch && window.Twitch.Player) scriptP = Promise.resolve();   // плеер уже есть на странице (подставной в проверке)
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
async function pick() {                                      // кого показывать; "" — никто не в эфире
  if (Q.has("forcestream")) { rec = LIST[0]; return rec; }
  const now = Date.now();
  let r = "";                                                // рекомендуемый: свой канал, иначе друзья по порядку
  for (const ch of LIST) {
    if (dead[ch] > now) continue;
    if (await probe(ch)) { r = ch; break; }
  }
  rec = r;
  const ownNow = r === LIST[0];
  if (lofi() && ownNow && ownWas === false) { S.set.twPick = "auto"; if (hooks) hooks.changed(); }   // свой эфир начался — фон возвращается на него
  ownWas = ownNow;
  return lofi() && !(dead[LOFI] > now) ? LOFI : r;
}
function setChannel(ch) {
  const own = ch === LIST[0] ? !!ch : !!rec && rec === LIST[0] && ch === LOFI;   // свой канал в эфире («эфир ×2») — и когда фоном вместо него выбрана LoFi-музыка
  if (ch === cur && own === live) { draw(); return; }
  const changed = ch !== cur;
  cur = ch; live = own; CHANNEL = ch && !(ch === LOFI && !own) ? ch : LIST[0];   // чат во вкладке: под LoFi-музыку остаётся свой
  C.setLive(S, own);
  drawLive();
  if (changed) {
    if (shown && !(S.set.stream && cur && fits())) show(false);   // стрим кончился — убрать картинку; сменился на другой — только плеер
    else if (shown) stop();
    if (hooks && hooks.channel) hooks.channel(CHANNEL);     // чат во вкладке идёт за показанным каналом
  }
  sync();
}
let liveKey = "?";
function drawLive() {                                        // плашка наверху: свой эфир — души ×2, со звуком — всё ×2; чужой — просто чей стрим на фоне
  const el = $("live"), on = loud(), can = live && !on && fits();   // can — бонус за звук можно включить нажатием
  const key = [cur, live, on, can].join("|");
  if (key === liveKey) return;
  liveKey = key;
  el.hidden = !cur;
  if (!cur) return;
  el.textContent = "";
  el.classList.toggle("loud", on); el.classList.toggle("offer", can);
  el.title = on ? "Стрим идёт фоном со звуком: урон и души ×2" : can ? "Включи стрим фоном со звуком — урон и души пойдут ×2. Нажми, и он включится" : "";
  const dot = document.createElement("span"); dot.className = "dot"; el.appendChild(dot);
  const add = (text, bold) => { el.appendChild(document.createTextNode(text)); const b = document.createElement("b"); b.textContent = bold; el.appendChild(b); };
  if (on) add("Стрим со звуком — всё ", "×2");
  else if (live) { add("Стрим идёт — души ", "×2"); if (can) add(" · со звуком всё ", "×2"); }
  else add(cur === LOFI ? "На фоне " : "На фоне стрим ", nice(cur));
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
  player.addEventListener(T.PLAYING, () => { playing = true; movedAt = performance.now(); front(false); applySound(); applyQ(); if (menuOpen) drawMenu(); draw(); });
  player.addEventListener(T.PAUSE, () => {
    playing = false; askT = performance.now() + 4000;
    if (performance.now() - unmutedAt < 3000) hush = true;   // включили звук — и браузер тут же остановил показ: дальше без звука до нажатия
    setTimeout(resume, 600); draw();
  });
  if (T.PLAYBACK_BLOCKED) player.addEventListener(T.PLAYBACK_BLOCKED, () => { hush = true; setTimeout(resume, 300); });
  playing = false; askT = performance.now() + 5000; movedAt = performance.now(); lastPos = -1;
  if (!watchT) watchT = setInterval(guard, 2000);
}
function resume() {                                          // плеер на паузе, а игрок его не ставил — запустить
  if (!shown || !player || player === "loading" || isFront()) return;
  try { if (player.isPaused()) { if (hush) player.setMuted(true); player.play(); } } catch (e) { /* плеер ещё грузится */ }
}
function guard() {
  if (!shown || !player || player === "loading" || isFront()) return;
  const now = performance.now();
  if (document.hidden) { movedAt = now; return; }            // вкладка свёрнута: ничего не трогаем и не копим «застой»
  let paused = true, pos = -1;
  try { paused = player.isPaused(); pos = player.getCurrentTime(); } catch (e) { return; }
  if ((playing && !paused) || pos !== lastPos) movedAt = now;
  lastPos = pos;
  if (paused) resume();
  if (now - movedAt > STUCK_MS) {                            // так и не пошёл: создать плеер заново
    movedAt = now;
    reborn = reborn.filter((t) => now - t < REBORN_WIN);
    if (reborn.length < REBORN_MAX) { reborn.push(now); stop(); start(); }
  }
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
  drawLive();
  const b = $("btnStream"), ok = fits();
  b.hidden = !ok;
  b.classList.toggle("on", !!S.set.stream && !!cur);
  b.classList.toggle("off", !S.set.stream);
  b.title = !S.set.stream ? "Стрим фоном выключен" : cur === LOFI && !live ? "Фоном линии идёт LoFi-музыка. Нажми, чтобы убрать" : cur ? "Фоном линии идёт стрим " + nice(cur) + ". Нажми, чтобы убрать"
    : "Сейчас никто не в эфире. Нажми — фоном пойдёт LoFi-музыка";
  // Twitch не запускает показ сам, пока плеер чем-то закрыт: тогда нужен один клик по его кнопке ▶
  $("twplay").hidden = !(shown && !playing && player && player !== "loading" && performance.now() > askT) || $("field").classList.contains("twfront");
  // звук стрима: значок и ползунок в полосе под картинкой, пока стрим на фоне
  $("twctl").hidden = !shown;
  if (shown) {
    const on = sound(), sb = $("btnStreamSound"), sl = $("twVol");
    sb.innerHTML = on ? ICON_ON : ICON_OFF;
    sb.classList.toggle("on", on);
    const offer = !on && live && ownShown();               // свой стрим без звука: звук даёт ×2 на всё
    sb.classList.toggle("offer", offer);
    sb.title = on ? "Выключить звук стрима" : offer ? "Включи звук стрима — урон и души пойдут ×2" : "Включить звук стрима";
    const v = String(on ? vol() : 0);
    if (document.activeElement !== sl && sl.value !== v) sl.value = v;
    sl.style.setProperty("--v", (on ? vol() : 0) + "%");
    sl.title = "Громкость стрима: " + (on ? vol() : 0) + " %";
    // чей стрим на фоне: рекомендуемый канал или LoFi-музыка
    const rb = $("twSrcRec"), lb = $("twSrcLofi"), isLofi = cur === LOFI && lofi();
    const rt = rec ? nice(rec) : "нет эфира";
    if (rb.textContent !== rt) rb.textContent = rt;
    rb.classList.toggle("on", !isLofi); lb.classList.toggle("on", isLofi);
    rb.disabled = !rec && isLofi;
    rb.setAttribute("aria-pressed", isLofi ? "false" : "true"); lb.setAttribute("aria-pressed", isLofi ? "true" : "false");
    const one = (isLofi ? rb : lb).offsetParent === null;    // узкая полоса: кнопка одна, она же переключатель
    rb.title = (rec ? "Рекомендуемый канал: сейчас в эфире " + nice(rec) + (rec === LIST[0] ? " — свой стрим, фарм ×2 и сундуки эфира" : "") : "Из рекомендуемых каналов сейчас никто не в эфире") +
      (one && !isLofi ? ". Нажми — фоном пойдёт LoFi-музыка" : "");
    lb.title = "LoFi-музыка: канал lofigirl, играет круглые сутки. Бонусов эфира и сундуков не даёт" + (one && isLofi ? (rec ? ". Нажми — вернётся " + nice(rec) : ". Из рекомендуемых каналов сейчас никто не в эфире") : "");
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
  $("btnStream").addEventListener("click", () => {
    if (S.set.stream && !cur) { S.set.twPick = "lofi"; hooks.changed(); setChannel(LOFI); check(); return; }   // никто не в эфире — включаем LoFi-музыку
    S.set.stream = !S.set.stream; hooks.changed(); sync();
  });
  $("live").addEventListener("click", () => {                // предложение в плашке наверху: включить свой стрим фоном со звуком
    if (!live || loud() || !fits()) return;
    S.set.stream = true; S.set.twPick = "auto"; S.set.twSound = true; if (vol() === 0) S.set.twVol = 50; hush = false;
    hooks.changed(); setChannel(LIST[0]); sync(); applySound(); draw();
  });
  $("twSrc").addEventListener("click", (e) => {               // выбор: рекомендуемый канал или LoFi-музыка
    const b = e.target.closest("button[data-src]"); if (!b || b.disabled) return;
    const now = lofi() ? "lofi" : "auto";
    let want = b.dataset.src === "lofi" ? "lofi" : "auto";
    if (want === now) {                                      // на узкой полосе видна одна кнопка — выбранная: нажатие переключает на другую
      if ($(want === "lofi" ? "twSrcRec" : "twSrcLofi").offsetParent !== null) return;
      want = now === "lofi" ? "auto" : "lofi";
    }
    if (want === "auto" && !rec) return;                    // из рекомендуемых никто не в эфире
    S.set.twPick = want; ownWas = rec === LIST[0];
    hooks.changed();
    setChannel(want === "lofi" ? LOFI : rec);               // сразу, не дожидаясь проверки эфира
    check();
  });
  $("btnStreamSound").addEventListener("click", () => {      // значок: звук включить или выключить
    const on = !sound();
    if (on && vol() === 0) S.set.twVol = 50;
    S.set.twSound = on; hush = false;
    applySound(); hooks.changed(); draw();
  });
  const sl = $("twVol");
  sl.addEventListener("input", () => {                       // ползунок: громкость; в ноль — без звука
    const v = Math.max(0, Math.min(100, Number(sl.value) || 0));
    if (v > 0) S.set.twVol = v;
    S.set.twSound = v > 0; hush = false;
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
export const ownShown = () => !!cur && cur === LIST[0];      // фоном стоит именно свой канал: сундук эфира копится только так
export const watching = () => shown && (playing || FAKEPLAY);              // стрим сейчас идёт фоном линии
// Свой стрим идёт фоном именно со звуком: за это всё ×2 (js/core.js, setLoud). Смотрим и настройку, и сам плеер.
function heard() {
  if (!sound()) return false;
  if (FAKEPLAY) return true;
  try { return !!player && player !== "loading" && !player.getMuted() && player.getVolume() > 0; } catch (e) { return false; }
}
export const loud = () => watching() && live && ownShown() && heard();
export function info() {                                     // для проверки (?dev=1): что говорит сам плеер
  const on = player && player !== "loading";
  let q = null, list = [];
  if (on) { try { q = player.getQuality(); list = player.getQualities() || []; } catch (e) { /* плеер не готов */ } }
  return { channel: cur, shown, playing, want: S.set.twQ || "", sent: setQ, quality: q, qualities: list.map((x) => (typeof x === "string" ? x : x.group + "=" + x.name)) };
}
// Браузер не даёт плееру стартовать без действия человека: первый же удар по линии запускает показ.
export function nudge() {
  if (!shown || !player || player === "loading") return;
  if (hush) { hush = false; applySound(); }                  // удар — это нажатие: теперь браузер пустит и звук
  try { if (player.isPaused()) player.play(); } catch (e) { /* плеер ещё грузится */ }
}
export const guardInfo = () => ({ hush, reborn: reborn.length, stuck: Math.round(performance.now() - movedAt) });   // для проверки
