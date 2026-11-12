// Таблица рекордов. Сервер хранит лучший рекорд волны по нику и случайному ключу этого браузера.
// Игра считается в браузере, поэтому рекорды принимаются на веру — до входа через Twitch (PLAN.md § 19).
import { art } from "./art.js";
import { group } from "./num.js";

const API = "https://173-249-26-11.sslip.io:8444/api/clicker";
const K_ID = "hlystopad.id", K_NAME = "hlystopad.name";
const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9_.\- ]{2,20}$/;
const MEDAL = ["medal-gold", "medal-silver", "medal-bronze"];
const $ = (id) => document.getElementById(id);
let S = null, rows = null, total = 0, rank = 0, err = "", busy = false, sentKey = "", lastSend = 0, lastLoad = 0, shownKey = "", editing = false, toast = null;

const get = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* хранилище недоступно */ } };
function myId() {                                           // случайный ключ браузера: по нему сервер узнаёт свою строку
  let id = get(K_ID);
  if (!/^[a-f0-9]{32}$/.test(id)) {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    id = Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
    put(K_ID, id);
  }
  return id;
}
export const myName = () => get(K_NAME);
const stateKey = () => S.best + ":" + S.rb;

async function send(name) {                                 // отправить рекорд; сервер отвечает местом и таблицей
  if (busy) return false;
  busy = true;
  let ok = false;
  try {
    const r = await fetch(API + "/score", { method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ id: myId(), name, wave: S.best, rb: S.rb, played: Math.round(S.stats.played) }) });
    const d = await r.json();
    if (d.ok) { ok = true; err = ""; rows = d.top; total = d.total; rank = d.rank; lastLoad = Date.now(); sentKey = stateKey(); put(K_NAME, name); editing = false; }
    else err = d.message || (d.error === "rate" ? "Слишком часто. Попробуй через минуту" : "Таблица сейчас недоступна. Попробуй позже");
  } catch (e) { err = "Таблица сейчас недоступна. Попробуй позже"; }
  busy = false; lastSend = Date.now();
  draw(true);
  return ok;
}
async function load() {
  lastLoad = Date.now();
  try {
    const d = await (await fetch(API + "/top", { cache: "no-store" })).json();
    if (d.ok) { rows = d.top; total = d.total; if (err && myName()) err = ""; }
  } catch (e) { if (!rows) err = "Таблица сейчас недоступна. Попробуй позже"; }
  draw(true);
}

function join() {                                           // записаться или сменить ник
  const inp = $("topName");
  const name = (inp ? inp.value : "").replace(/\s+/g, " ").trim();
  if (!NAME_RE.test(name)) { err = "Ник: от 2 до 20 символов — буквы, цифры, пробел, точка, дефис и _"; draw(true); return; }
  if (Date.now() - lastSend < 4000) { err = "Секунду…"; draw(true); return; }
  send(name).then((ok) => { if (ok && toast) toast("Ты в таблице: место " + rank + " из " + total); });
}

function draw(force) {
  const box = $("topBox");
  if (!box || box.offsetParent === null && !force) return;
  const name = myName(), form = !name || editing;
  const key = JSON.stringify([rows, total, rank, err, name, form, busy]);
  if (key === shownKey) return;
  const typed = $("topName") ? $("topName").value : null, focused = document.activeElement && document.activeElement.id === "topName";
  if (focused && !force) return;                            // пока человек печатает ник, таблицу под ним не перерисовываем
  shownKey = key;
  box.textContent = "";
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  if (form) {
    const f = el("div", "topform");
    f.appendChild(el("b", "", name ? "Сменить ник" : "Запишись в таблицу рекордов"));
    f.appendChild(el("p", "", name ? "Рекорд останется за тобой, поменяется только имя." : "Твой рекорд волны увидят все, кто играет. Лучше взять ник с Twitch."));
    const line = el("div", "topin"), inp = el("input");
    inp.id = "topName"; inp.maxLength = 20; inp.placeholder = "Твой ник"; inp.autocomplete = "off"; inp.spellcheck = false;
    inp.value = typed !== null ? typed : name;
    const b = el("button", "btn gold sm", busy ? "Секунду…" : name ? "Сохранить" : "Записаться"); b.dataset.join = "";
    line.appendChild(inp); line.appendChild(b); f.appendChild(line);
    if (name) { const c = el("button", "linkbtn", "не менять"); c.dataset.cancel = ""; f.appendChild(c); }
    if (err) f.appendChild(el("p", "note err", err));
    box.appendChild(f);
    if (focused) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  } else if (err) box.appendChild(el("p", "note err pad", err));
  if (!rows) { box.appendChild(el("p", "note pad", err ? "" : "Загружаю таблицу…")); return; }
  if (!rows.length) box.appendChild(el("p", "note pad", "Таблица пока пустая. Стань первым."));
  const low = name.toLowerCase();
  let mine = false;
  for (const r of rows) {
    const me = !!name && r.n.toLowerCase() === low;
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
    foot.appendChild(el("span", "", (mine || rank ? "Твоё место: " + rank + " из " + total : "Игроков в таблице: " + total) + " · рекорд: волна " + group(S.best)));
    const c = el("button", "linkbtn", "сменить ник"); c.dataset.edit = ""; foot.appendChild(c);
  } else foot.appendChild(el("span", "", "Игроков в таблице: " + total + ". Показаны первые " + Math.min(50, Math.max(total, 1))));
  box.appendChild(foot);
  box.appendChild(el("p", "note", "Считается рекорд волны за всё время, возрождения его не сбрасывают. Рекорды пока принимаются на веру — до входа через Twitch."));
}

export function mount(state, hooks) {
  S = state; toast = hooks && hooks.toast;
  const box = $("topBox");
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.join !== undefined) join();
    else if (b.dataset.edit !== undefined) { editing = true; err = ""; draw(true); const i = $("topName"); if (i) i.focus(); }
    else if (b.dataset.cancel !== undefined) { editing = false; err = ""; draw(true); }
  });
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "topName") join(); });
}
export function setState(state) { S = state; sentKey = ""; shownKey = ""; }
export function open() { shownKey = ""; if (!lastLoad || Date.now() - lastLoad > 15000) load(); else draw(true); }
export function tick(visible) {                             // зовётся из UI несколько раз в секунду
  const now = Date.now(), name = myName();
  if (name && !busy && !editing && now - lastSend > 60000 && stateKey() !== sentKey) send(name);   // новый рекорд — не чаще раза в минуту
  if (visible && !busy && now - lastLoad > 60000) load();
  if (visible) draw(false);
}
