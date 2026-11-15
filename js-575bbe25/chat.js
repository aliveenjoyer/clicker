// Кто в чате стрима (15.11). «Всё ×2» и сундук эфира даются за то, что игрок сидит в чате Twitch канала aliveenjoyer,
// пока идёт стрим. Смотреть при этом можно где угодно: в самом Twitch, в приложении на телефоне, во встроенном плеере.
// Раньше эти бонусы давал встроенный в игру плеер (со звуком — всё ×2, 10 минут показа — сундук). Награда за показ во
// вкладке для Twitch похожа на накрутку онлайна (за неё каналу режут онлайн), а сам плеер лежал под игрой, чего правила
// встраивания не разрешают. Теперь встроенный плеер не даёт ничего.
// Сервер держит анонимное чтение чата (без токена, в чат ничего не пишет) и на вопрос игры отвечает, есть ли этот ник
// в чате и давно ли он писал: POST /chat {sid} → {known, here, spoke} (tools/server_patch_chat.py). Нужен вход через
// Twitch — иначе ник не узнать. Сервер верит только своему списку; игра ему ничего о чате не сообщает.
import * as A from "./acct.js";

const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const Q = new URLSearchParams(LOCAL ? location.search : "");
// Проверка на своём компьютере: ?fakechat=1 — «в чате», ?fakechat=0 — «вошёл, но не в чате»; &fakespoke=<секунд назад писал>.
const FAKE = Q.has("fakechat") ? { here: Q.get("fakechat") !== "0", spoke: Q.has("fakespoke") ? Number(Q.get("fakespoke")) || 0 : null } : null;
const EVERY = 60000, SOON = 20000;                           // как часто спрашивать сервер: пока в чате и пока ещё нет
const HOLD = 10 * 60000;                                     // сервер не ответил или сам не знает — прошлому ответу верим столько
const SPOKE = 600;                                           // «писал в чат недавно», секунд
export const CHANNEL = "aliveenjoyer";
export const URL_TWITCH = "https://www.twitch.tv/" + CHANNEL;

let liveFn = () => false, onChange = () => {}, here = false, spokeAt = 0, okAt = 0, askedAt = 0, timer = 0, busy = false, wasLive = null, wasLogged = null;

export const logged = () => !!FAKE || A.logged();
export const inChat = () => (FAKE ? FAKE.here : here && A.logged());
export const spokeLeft = () => (inChat() ? Math.max(0, SPOKE - (Date.now() - spokeAt) / 1000) : 0);   // сколько секунд ещё действует «писал в чат»
export const spoke = () => spokeLeft() > 0;
export const info = () => ({ here, logged: logged(), spokeLeft: Math.round(spokeLeft()), asked: askedAt ? Math.round((Date.now() - askedAt) / 1000) : null, fake: !!FAKE });

function set(h) { if (h !== here) { here = h; onChange(); } }
function plan() { clearTimeout(timer); timer = setTimeout(ask, here ? EVERY : SOON); }
export async function ask() {                                // спросить сервер сейчас
  clearTimeout(timer);
  if (FAKE) { if (FAKE.spoke !== null && !spokeAt) spokeAt = Date.now() - FAKE.spoke * 1000; set(FAKE.here); return; }
  if (busy) return;
  if (!A.logged() || !liveFn()) { set(false); plan(); return; }   // стрим не идёт или игрок не вошёл — спрашивать не о чем
  busy = true;
  const r = await A.api("/chat", { sid: A.sid() });
  busy = false; askedAt = Date.now();
  if (r && r.ok && r.known) {
    okAt = Date.now();
    if (typeof r.spoke === "number") spokeAt = Date.now() - r.spoke * 1000;
    set(!!r.here);
  } else if (r && r.error === "login") set(false);
  else if (Date.now() - okAt > HOLD) set(false);             // обрыв связи или сервер потерял чат: бонус не отнимаем сразу
  plan();
}
export function tick() {                                     // зовётся каждый кадр: стрим начался или игрок вошёл — спросить сразу
  const l = !!liveFn(), g = logged();
  if (l === wasLive && g === wasLogged) return;
  wasLive = l; wasLogged = g;
  if (!l || !g) set(false);
  ask();
}
export function soon(ms) { clearTimeout(timer); timer = setTimeout(ask, ms || 8000); }   // игрок только что пошёл открывать чат — спросить пораньше
export function mount(h) {
  liveFn = h.live; onChange = h.changed || onChange;
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - askedAt > SOON) ask(); });
}
