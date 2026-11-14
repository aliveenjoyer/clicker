// Запуск: загрузка, игровой цикл, ввод, сохранение, офлайн-прогресс.
// Сейчас игра считается в браузере и хранится в localStorage; на этапе 2 (PLAN.md § 22) ядро переедет на сервер.
import { CFG } from "./data.js";
import * as C from "./core.js";
import * as FX from "./fx.js";
import * as UI from "./ui.js";
import { sfx, unlock as audioUnlock } from "./audio.js";
import { loadArt } from "./art.js";
import { txt, lg } from "./num.js";
import * as TW from "./stream.js";
import * as TELE from "./tele.js";
import * as CLOUD from "./cloud.js";
import * as CLOCK from "./clock.js";
// Цикл игры идёт по своим, взятым при загрузке, ссылкам на requestAnimationFrame и часы: подмена их из консоли
// потом игру не ускоряет.
const RAF = window.requestAnimationFrame.bind(window);
C.setClock(CLOCK.now);

const KEY = "hlystopad.save.v1";
const STEP = 1 / 60;
const Q = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);   // свой компьютер: только тут работают ?reset и ?dev
let S = null, last = 0, acc = 0, saveT = 0, down = false, downT = 0, holdAcc = 0, hiddenAt = 0;

// Прогресс хранится в этом браузере, а у вошедших через Twitch — ещё и на сервере, один на аккаунт (js/cloud.js): так
// компьютер и телефон видят одну игру. Загрузить прогресс текстом, ссылкой или из копий по-прежнему нельзя намеренно:
// такая дверь стала бы способом накрутить рекорд. Сохранение аккаунта этой дверью не становится: таблица и обменник
// верят только рекорду, который сервер принял сам.
function store() { try { localStorage.setItem(KEY, C.save(S)); } catch (e) { /* хранилище недоступно — играем без сохранения */ } }
function restore() {
  try { localStorage.removeItem("hlystopad.backups.v1"); localStorage.removeItem(KEY + ".rescue"); localStorage.removeItem("hlystopad.id"); localStorage.removeItem("hlystopad.name"); } catch (e) { /* следы прежней версии с копиями */ }
  if (LOCAL && Q.has("reset")) { try { localStorage.removeItem(KEY); } catch (e) {} }
  let t = null;
  try { t = localStorage.getItem(KEY); } catch (e) {}
  return t ? C.load(t) : C.newState();
}
function welcome() {                                        // первый запуск: три шага обучения
  try {
    if (localStorage.getItem(KEY + ".intro") || S.stats.clicks >= 5 || S.rb) return;
    localStorage.setItem(KEY + ".intro", "1");
  } catch (e) { return; }
  UI.showIntro(0);
}

const hooks = {
  rebirth() {
    const g = C.ashGain(S);
    FX.rebirthScene(() => { C.rebirth(S); drain(); store(); }, txt(g));
  },
  eclipse() {                                               // Затмение: та же сцена, что у возрождения, только сгорает и первый слой
    const n = C.shardsGain(S);
    FX.rebirthScene(() => { C.eclipse(S); drain(); store(); }, String(n), "осколков", "ecl");
  },
  settings() { UI.applySettings(); store(); },
  reset() {                                                 // стереть прогресс насовсем; настройки остаются
    const N = C.newState(); Object.assign(N.set, S.set);
    N.gen = (S.gen || 0) + 1;                               // стирание — новое «поколение» игры: на остальных устройствах аккаунта старое тоже уйдёт
    S = N;
    FX.setState(S); UI.setState(S); UI.applySettings(); C.checkUnlocks(S); store();
    document.getElementById("hint").hidden = false;
    CLOUD.syncNow();
  },
  adopt(save, meta, first) {                                // игра аккаунта продолжается с другого устройства: берём её оттуда
    let N = null;
    try { N = C.load(JSON.stringify(save)); } catch (e) { return; }
    const was = { w: S.best, p: S.stats.played || 0, gen: S.gen || 0 };
    N.set = S.set;                                          // настройки у каждого устройства свои
    // сколько игра простояла — по часам сервера (когда он её сохранил и сколько на нём сейчас), а не по часам двух разных устройств
    const gone = meta && meta.now && meta.t ? Math.max(0, meta.now - meta.t) : CLOCK.ready() ? Math.max(0, (CLOCK.now() - (N.at || CLOCK.now())) / 1000) : 0;
    S = N;
    FX.setState(S); UI.setState(S); UI.applySettings(); C.checkUnlocks(S);
    if (gone > 5) away(gone);
    store();
    UI.cloudNote(was, S, first, meta);
  },
  defaults() { Object.assign(S.set, { sound: true, hit: true, fig: true, calm: false, sci: false, autoBoss: true, stream: true, twQ: "auto", twQh: 0 }); UI.applySettings(); TW.sync(); store(); },
};

