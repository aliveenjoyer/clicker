// Таблица лидеров. Строка принадлежит аккаунту Twitch (вход — js/acct.js). Место — по душам, заработанным за всё время:
// возрождения их не сбрасывают, траты не уменьшают. Игра считается в браузере, проверить число сервер не может, поэтому
// он только ограничивает его: рекорд волны растёт не быстрее 150 волн сразу и 360 в час, а души принимаются не больше,
// чем мог заработать игрок принятой волны.
import { art } from "./art.js";
import { NEG, group, txt } from "./num.js";
import * as A from "./acct.js";

const MEDAL = ["medal-gold", "medal-silver", "medal-bronze"];
const $ = (id) => document.getElementById(id);
let S = null, rows = null, total = 0, rank = 0, best = 0, got = 0, err = "", busy = false, sentKey = "", lastSend = 0, lastLoad = 0, shownKey = "", toast = null;
let mineEl = null;
// Датчик темпа: с каждым отчётом уходит, сколько секунд игрок шёл вперёд и сколько волн прошёл с прошлого отчёта.
// Сервер держит сумму по игроку за сегодня и вчера и отвечает средним по всем игрокам: {avg — секунд на волну, n — игроков}.
let paceT = null, paceN = null, paceAllNow = null;
const pushT = () => S.stats.pushT || 0, pushN = () => S.stats.pushN || 0;
export const paceAll = () => paceAllNow;
// Путь до рекорда: так же уходит, сколько забегов дошло до своего рекорда с прошлого отчёта и за сколько секунд в сумме;
// сервер отвечает средним по игрокам: {avg — секунд от возрождения до рекорда, n — игроков}.
let reachT = null, reachN = null, reachAllNow = null;
export const reachAll = () => reachAllNow;

const soulsNow = () => (S.life === NEG || !(S.life > 0) ? 0 : S.life);       // lg душ, заработанных за всё время
const soulsTxt = (lg) => (lg > 0 ? txt(lg) : "0");
const stateKey = () => S.best + ":" + S.rb + ":" + Math.floor(soulsNow() * 50);   // души растут всё время: новый ключ — каждые ~5 % прироста

async function send() {                                     // отправить души и рекорд; сервер отвечает местом и таблицей
  if (busy || !A.logged()) return false;
  busy = true;
  const key = stateKey(), mine = soulsNow(), t1 = pushT(), n1 = pushN();
  const pt = paceT === null ? 0 : Math.max(0, t1 - paceT), pw = paceN === null ? 0 : Math.max(0, n1 - paceN);   // первый отчёт только ставит точку отсчёта
  const rt1 = S.stats.reachT || 0, rn1 = S.stats.reachN || 0;
  const rt = reachT === null ? 0 : Math.max(0, rt1 - reachT), rn = reachN === null ? 0 : Math.max(0, rn1 - reachN);
  const d = await A.api("/score", { sid: A.sid(), wave: S.best, rb: S.rb, played: Math.round(S.stats.played), souls: +mine.toFixed(3), pt: +pt.toFixed(1), pw, rt: +rt.toFixed(1), rn });
  busy = false; lastSend = Date.now();
  if (d.ok) {
    paceT = t1; paceN = n1; paceAllNow = d.pace || null;
    reachT = rt1; reachN = rn1; reachAllNow = d.reach || null;
    const first = !rank;
    err = ""; rows = d.top; total = d.total; rank = d.rank; best = d.best; got = d.souls || 0; lastLoad = Date.now();
    sentKey = d.best >= S.best && got + 0.02 >= mine ? key : "";   // сервер ещё догоняет — пришлём снова через минуту
    if (first && toast) toast("Ты в таблице: место " + rank + " из " + total);
  } else if (d.error !== "login") err = d.error === "rate" ? "" : "Таблица сейчас недоступна. Попробуй позже";
  draw(true);
  return !!d.ok;
}
export async function pushNow() {                           // перед обменом: сервер должен знать свежий рекорд
  if (A.logged() && !busy && Date.now() - lastSend > 5000 && stateKey() !== sentKey) await send();
}
async function load() {
  lastLoad = Date.now();
  const d = await A.top();
  if (d.ok) { rows = d.top; total = d.total; err = ""; paceAllNow = d.pace || null; reachAllNow = d.reach || null; }
  else if (!rows) err = "Таблица сейчас недоступна. Попробуй позже";
  draw(true);
}

