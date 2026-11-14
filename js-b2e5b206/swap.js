// Обменник: души кликера → души RPG стрима.
// Первые души за день дешёвые, дальше цена растёт числом нулей: n-я стоит 10^(3 + (n/62)^(2/3)) душ кликера (C.swapPriceLg).
// Сколько душ RPG можно взять за день, решает сервер — по рекорду волны, который он принял сам (js/top.js):
// тому, что браузер говорит о своём банке, сервер не верит. Души начисляет колесо хаоса у стримера, когда оно запущено.
import * as A from "./acct.js";
import * as C from "./core.js";
import * as TOP from "./top.js";
import { txt, group } from "./num.js";
import { art } from "./art.js";
import { sfx } from "./audio.js";

const $ = (id) => document.getElementById(id);
const STATUS = { wait: "ждёт колеса", paid: "начислено", dup: "начислено", noplayer: "не начислено: ты ещё не играешь в RPG стрима" };
let S = null, H = null, view = null, busy = false, note = "", lastMe = 0;

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const clock = (s) => (s >= 3600 ? Math.floor(s / 3600) + " ч " + Math.floor(s % 3600 / 60) + " мин" : Math.max(1, Math.floor(s / 60)) + " мин");

function drawChip() {
  const v = $("swapV");
  if (v) v.textContent = A.logged() && view && view.allow ? view.took + " / " + view.allow : "Обмен";
}

async function refresh(push) {
  if (!A.logged()) { view = null; render(); drawChip(); return; }
  if (push) await TOP.pushNow();
  const d = await A.api("/me", { sid: A.sid() });
  lastMe = Date.now();
  if (d.ok) { view = d; note = ""; }
  else if (d.error === "net") note = "Нет связи с сервером. Попробуй позже";
  render(); drawChip();
}

function render() {
  const box = $("swapBox");
  if (!box) return;                                         // окно закрыто
  box.textContent = "";
  if (!A.logged()) {
    box.appendChild(el("p", "", "Души кликера меняются на души RPG стрима — те самые, что капают в чате. Чтобы знать, кому их начислить, нужен вход."));
    A.card(box, "Войди через Twitch. Вход нужен для обмена и таблицы рекордов, а прогресс станет общим на аккаунт: с телефона и с компьютера — одна игра.");
    return;
  }
  if (!view) { box.appendChild(el("p", "note", note || "Загружаю…")); return; }
  const v = view;
  const head = el("div", "swhead");
  const ic = new Image(); ic.src = art("cur-stream"); ic.alt = "";
  head.appendChild(ic);
  const hs = el("div");
  hs.appendChild(el("b", "", "Сегодня обменяно: " + v.took + " из " + v.allow));
  hs.appendChild(el("span", "", v.allow ? "Норма обновится через " + clock(v.reset) + ". Чем выше рекорд волны, тем она больше — до " + v.cap + " в день"
    : "Норма появится, как только твой рекорд волны попадёт в таблицу: сыграй пару волн и открой это окно ещё раз"));
  head.appendChild(hs); box.appendChild(head);
  const bar = el("div", "swbar"), fill = el("i"); fill.style.width = (v.allow ? Math.min(100, v.took / v.allow * 100) : 0) + "%"; bar.appendChild(fill); box.appendChild(bar);

  const price = C.swapPriceLg(v.took + 1), can = v.left > 0 ? C.swapMax(S, v.took, v.left) : 0;
  const pr = el("div", "swprice");
  pr.appendChild(el("span", "", "Следующая душа RPG стоит"));
  const pv = el("b"); const fi = new Image(); fi.src = art("cur-farm"); fi.alt = ""; pv.appendChild(fi); pv.appendChild(document.createTextNode(txt(price)));
  pr.appendChild(pv);
  pr.appendChild(el("span", "", "у тебя " + txt(S.souls)));
  box.appendChild(pr);

  if (!v.age_ok) box.appendChild(el("p", "note err", "Обмен доступен аккаунтам Twitch старше " + v.age_days + " дней."));
  else if (v.allow && v.left <= 0) box.appendChild(el("p", "note", "На сегодня норма выбрана. Подними рекорд волны — и завтра она будет больше."));
  else if (v.allow && !can) box.appendChild(el("p", "note", "Пока не хватает душ кликера. Каждая следующая душа за день дороже прежней в разы — копи и возвращайся."));

  const acts = el("div", "acts");
  const one = el("button", "btn stream" + (can >= 1 && !busy ? "" : " off"), busy ? "Секунду…" : "Обменять 1"); one.dataset.swap = "1"; acts.appendChild(one);
  if (can >= 2) { const all = el("button", "btn stream" + (busy ? " off" : ""), "Обменять " + can); all.dataset.swap = String(can); acts.appendChild(all); }
  const x = el("button", "btn", "Готово"); x.dataset.x = ""; acts.appendChild(x);
  box.appendChild(acts);
  if (note) box.appendChild(el("p", "note err", note));

  if (v.pending) box.appendChild(el("p", "note", "Ждут начисления: " + v.pending + ". Души приходят на страницу RPG, когда у стримера запущено колесо хаоса — обычно за минуту."));
  if (v.last && v.last.length) {
    const list = el("div", "swlast");
    for (const p of v.last) { const r = el("div", p.s === "noplayer" ? "bad" : ""); r.appendChild(el("b", "", "+" + p.n)); r.appendChild(el("span", "", STATUS[p.s] || p.s)); list.appendChild(r); }
    box.appendChild(list);
    if (v.last.some((p) => p.s === "noplayer")) box.appendChild(el("p", "note", "Души получают игроки RPG: открой страницу RPG стрима, войди там через Twitch — и обменяй ещё раз. Норма за такой обмен вернулась."));
  }
  box.appendChild(el("p", "note", "Всего обменяно: " + group(v.total || 0) + ". Души приходят личными: потратить их можно, передать другому — нет."));
}