function drain() {
  if (!S.ev.length) return;
  const list = S.ev; S.ev = [];
  for (const e of list) { FX.onEvent(e); UI.onEvent(e); }
}

function away(seconds) {                                    // вернулись: меньше минуты — догоняем, больше — офлайн
  if (seconds < 60) {                                       // сундук эфира копится, только пока игра на экране
    const w = S.watch; S.watch = false;
    for (let t = 0; t < seconds; t += 0.5) C.tick(S, 0.5, true);
    S.watch = w; S.ev = S.ev.filter((e) => e.t === "unlock"); return;
  }
  const o = C.offline(S, seconds);
  if (o && o.gained > -1) UI.showOffline(o);
}

function loop() {
  const ts = CLOCK.perf();                                  // время кадра — по своим часам, а не по тому, что передал браузер
  const real = (ts - last) / 1000 || 0;
  const dt = Math.min(0.1, real);
  last = ts;
  if (real > 1) away(real - dt);                            // кадры стояли (окно свёрнуто, ноутбук спал) — догоняем по часам
  acc += dt;
  while (acc >= STEP) { C.tick(S, STEP, true); acc -= STEP; }
  if (down) {                                               // удержание — 4 удара в секунду без кликов
    downT += dt;
    if (downT > 0.35) { holdAcc += dt * CFG.holdRate; while (holdAcc >= 1) { holdAcc -= 1; C.hit(S, "hold"); } }
  }
  drain();
  FX.frame(dt);
  UI.frame(dt);
  saveT += dt;
  if (saveT > 10) { saveT = 0; store(); }
  RAF(loop);
}