function draw(force) {
  const box = $("topBox");
  if (!box || (box.offsetParent === null && !force)) return;
  const name = A.logged() ? A.who() : "";
  if (mineEl) mineEl.textContent = soulsTxt(soulsNow());    // своё число живое, остальная таблица перерисовывается по изменению
  const behind = !!name && ((best > 0 && best < S.best) || (rank > 0 && got + 0.05 < soulsNow()));
  const key = JSON.stringify([rows, total, rank, best, behind ? got : 0, err, name, A.state.phase, A.state.code, A.state.err]);
  if (key === shownKey) return;
  shownKey = key; mineEl = null;
  box.textContent = "";
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  if (!name) A.card(box, (S.gift ? "" : "Войди через Twitch — и в отряд сразу придут три наёмника десятого уровня: подарок, они тут же начнут фармить. ") +
    "Войдя, попадёшь в таблицу под своим ником с Twitch: место даётся за души, заработанные за всё время. Прогресс станет общим на аккаунт: зайдёшь с телефона или другого компьютера — он там же.");
  if (err) box.appendChild(el("p", "note err pad", err));
  if (!rows) { if (!err) box.appendChild(el("p", "note pad", "Загружаю таблицу…")); return; }
  if (!rows.length) box.appendChild(el("p", "note pad", "Таблица пока пустая. Стань первым."));
  // Скорость роста: сколько волн рекорда игрок прибавил за последний час и столбики по часам за восемь часов (считает сервер).
  // Столбики у всех в одном масштабе — видно, кто сейчас летит, а кто стоит. Самый быстрый подсвечен.
  const peak = Math.max(1, ...rows.map((r) => Math.max(0, ...(r.sp || [0]))));
  const fast = rows.reduce((a, r) => ((r.g || 0) > (a ? a.g || 0 : 0) ? r : a), null);
  if (fast && fast.g > 0) {
    const head = el("div", "tfast");
    head.appendChild(el("span", "", "Быстрее всех сейчас"));
    head.appendChild(el("b", "", fast.n));
    head.appendChild(el("em", "", "+" + group(fast.g) + " " + (fast.g % 10 === 1 && fast.g % 100 !== 11 ? "волна" : fast.g % 10 >= 2 && fast.g % 10 <= 4 && (fast.g % 100 < 12 || fast.g % 100 > 14) ? "волны" : "волн") + " за час"));
    box.appendChild(head);
  }
  let mine = false;
  for (const r of rows) {
    const me = !!name && r.n === name;
    if (me) { mine = true; rank = r.r; }
    const row = el("div", "trow" + (me ? " me" : "")), pos = el("i");
    if (r.r <= 3) { const m = new Image(); m.src = art(MEDAL[r.r - 1]); m.alt = r.r; pos.appendChild(m); } else pos.textContent = r.r;
    const who = el("b", "", r.n);
    who.appendChild(el("small", "", "волна " + group(r.w) + (r.rb ? ", возрождений: " + group(r.rb) : "")));
    const val = el("span"), ico = new Image();
    ico.src = art("cur-farm"); ico.alt = "";
    val.appendChild(ico); val.appendChild(document.createTextNode(soulsTxt(r.s)));
    val.title = "Душ заработано за всё время";
    const g = r.g || 0, grow = el("div", "tgrow" + (g > 0 ? " up" : "") + (r.on ? " on" : "") + (fast && fast.g > 0 && r === fast ? " hot" : ""));
    const bars = el("div", "tbars");
    (r.sp || []).forEach((v, i, a) => { const u = el("u", i === a.length - 1 ? "now" : ""); u.style.height = Math.max(v > 0 ? 14 : 6, Math.round(100 * v / peak)) + "%"; bars.appendChild(u); });
    grow.appendChild(bars);
    grow.appendChild(el("em", "", g > 0 ? "+" + group(g) + " за час" : r.on ? "в игре" : "не в игре"));
    grow.title = "Рост рекорда: столбики — сколько волн прибавлено за каждый из последних восьми часов, справа самый свежий" + (g > 0 ? ". За последний час: +" + group(g) : "");
    row.appendChild(pos); row.appendChild(who); row.appendChild(grow); row.appendChild(val);
    box.appendChild(row);
  }
  const foot = el("div", "topfoot");
  if (name) {
    const line = el("span", "", name + " · " + (mine || rank ? "место " + rank + " из " + total : "игроков в таблице: " + total) + " · душ за всё время: ");
    mineEl = el("b", "", soulsTxt(soulsNow())); line.appendChild(mineEl);
    foot.appendChild(line);
    const out = el("button", "linkbtn", "выйти"); out.dataset.logout = ""; foot.appendChild(out);
  } else foot.appendChild(el("span", "", "Игроков в таблице: " + total));
  box.appendChild(foot);
  if (behind) box.appendChild(el("p", "note", "В таблице пока учтено " + soulsTxt(got) + " душ и волна " + group(best) + ". Сервер принимает рост рекорда постепенно, по темпу Затмений, и скоро догонит."));
  box.appendChild(el("p", "note", "Место — по душам, заработанным за всё время. Возрождения их не сбрасывают, покупки не уменьшают. В таблицу попадают те, кто вошёл через Twitch."));
}

export function mount(state, hooks) {
  S = state; toast = hooks && hooks.toast;
  const box = $("topBox");
  A.bind(box);
  box.addEventListener("click", (e) => { if (e.target.closest("[data-logout]")) A.logout(); });
  A.onChange(() => { if (!A.logged()) { rank = 0; best = 0; got = 0; sentKey = ""; } else lastSend = 0; shownKey = ""; draw(false); });
}
export function setState(state) { S = state; sentKey = ""; shownKey = ""; paceT = paceN = null; reachT = reachN = null; }
export const myRank = () => (A.logged() ? rank : 0);         // место в таблице, как его знает сервер; 0 — не в таблице
export function open() { shownKey = ""; if (!lastLoad || Date.now() - lastLoad > 15000) load(); else draw(true); }
export function tick(visible) {                             // зовётся из UI несколько раз в секунду
  const now = Date.now();
  if (A.logged() && !busy && now - lastSend > 60000 && stateKey() !== sentKey) send();   // новое число — не чаще раза в минуту
  if (visible && !busy && now - lastLoad > 60000) load();
  else if (!visible && !busy && now - lastLoad > 600000) load();   // вкладка закрыта: среднее по игрокам для датчика темпа — раз в десять минут
  if (visible) draw(false);
}