async function swap(n) {
  if (busy || !view || n < 1) return;
  const can = C.swapMax(S, view.took, view.left);
  if (can < 1) { sfx.deny(); return; }
  busy = true; note = ""; render();
  const took = view.took;
  await TOP.pushNow();
  const d = await A.api("/swap", { sid: A.sid(), n: Math.min(n, can) });
  busy = false;
  if (d.wave !== undefined) view = d;                       // сервер отдаёт свежую картину и при отказе
  if (d.ok && d.got > 0) {
    C.swapPay(S, took, d.got);
    if (view && view.allow > 0 && view.left <= 0) C.achMark(S, "swapcap");   // дневная норма выбрана до конца
    if (H.changed) H.changed();
    sfx.ms();
    if (H.toast) H.toast("Обменяно душ RPG: " + d.got + ". Придут, когда запущено колесо хаоса");
  } else if (d.error === "net") note = "Нет связи с сервером. Попробуй позже";
  else if (d.error === "rate") note = "Слишком часто. Подожди минуту";
  else if (d.error === "age") note = "";
  else if (d.error === "limit") note = "На сегодня норма выбрана";
  render(); drawChip();
}

function show() {
  H.openModal('<h2>Обменник</h2><div class="swapbox" id="swapBox"></div>', (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.x !== undefined) H.closeModal();
    else if (b.dataset.swap && !b.classList.contains("off")) swap(Number(b.dataset.swap));
    else if (b.dataset.alogin !== undefined) A.login();
    else if (b.dataset.acancel !== undefined) A.cancel();
  });
  render();
  refresh(true);
}

export function mount(state, hooks) {
  S = state; H = hooks;
  $("btnSwap").addEventListener("click", show);
  A.onChange(() => { if (!A.logged()) view = null; drawChip(); if ($("swapBox")) refresh(true); else if (A.logged()) refresh(false); });
  drawChip();
  if (A.logged()) refresh(false);
}
export function setState(state) { S = state; }
export function tick() {                                    // раз в десять минут освежаем норму для плашки наверху
  if (A.logged() && Date.now() - lastMe > 600000) { lastMe = Date.now(); refresh(false); }
  if ($("swapBox") && view && !busy) {                      // окно открыто: цена и «у тебя» живые
    const k = view.took + ":" + Math.floor(S.souls * 20) + ":" + C.swapMax(S, view.took, view.left);
    if (k !== tick.k) { tick.k = k; render(); }
  }
}