async function boot() {
  await Promise.all([loadArt(), CLOCK.first(2500)]);        // часы сверяются с сервером, пока грузятся картинки
  S = restore();
  if (Q.has("faction")) S.set.faction = Q.get("faction");
  if (Q.has("mute")) S.set.sound = false;                   // ?mute=1 — тихая проверка
  // офлайн-доход — только по часам сервера: без сверки (нет связи) его нет, чтобы перевод часов ничего не давал
  const gone = CLOCK.ready() ? (CLOCK.now() - (S.at || CLOCK.now())) / 1000 : 0;
  UI.mount(S, hooks); FX.mount(S); UI.applySettings();
  TELE.mount({ state: () => S, tab: UI.curTab, watching: TW.watching });   // наблюдение: обезличенная сводка раз в минуту
  CLOUD.mount({ state: () => S, adopt: hooks.adopt, device: TELE.deviceId, settled: UI.tryGift });   // прогресс один на аккаунт Twitch; подарок за вход — когда ясно, чья игра главная
  document.getElementById("hint").hidden = S.stats.clicks > 0;
  if (gone > 5) away(gone);
  C.checkUnlocks(S);
  UI.achBoot(C.checkAch(S, true));                          // ачивки, заработанные до их появления, засчитываются сразу и молча

  const field = FX.fieldEl();
  const strike = (e) => {                                   // удар: по линии или по труперу, вынесенному со страницы
    if (e && e.isTrusted === false && !LOCAL) return;        // события из консоли не бьют (проверки на своём компьютере — бьют)
    audioUnlock(); TW.nudge();
    if (e.target.closest("#draft")) return;                 // идёт выбор предмета — удары не считаются
    if (TW.isFront() || e.target.closest("#twplay, #twback, #twctl, .foe-tools")) return;   // плеер стрима выведен вперёд
    if (e.target.closest("#wisp")) { C.takeWisp(S); return; }
    if (e.target.closest("#crate")) { C.breakCrate(S); return; }
    if (e.target.closest("#statue")) { C.breakStatue(S); return; }
    if (e.target.closest("#urn")) { C.hitUrn(S); return; }
    down = true; downT = 0; holdAcc = 0;
    C.hit(S, "click", FX.weakAt(e.clientX, e.clientY));
  };
  field.addEventListener("pointerdown", strike);
  FX.onFoeStrike(strike);
  window.addEventListener("pointerdown", () => C.touch(S), true);   // игрок на месте: жертвенник приходит только к тем, кто играет
  window.addEventListener("keydown", () => C.touch(S), true);
  window.addEventListener("pointerup", () => { down = false; });
  window.addEventListener("pointercancel", () => { down = false; });
  window.addEventListener("blur", () => { down = false; });
  field.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.target.closest("input, textarea") || (!e.isTrusted && !LOCAL)) return;
    if (e.code === "Space") { e.preventDefault(); audioUnlock(); C.hit(S, "click"); }
    else if (/^Digit[1-7]$/.test(e.code)) { const s = ["flurry", "rage", "greed", "mark", "ult", "rewind", "siege"][Number(e.code.slice(5)) - 1]; if (!C.useSkill(S, s)) sfx.deny(); }
    else if (e.code === "Escape") UI.closeModal();
  });
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) { hiddenAt = CLOCK.now(); store(); return; }
    if (!hiddenAt) return;
    const from = hiddenAt; hiddenAt = 0;
    await CLOCK.sync();                                     // компьютер мог спать: время — с сервера
    away(CLOCK.ready() ? Math.max(0, (CLOCK.now() - from) / 1000) : 0); last = CLOCK.perf();
  });
  // Новая версия игры: свернутая вкладка обновляется сама (прогресс сохранён), открытая — просит обновить страницу.
  // Заодно часы раз в 5 минут сверяются заново.
  setInterval(async () => {
    const b = await CLOCK.sync();
    if (!b || !CLOCK.builtAs() || b === CLOCK.builtAs()) return;
    if (document.hidden) { store(); location.reload(); } else UI.updateNote();
  }, 300000);
  window.addEventListener("pagehide", store);

  if (LOCAL && Q.has("dev")) {                                       // ?dev=1 — ручки для проверки: __dev.give(30), __dev.wave(49)
    window.__dev = {
      S: () => S, C, UI, TW, TELE, CLOUD, wipe: hooks.reset,
      give(x) { S.souls = x; S.life = Math.max(S.life, x); },
      wave(z) { S.z = z; S.zrec = Math.max(S.zrec, z); S.best = Math.max(S.best, z); S.cycBest = Math.max(S.cycBest, z); S.kills = 0; S.hp = 1; S.wall = false; S.mode = "push"; C.checkUnlocks(S); C.derive(S); FX.setState(S); },
      ecl() { S.eclAt = 0; },                                // Затмение доступно сразу, без суток ожидания
      wisp() { S.wispIn = 0; },
      lane(k) { C.touch(S); if (k === "crate") S.crateIn = 0; if (k === "statue") S.statueIn = 0; if (k === "urn") S.urnIn = 0; if (k === "altar") S.altarIn = 0; },
      skip(sec) { for (let t = 0; t < sec; t += 0.1) C.tick(S, 0.1, true); },
      chest(kind, n) { S.chest[kind || "air"] += n || 1; },   // положить сундук: __dev.chest("day", 3)
      FX,
    };
    if (Q.has("give")) window.__dev.give(lg(Number(Q.get("give"))));
    if (Q.has("wave")) window.__dev.wave(Number(Q.get("wave")));
  }
  last = CLOCK.perf();
  RAF(loop);
  welcome();
}
boot();
