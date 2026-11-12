// Вход через Twitch и разговор с сервером кликера.
// Сервер сам спрашивает у Twitch, кто подтвердил код, и выдаёт свой ключ сессии: токен Twitch до браузера не доходит.
// Прогресс игры к аккаунту не привязан — он живёт в этом браузере; вход нужен для таблицы рекордов и обмена на души RPG.
const API = "https://173-249-26-11.sslip.io:8444/api/clicker";
const K_SID = "hlystopad.sid", K_WHO = "hlystopad.who";
const GLYPH = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 3 2.5 6.8V19h4.6v2.5h2.6L12.2 19h3.7l5-5V3H4zm15 10.2-2.9 2.9h-4.6l-2.5 2.5v-2.5H5.4V4.8H19v8.4zM16 7.6v5h-1.7v-5H16zm-4.6 0v5H9.7v-5h1.7z"/></svg>';

const get = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* хранилище недоступно */ } };
const del = (k) => { try { localStorage.removeItem(k); } catch (e) { /* хранилище недоступно */ } };

const subs = new Set();
export const state = { phase: "idle", code: "", uri: "", err: "" };   // idle | start | code | error
let lid = "", pollT = 0, until = 0, step = 5300, win = null;

export const sid = () => get(K_SID);
export const who = () => get(K_WHO);
export const logged = () => /^[a-f0-9]{48}$/.test(sid());
export const glyph = () => GLYPH;
export function onChange(fn) { subs.add(fn); }
function emit() { subs.forEach((f) => { try { f(); } catch (e) { /* один слушатель не мешает другим */ } }); }
function drop() { del(K_SID); del(K_WHO); emit(); }

export async function api(path, body) {                     // POST без предзапроса; при обрыве — {ok: false, error: "net"}
  try {
    const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body || {}) });
    const d = await r.json();
    if (r.status === 401 && d.error === "login" && logged()) drop();   // сессия кончилась — выходим и здесь
    return d;
  } catch (e) { return { ok: false, error: "net" }; }
}
export async function top() {
  try { return await (await fetch(API + "/top", { cache: "no-store" })).json(); } catch (e) { return { ok: false, error: "net" }; }
}

// Вход: сервер берёт у Twitch код, человек подтверждает его на twitch.tv/activate, сервер узнаёт, кто это.
export function login() {                                   // зовётся из обработчика клика: вкладку Twitch открываем сразу, пока браузер разрешает
  if (state.phase === "start" || state.phase === "code") return;
  state.phase = "start"; state.err = ""; state.code = ""; state.uri = ""; emit();
  try { win = window.open("", "_blank"); } catch (e) { win = null; }
  api("/login/start").then((d) => {
    if (!d.ok) { fail(d.message || (d.error === "net" ? "Нет связи с сервером. Попробуй позже" : "Twitch сейчас не отвечает. Попробуй позже")); return; }
    lid = d.lid; state.code = d.code; state.uri = d.uri; state.phase = "code";
    step = (d.interval || 5) * 1000 + 300; until = Date.now() + (d.ttl || 900) * 1000;
    if (win && !win.closed) { try { win.location.href = d.uri; } catch (e) { /* откроют по кнопке */ } }
    emit();
    clearTimeout(pollT); pollT = setTimeout(poll, step);
  });
}
function fail(msg) {
  clearTimeout(pollT);
  state.phase = "error"; state.err = msg; state.code = "";
  if (win && !win.closed && state.uri === "") { try { win.close(); } catch (e) { /* вкладку закроют сами */ } }
  win = null; emit();
}
async function poll() {
  if (state.phase !== "code") return;
  if (Date.now() > until) { fail("Код устарел. Нажми «Войти» ещё раз"); return; }
  const d = await api("/login/poll", { lid });
  if (state.phase !== "code") return;
  if (d.ok && d.state === "done") {
    put(K_SID, d.sid); put(K_WHO, d.name);
    state.phase = "idle"; state.code = ""; state.uri = ""; win = null; emit();
    return;
  }
  if (!d.ok && d.error !== "net" && d.error !== "rate") { fail(d.error === "expired" ? "Вход не подтверждён. Нажми «Войти» ещё раз" : "Twitch не подтвердил вход. Попробуй ещё раз"); return; }
  pollT = setTimeout(poll, step);
}
export function cancel() { clearTimeout(pollT); state.phase = "idle"; state.code = ""; state.uri = ""; emit(); }
export function logout() { const s = sid(); drop(); if (s) api("/logout", { sid: s }); }

// Карточка входа: одна и та же во вкладке «Топ» и в «Обменнике».
export function card(box, note) {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const c = el("div", "lcard");
  if (state.phase === "code") {
    c.appendChild(el("b", "", "Подтверди вход на Twitch"));
    c.appendChild(el("p", "", "В соседней вкладке открылся Twitch. Проверь, что код тот же, и нажми «Авторизовать». Потом вернись сюда."));
    c.appendChild(el("div", "code", state.code));
    const a = el("a", "btn twitch"); a.href = state.uri; a.target = "_blank"; a.rel = "noopener"; a.innerHTML = GLYPH + "<span>Открыть Twitch</span>";
    const row = el("div", "lrow"); row.appendChild(a);
    const x = el("button", "linkbtn", "отмена"); x.dataset.acancel = ""; row.appendChild(x);
    c.appendChild(row);
    c.appendChild(el("p", "note", "Жду подтверждения…"));
  } else {
    c.appendChild(el("b", "", "Вход через Twitch"));
    c.appendChild(el("p", "", note));
    const b = el("button", "btn twitch"); b.dataset.alogin = ""; b.innerHTML = GLYPH + "<span>" + (state.phase === "start" ? "Секунду…" : "Войти через Twitch") + "</span>";
    c.appendChild(b);
    if (state.phase === "error" && state.err) c.appendChild(el("p", "note err", state.err));
  }
  box.appendChild(c);
}
export function bind(box) {                                 // клики по карточке входа внутри этого блока
  box.addEventListener("click", (e) => {
    if (e.target.closest("[data-alogin]")) login();
    else if (e.target.closest("[data-acancel]")) cancel();
  });
}
