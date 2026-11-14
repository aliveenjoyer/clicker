// Прогресс один на аккаунт Twitch: вошедший игрок видит одну и ту же игру на компьютере и на телефоне.
// Браузер раз в минуту (и уходя со страницы) отправляет сохранение на сервер и получает один из двух ответов:
// «принято» — эта игра теперь игра аккаунта, или «возьми ту, что лежит» — тогда игра продолжает её (настройки остаются
// свои: они у каждого устройства свои). Решает сервер, правило — в tools/cloud_rule.py:
//   — у каждой сохранённой игры есть номер версии; браузер помнит, с какой версии растёт его игра. Кто продолжает ровно
//     то, что лежит на сервере, тот и сохраняет. Вернулся к устройству, а с другого за это время играли — берёшь оттуда;
//   — открыты оба устройства сразу — ведёт то, на котором сейчас играют (были нажатия после прошлого обмена), второе идёт
//     за ним. Поэтому покупки на телефоне не пропадают, даже если вкладка на компьютере осталась открытой;
//   — игра, где сыграно намного меньше, большую не заменяет никогда (чистый браузер не затрёт три дня прогресса);
//   — стёртый прогресс стирается на всех устройствах: у сохранения есть счётчик стираний, старое назад не приходит.
// Сохранение для сервера — просто данные: таблица и обменник по-прежнему верят только рекорду, который сервер принял
// сам, так что подложенное сохранение ничего там не даёт. Кто не вошёл, тот играет как раньше — только в этом браузере.
import * as A from "./acct.js";
import * as C from "./core.js";

const EVERY = 60;                                            // как часто отправлять сохранение, секунд
const RETRY = 13;                                            // через сколько повторить, если сервер попросил подождать или пропала связь
const K_REV = "hlystopad.rev";                               // «аккаунт:версия» — с какой версии сохранения аккаунта растёт игра в этом браузере
let H = null, did = "", busy = false, queued = false, lastSync = 0, hiddenAt = 0, state = "";
let fresh = true;                                            // с открытия страницы (или возвращения к ней) обмена с сервером ещё не было
let acted = false;                                           // игрок что-то нажимал после прошлого обмена

function base() {
  try { const [who, rev] = (localStorage.getItem(K_REV) || "").split(":"); return who && who === A.who() ? Math.floor(Number(rev)) || 0 : 0; } catch (e) { return 0; }
}
function keep(rev) { try { if (rev) localStorage.setItem(K_REV, A.who() + ":" + rev); } catch (e) { /* без хранилища обмен всё равно работает */ } }
const body = (S) => ({ sid: A.sid(), dev: did, base: base(), first: fresh, active: acted, save: JSON.parse(C.save(S)) });

async function sync() {                                      // отправить свою игру; сервер либо примет её, либо отдаст ту, что надо продолжать
  if (!H || !A.logged()) return;
  if (busy) { queued = true; return; }
  busy = true; state = "sync";
  const first = fresh, was = acted, data = body(H.state());  // сначала собрать посылку (в ней «были нажатия»), потом сбросить признак
  acted = false;
  const d = await A.api("/save", data);
  busy = false; lastSync = Date.now();
  if (!d.ok) { state = d.error || "net"; acted = acted || was; if (state === "net") lastSync -= (EVERY - RETRY) * 1000; }
  else if (d.soon) { state = "soon"; fresh = false; acted = acted || was; lastSync -= (EVERY - RETRY) * 1000; }
  else if (d.kept && d.save) { keep(d.rev); state = "took"; fresh = false; acted = false; H.adopt(d.save, d, first); }
  else { keep(d.rev); state = "ok"; fresh = false; }
  if (H.settled) H.settled();
  if (queued) { queued = false; sync(); }
}
function leave() {                                           // уходим со страницы: сохранение уходит маячком
  if (!H || !A.logged()) return;
  try { navigator.sendBeacon(A.apiUrl() + "/save", new Blob([JSON.stringify(body(H.state()))], { type: "text/plain" })); } catch (e) { /* не получилось — отправим в следующий раз */ }
}

// hooks: { state() — игра сейчас, adopt(save, meta, first) — продолжить игру аккаунта, device() — номер браузера,
//          settled() — обмен с сервером закончился (так или иначе) }
export function mount(hooks) {
  H = hooks; did = hooks.device();
  const touch = () => { acted = true; };
  window.addEventListener("pointerdown", touch, { capture: true, passive: true });
  window.addEventListener("keydown", touch, { capture: true, passive: true });
  A.onChange(() => { if (A.logged()) { fresh = true; sync(); } });
  if (A.logged()) sync();
  setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastSync > EVERY * 1000) sync(); }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); leave(); }
    else if (hiddenAt && Date.now() - hiddenAt > 60000) { fresh = true; sync(); }   // пока нас не было, могли играть с другого устройства
  });
  window.addEventListener("pagehide", leave);
}
export const info = () => ({ state, did, lastSync, busy, fresh, acted, rev: base() });   // для проверки (?dev=1)
export const syncNow = () => sync();                        // сразу после стирания прогресса и для проверки
