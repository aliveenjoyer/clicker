// Таблица рекордов. Строка принадлежит аккаунту Twitch (вход — js/acct.js). Сервер хранит лучший рекорд волны и
// принимает его рост не быстрее, чем мог бы честный игрок: 150 волн сразу и 360 в час дальше. Игра считается в браузере,
// поэтому проверить сам рекорд сервер не может — он только не даёт ему прыгать.
import { art } from "./art.js";
import { group } from "./num.js";
import * as A from "./acct.js";

const MEDAL = ["medal-gold", "medal-silver", "medal-bronze"];
const $ = (id) => document.getElementById(id);
let S = null, rows = null, total = 0, rank = 0, best = 0, err = "", busy = false, sentKey = "", lastSend = 0, lastLoad = 0, shownKey = "", toast = null;

const stateKey = () => S.best + ":" + S.rb;

async function send() {                                     // отправить рекорд; сервер отвечает местом и таблицей
  if (busy || !A.logged()) return false;
  busy = true;
  const d = await A.api("/score", { sid: A.sid(), wave: S.best, rb: S.rb, played: Math.round(S.stats.played) });
  busy = false; lastSend = Date.now();
  if (d.ok) {
    const first = !rank;
    err = ""; rows = d.top; total = d.total; rank = d.rank; best = d.best; lastLoad = Date.now();
    sentKey = d.best >= S.best ? stateKey() : "";           // сервер ещё догоняет рекорд — пришлём снова через минуту
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
  if (d.ok) { rows = d.top; total = d.total; err = ""; }
  else if (!rows) err = "Таблица сейчас недоступна. Попробуй позже";
  draw(true);
}

function draw(force) {
  const box = $("topBox");
  if (!box || (box.offsetParent === null && !force)) return;
  const name = A.logged() ? A.who() : "";
  const key = JSON.stringify([rows, total, rank, best, err, name, A.state.phase, A.state.code, A.state.err, S.best]);
  if (key === shownKey) return;
  shownKey = key;
  box.textContent = "";
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  if (!name) A.card(box, "Войди — и твой рекорд волны попадёт в таблицу под твоим ником с Twitch. Прогресс при этом остаётся в этом браузере.");
  if (err) box.appendChild(el("p", "note err pad", err));
  if (!rows) { if (!err) box.appendChild(el("p", "note pad", "Загружаю таблицу…")); return; }
  if (!rows.length) box.appendChild(el("p", "note pad", "Таблица пока пустая. Стань первым."));
  let mine = false;
  for (const r of rows) {
    const me = !!name && r.n === name;
    if (me) { mine = true; rank = r.r; }
    const row = el("div", "trow" + (me ? " me" : "")), pos = el("i");
    if (r.r <= 3) { const m = new Image(); m.src = art(MEDAL[r.r - 1]); m.alt = r.r; pos.appendChild(m); } else pos.textContent = r.r;
    const who = el("b", "", r.n);
    if (r.rb) who.appendChild(el("small", "", "возрождений: " + group(r.rb)));
    row.appendChild(pos); row.appendChild(who); row.appendChild(el("span", "", "волна " + group(r.w)));
    box.appendChild(row);
  }
  const foot = el("div", "topfoot");
  if (name) {
    foot.appendChild(el("span", "", name + " · " + (mine || rank ? "место " + rank + " из " + total : "игроков в таблице: " + total) + " · рекорд: волна " + group(S.best)));
    const out = el("button", "linkbtn", "выйти"); out.dataset.logout = ""; foot.appendChild(out);
  } else foot.appendChild(el("span", "", "Игроков в таблице: " + total));
  box.appendChild(foot);
  if (name && best && best < S.best) box.appendChild(el("p", "note", "В таблице пока волна " + group(best) + ": сервер принимает рост рекорда не быстрее 360 волн в час и скоро догонит."));
  box.appendChild(el("p", "note", "В таблицу попадают те, кто вошёл через Twitch. Считается рекорд волны за всё время, возрождения его не сбрасывают."));
}

export function mount(state, hooks) {
  S = state; toast = hooks && hooks.toast;
  const box = $("topBox");
  A.bind(box);
  box.addEventListener("click", (e) => { if (e.target.closest("[data-logout]")) A.logout(); });
  A.onChange(() => { if (!A.logged()) { rank = 0; best = 0; sentKey = ""; } else lastSend = 0; shownKey = ""; draw(false); });
}
export function setState(state) { S = state; sentKey = ""; shownKey = ""; }
export function open() { shownKey = ""; if (!lastLoad || Date.now() - lastLoad > 15000) load(); else draw(true); }
export function tick(visible) {                             // зовётся из UI несколько раз в секунду
  const now = Date.now();
  if (A.logged() && !busy && now - lastSend > 60000 && stateKey() !== sentKey) send();   // новый рекорд — не чаще раза в минуту
  if (visible && !busy && now - lastLoad > 60000) load();
  if (visible) draw(false);
}
