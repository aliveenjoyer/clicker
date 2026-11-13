// Правила игры без единой строчки интерфейса: состояние, удар, наёмники, волны, боссы, умения, огонёк, возрождение.
// Этот модель потом переедет на сервер (PLAN.md § 19): клиент шлёт намерения, сервер считает то же самое.
// Все большие числа — lg (см. num.js). События для картинки и звука складываются в S.ev, их забирает main.js.
import { NEG, L10, lsum, lsub, lg, txt, group } from "./num.js";
import { CFG, MILESTONES, HEROES, heroCost0, heroDps0, WHIP_COST0, SKILLS, BUFFS, WISP, RELICS, bossOf, UNLOCKS, ITEMS, ITEM_MAX, BRANCH, branchTier, RARITY, STARS, LANE, ACH_LADDERS, ACH_SINGLE, PATRONS, KEEP, TSKINS, TSKIN_RAR, TASKS, RPG_SKINS } from "./data.js";

const N = HEROES.length;
const L2 = L10(2), L4 = L10(4);
const LG_KEYS = ["souls", "life", "run", "ash", "ashAll", "altarPaid", "ashLife"];   // поля-логарифмы: в сохранении NEG пишется как null

export function newState() {
  const S = {
    v: 1, at: Date.now(),
    souls: NEG, life: NEG, run: NEG,
    lv: new Array(N + 1).fill(0), lvRun: 0,
    z: 1, zrec: 1, best: 1, kills: 0, hp: 1, mode: "push", wall: false, bossT: 0,
    runZ: 1, pw0: { t: 0, n: 0 },                           // датчик темпа: волна, с которой начат забег, и счётчики движения вперёд на его старте
    rr: { z: 0, hit: 0, log: [] },                          // путь до рекорда: рекорд, с которым начат забег (0 — нет), за сколько секунд до него дошли (0 — ещё нет), прошлые времена
    combo: 0, comboIdle: 0, tier: -1,
    cd: {}, act: {}, buff: {}, flAcc: 0, bucket: 40,
    wispIn: 0, wispOn: 0, wisps: 0,
    ash: NEG, ashAll: NEG, rb: 0, rel: {},
    items: {}, draft: null, drafts: 0, forgiven: 0,
    auto: { on: false, fav: [] },                           // автовыбор предметов: включён ли и любимые предметы по порядку важности
    au: { left: 0, pay: 0, total: 0, back: 0, w: 0, renew: false },   // автозапуск умений: секунд осталось, цена часа, сколько вернётся, сколько уже вернулось, волна покупки, продлевать ли
    grd: { lv: 0, left: 1, dealt: NEG, last: 0 },           // Страж Затмения: номер в цикле (с нуля), доля здоровья, урон идущего натиска (lg), доля, снятая прошлым
    wispKind: "",                                           // что принесёт огонёк, который сейчас на линии
    col: {}, feat: {}, failRow: 0, idleT: 0, waveLog: [],
    seenT: 0, crate: false, crateIn: 0, altar: 0, altarIn: 0, altarPaid: NEG,
    statueIn: 20, statueOn: 0, statues: { dmg: 0, souls: 0, crit: 0, timer: 0 },
    urnIn: 15, urnOn: 0, urnHits: 0, album: { crates: 0, altars: 0, statues: 0, urns: 0, elites: 0 },
    un: {}, stats: { clicks: 0, kills: 0, bosses: 0, crits: 0, played: 0, swapped: 0 },
    ach: {}, achSeen: 0, sess: 0, achT: 0,                  // ачивки: полученные; сколько игрок уже видел; этот заход, с; до следующей проверки
    // второй слой. Цикл — от Затмения до Затмения: ashAll и реликвии живут в цикле, осколки и покровители — навсегда
    ecl: 0, shards: 0, pat: {}, cycBest: 1, cycRb: 0, ashLife: NEG, eclAt: 0,   // eclAt — когда было прошлое Затмение, мс
    chaos: 0,                                               // третий слой: шаги «Скупщика теней», 0…16
    // удержание: сундуки (air/day — ждут открытия, airT — секунд просмотра до следующего, dry — сундуков без нового скина),
    // задания дня (list — [{id, base}], done, all — сундук дня уже выдан, streak — серия, full — последний полный день),
    // скины труперов (own — копий, on — в строю), скины героев из RPG (приходят с сервера)
    chest: { air: 0, airT: 0, day: 0, dry: 0 },
    tsk: { day: 0, list: [], done: [], all: false, streak: 0, full: 0 },
    skins: { own: {}, on: { std: true } },
    rpg: { skins: [] },
    set: { sound: true, calm: false, sci: false, autoBoss: true },
  };
  for (const r of RELICS) S.rel[r.id] = 0;
  for (const p of PATRONS) S.pat[p.id] = 0;
  for (const s of SKILLS) { S.cd[s.id] = 0; S.act[s.id] = 0; }
  S.ev = [];
  derive(S);
  return S;
}

export function save(S) {
  const o = {};
  for (const k in S) if (k !== "ev" && k !== "d" && k !== "live" && k !== "watch" && k !== "sess" && k !== "achT") o[k] = S[k];
  o.at = Date.now();
  return JSON.stringify(o, (k, v) => (v === -Infinity ? null : v));
}
export function load(text) {
  const S = newState();
  let o = null;
  try { o = JSON.parse(text); } catch (e) { return S; }
  if (!o || o.v !== 1) return S;
  for (const k in o) {
    if (k === "rel" || k === "cd" || k === "act" || k === "set" || k === "stats" || k === "statues" || k === "album") Object.assign(S[k], o[k]);
    else S[k] = o[k];
  }
  for (const k of LG_KEYS) if (S[k] === null || S[k] === undefined) S[k] = NEG;
  S.ash = ashInt(S.ash); S.ashAll = ashInt(S.ashAll);       // пепел — целый: дробные остатки прежних версий срезаются
  if (S.lv.length < N + 1) S.lv = S.lv.concat(new Array(N + 1 - S.lv.length).fill(0));
  if (!S.ach || typeof S.ach !== "object") S.ach = {};
  S.sess = 0; S.achT = 0;
  // второй и третий слой: уровни покровителей — целые, не выше потолка и не дороже имеющихся осколков (иначе — сброс уровней,
  // осколки остаются и тратятся заново); шаги Скупщика — 0…chaosMax
  S.shards = Math.max(0, Math.floor(Number(S.shards) || 0)); S.ecl = Math.max(0, Math.floor(Number(S.ecl) || 0));
  S.chaos = Math.max(0, Math.min(CFG.chaosMax, Math.floor(Number(S.chaos) || 0)));
  S.eclAt = Math.max(0, Number(S.eclAt) || 0);
  S.pat = {};
  for (const p of PATRONS) S.pat[p.id] = Math.max(0, Math.min(p.cap || 100000, Math.floor(Number(o.pat && typeof o.pat === "object" ? o.pat[p.id] : 0) || 0)));
  // автозапуск умений: час, который идёт, — только если числа сходятся (иначе как будто его не было: осколки свободны).
  // Стоит до проверки покровителей: занятые часом осколки входят в счёт свободных.
  const ou = o.au && typeof o.au === "object" ? o.au : {}, ui = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  const up = ui(ou.pay, 1e9), ut = ui(ou.total, 2e9), ub = ui(ou.back, 2e9), ul = Math.max(0, Math.min(CFG.auHour, Number(ou.left) || 0));
  S.au = ul > 0 && up >= 1 && ut > up && ut <= 2 * up && ub < ut ? { left: ul, pay: up, total: ut, back: ub, w: ui(ou.w, 1e9), renew: !!ou.renew }
    : { left: 0, pay: 0, total: 0, back: 0, w: 0, renew: !!ou.renew };
  S.stats.auHours = ui(S.stats.auHours, 1e9); S.stats.auGain = ui(S.stats.auGain, 1e12);
  if (shardsFree(S) < 0) for (const p of PATRONS) S.pat[p.id] = 0;
  if (o.cycBest === undefined) { S.cycBest = S.best; S.cycRb = S.rb; }      // сохранение до второго слоя: весь прежний путь — первый цикл
  // удержание: всё приводится к виду, который ждёт игра; чего в сохранении нет или что испорчено — как у нового игрока
  const N0 = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  const oc = o.chest && typeof o.chest === "object" ? o.chest : {}, ot = o.tsk && typeof o.tsk === "object" ? o.tsk : {};
  S.chest = { air: N0(oc.air, KEEP.airCap), airT: Math.max(0, Math.min(KEEP.airEvery, Number(oc.airT) || 0)), day: N0(oc.day, 30), dry: N0(oc.dry, 1000) };
  const tl = (Array.isArray(ot.list) ? ot.list : []).filter((q) => q && TASKS.some((t) => t.id === q.id)).slice(0, 3).map((q) => ({ id: q.id, base: Math.max(0, Number(q.base) || 0) }));
  S.tsk = { day: N0(ot.day, 1e7), list: tl, done: tl.map((q, i) => !!(Array.isArray(ot.done) && ot.done[i])), all: !!ot.all && tl.length > 0, streak: N0(ot.streak, 100000), full: N0(ot.full, 1e7) };
  const os = o.skins && typeof o.skins === "object" ? o.skins : {};
  S.skins = { own: {}, on: { std: !os.on || os.on.std !== false } };
  for (const x of TSKINS) { const n = N0(os.own && os.own[x.id], 100000); if (n) { S.skins.own[x.id] = n; S.skins.on[x.id] = !os.on || os.on[x.id] !== false; } }
  if (!lineSkins(S).length) S.skins.on.std = true;
  const og = o.rpg && typeof o.rpg === "object" && Array.isArray(o.rpg.skins) ? o.rpg.skins : [];
  S.rpg = { skins: og.filter((id, i) => RPG_SKINS[id] && og.indexOf(id) === i).sort() };
  if (o.ashLife === undefined) S.ashLife = S.ashAll;
  // датчик темпа: в сохранении до него нет старта забега — среднее за забег считается с этой загрузки
  const num = (v) => Math.max(0, Number(v) || 0);
  S.stats.pushT = num(S.stats.pushT); S.stats.pushN = Math.floor(num(S.stats.pushN));
  S.runZ = o.runZ === undefined ? Math.min(S.zrec, 1 + 10 * (S.rel.start || 0)) : Math.max(1, Math.min(S.zrec, Math.floor(num(o.runZ)) || 1));
  const op = o.pw0 && typeof o.pw0 === "object" ? o.pw0 : null;
  S.pw0 = op ? { t: Math.min(S.stats.pushT, num(op.t)), n: Math.min(S.stats.pushN, Math.floor(num(op.n))) } : { t: S.stats.pushT, n: S.stats.pushN };
  if (!Array.isArray(S.waveLog)) S.waveLog = [];
  const orr = o.rr && typeof o.rr === "object" ? o.rr : {};
  S.rr = { z: Math.floor(num(orr.z)), hit: num(orr.hit), log: (Array.isArray(orr.log) ? orr.log : []).map(Number).filter((v) => v > 0 && v < 1e7).slice(-10) };
  S.stats.reachT = num(S.stats.reachT); S.stats.reachN = Math.floor(num(S.stats.reachN));
  const og2 = o.grd && typeof o.grd === "object" ? o.grd : {};
  const gl = Number(og2.left);
  S.grd = { lv: N0(og2.lv, 100000), left: gl > 0 && gl <= 1 ? gl : 1, dealt: NEG, last: Math.max(0, Math.min(1, Number(og2.last) || 0)) };
  S.wispKind = WISP.some((w) => w.id === o.wispKind) ? o.wispKind : "";
  const oa = o.auto && typeof o.auto === "object" ? o.auto : {};
  S.auto = { on: !!oa.on, fav: (Array.isArray(oa.fav) ? oa.fav : []).filter((id, i, a) => ITEMS.some((x) => x.id === id) && a.indexOf(id) === i) };
  S.ev = [];
  derive(S);
  return S;
}

// ---------- формулы ----------
const hpPref = [0];
export function hpLg(z) {                                   // lg здоровья трупера на волне z
  let h = L10(CFG.hp0) + L10(CFG.hp1) * (Math.min(z, CFG.knee) - 1);
  const rest = z - CFG.knee;
  if (rest > 0) {
    const E = CFG.lateEvery, n = Math.floor(rest / E), r = rest % E;
    while (hpPref.length <= n) hpPref.push(hpPref[hpPref.length - 1] + E * L10(CFG.hp2 + CFG.lateStep * (hpPref.length - 1)));
    h += hpPref[n] + r * L10(CFG.hp2 + CFG.lateStep * n);
  }
  return h;
}
export const isBoss = (z) => z % CFG.bossEvery === 0;
// элита: пятый трупер каждой третьей волны
export const isElite = (S) => !!S.un.elite && !isBoss(S.z) && S.z % LANE.elite.eachWave === 0 && S.kills === LANE.elite.at && !(S.altar > 0);
export const targetHp = (S) => hpLg(S.z) + (isBoss(S.z) ? L10(CFG.bossHp) : isElite(S) ? L10(LANE.elite.hp) : 0);
const lootBase = (z) => Math.max(0, hpLg(z) - L10(CFG.lootDiv));       // души за трупера: здоровье / 10, но не меньше одной

export function msMult(lv) {                                // lg множителя вех
  let m = 0;
  for (const t of MILESTONES) if (lv >= t) m += L2;
  if (lv >= 200) m += L4 * (Math.floor((lv - 200) / 25) + 1);
  return m;
}
export function nextMs(lv) {
  for (const t of MILESTONES) if (lv < t) return t;
  return lv < 200 ? 200 : 200 + 25 * (Math.floor((lv - 200) / 25) + 1);
}
export const msGain = (lv) => (nextMs(lv) < 200 ? 2 : 4);   // что даст следующая веха
// Рост цены уровня. Третий слой («Великий хаос»): каждый шаг «Скупщика теней» снимает chaosCut, но не ниже costFloor —
// цена обязана расти быстрее урона на вехах (4^(1/25) = 1,057), иначе рост уходит в бесконечность.
// Шаг даётся за Затмение, сделанное с рекордом от chaosWave (см. eclipse): по одному в сутки.
export const chaosStep = (S) => Math.min(CFG.chaosMax, S.chaos || 0);
export const chaosOpen = (S) => S.best >= CFG.chaosWave;
export const costG = (S) => Math.max(CFG.costFloor, CFG.costG - CFG.chaosCut * chaosStep(S));
function chunkCost(S, base, lv, n) {                        // lg цены уровней lv..lv+n−1
  const c = S.d.cg, lgc = L10(c), x = n * lgc;
  return base + lv * lgc + x + (x < 15 ? L10(1 - Math.pow(10, -x)) : 0) - L10(c - 1);
}
function affordable(S, bank, base, lv) {
  if (bank === NEG) return 0;
  const c = S.d.cg, lgc = L10(c), x = bank + L10(c - 1) - (base + lv * lgc);
  return Math.max(0, Math.floor(lsum(x, 0) / lgc + 1e-9));
}

// Всё, что зависит только от покупок и реликвий. Пересчитывается после каждой покупки.
export function derive(S) {
  const D = (S.d = {});
  const raw = (id) => S.items[id] || 0;                                 // ранг предмета в этом забеге
  const it = (id) => raw(id) * (1 + 0.1 * Math.max(0, starsOf(S, id) - 1));   // сила: ранг и звёзды
  let g = S.rel.blade * L10(1.2) + it("item-w-monster") * L10(1.08) + L10(1 + 0.5 * it("item-l-frenzy")) + L10(1 + 0.02 * S.statues.dmg);
  if (S.ashAll > NEG) g += S.ashAll > 12 ? S.ashAll + L10(CFG.ashDmg) : L10(1 + CFG.ashDmg * Math.pow(10, S.ashAll));
  g += L10(1 + CFG.achDmg * achCount(S));                    // ачивки: +1 % урона за каждую
  g += 0.5 * (S.pat.wrath || 0);                             // покровитель «Гнев»: ×3,16 за уровень
  let rg = 0;
  for (const id of S.rpg.skins) rg += L10(rpgSkinMul(id));    // скины героев из RPG: весь урон ×1,5 / ×2 / ×3 за скин
  D.rpg = rg; g += rg;
  D.gmul = g;
  D.cg = costG(S);
  D.hero = [NEG];
  let d = NEG, top = 0;
  for (let i = 1; i <= N; i++) {
    const lv = S.lv[i];
    const h = lv ? heroDps0(i) + L10(lv) + msMult(lv) + g : NEG;
    D.hero.push(h);
    d = lsum(d, h);
    if (lv) top = i;
  }
  D.dps = d; D.top = top;
  const br = (D.br = { w: 0, v: 0, s: 0 });
  for (const x of ITEMS) br[x.branch] += raw(x.id);
  D.whip = L10(1 + S.lv[0]) + msMult(S.lv[0]) + g + L10(1 + 0.2 * it("item-w-glass")) + L10(BRANCH.w.click[branchTier(br.w)]);
  D.share = CFG.clickOfDps + 0.01 * S.rel.hand;
  D.souls = S.rel.greed * L10(1.15) + L10(1 + 0.5 * it("item-x-curse")) + L10(1 + 0.02 * S.statues.souls)
    + L10(1 + KEEP.streakStep * Math.min(KEEP.streakMax, S.tsk.streak));   // серия дней: души +10 % за день, до +100 %
  D.crit = CFG.critChance + 0.03 * it("item-w-lucky") + 0.01 * S.statues.crit;
  D.bossTime = Math.max(5, CFG.bossTime + 2 * S.rel.clock + 2 * it("item-v-unstoppable") - it("item-w-glass") + 5 * it("item-l-cheat") + S.statues.timer + BRANCH.v.timer[branchTier(br.v)]);
  D.bossMul = S.rel.colossus * L10(1.25) + L10(1 + 0.1 * it("item-v-colossus"));
  D.cdMul = (1 - 0.04 * it("item-s-cooldown")) * BRANCH.s.cd[branchTier(br.s)];
  D.durMul = 1 + 0.08 * it("item-s-boundless") + 0.5 * it("item-l-echo");
  D.buffMul = 1 + 0.1 * it("item-s-burst");
  D.flurry = 10 + 2 * it("item-s-charge");
  D.wispMul = Math.max(0.5, 1 - 0.1 * it("item-s-refresher"));
  D.rushCap = L10(CFG.rush * CFG.mobs * (1 + 0.15 * it("item-w-fleet")) * (1 + it("item-x-carpet"))) + L2 * (S.pat.rush || 0);   // покровитель «Прорыв»: вдвое за уровень
  D.tesla = 0.15 * it("item-w-tesla");
  D.pet = S.un.pet ? Math.min(0.8, 0.2 + 0.05 * it("item-v-beam")) : 0;
  D.offEff = Math.min(1, CFG.offEff + 0.05 * S.rel.urn + 0.05 * it("item-v-rite") + 0.25 * it("item-x-weave"));
  D.barrier = raw("item-v-barrier") + raw("item-l-cheat");
  D.slots = Math.min(12, 4 + S.rel.slot);
  return D;
}

export function starsOf(S, id) {                            // звёзды предмета по числу взятий за всё время
  const n = S.col[id] || 0;
  let st = 0;
  for (const t of STARS) if (n >= t) st += 1;
  return st;
}
export function starNext(S, id) {                           // сколько взятий до следующей звезды; 0 — максимум
  const n = S.col[id] || 0;
  for (const t of STARS) if (n < t) return t - n;
  return 0;
}
function feat(S, key) {                                     // подвиг: открывает легендарный или тайный предмет
  if (S.feat[key]) return;
  S.feat[key] = true;
  const x = ITEMS.find((q) => q.feat === key);
  if (x) ev(S, { t: "feat", key, id: x.id, name: x.name, rar: x.rar });
}

// Бафы: внутри группы складываются, группы перемножаются.
function buffLg(S, field) {
  let x = 1;
  for (const id in BUFFS) {
    const b = BUFFS[id];
    if (b[field] && (S.act[id] > 0 || S.buff[id] > 0)) x += (b[field] - 1) * S.d.buffMul;
  }
  return L10(x);
}
export const active = (S, id) => S.act[id] > 0 || S.buff[id] > 0;

export function comboTier(S) {
  let t = -1;
  for (let i = 0; i < CFG.combo.length; i++) if (S.combo >= CFG.combo[i][0]) t = i;
  return t;
}
export const dpsLg = (S) => (S.d.dps === NEG ? NEG : S.d.dps + buffLg(S, "dmg") + buffLg(S, "dps"));
const rushCap = (S) => S.d.rushCap + (S.buff.tide > 0 ? L10(3) : 0);   // баф «Прилив»: слабые волны пролетают втрое быстрее
export function clickLg(S) {                                // lg урона одного удара, без крита
  const D = S.d;
  const base = D.dps === NEG ? D.whip : lsum(D.whip, D.dps + L10(D.share));
  const t = S.un.combo ? comboTier(S) : -1;
  return base + buffLg(S, "dmg") + buffLg(S, "click") + (t >= 0 ? L10(CFG.combo[t][1]) : 0);
}
export const critChance = (S) => Math.min(0.75, active(S, "mark") ? 0.5 + (S.d.crit - CFG.critChance) : S.d.crit);
export const critMult = (S) => (active(S, "mark") ? 5 : CFG.critMult);
const soulsLg = (S) => S.d.souls + buffLg(S, "souls") + (S.live ? L2 : 0);          // эфир: души ×2
export function setLive(S, v) { S.live = !!v; }
export function rateLg(S) {                                 // lg душ в секунду от наёмников на этой волне
  const d = dpsLg(S);
  if (d === NEG) return NEG;
  const z = isBoss(S.z) ? S.z - 1 : S.z;
  return Math.min(d - hpLg(z), rushCap(S)) + lootBase(z) + soulsLg(S);
}

// ---------- события и открытия ----------
const ev = (S, e) => { if (S.ev.length < 400) S.ev.push(e); };
function gain(S, l) {
  S.souls = lsum(S.souls, l); S.life = lsum(S.life, l); S.run = lsum(S.run, l);
}
export function checkUnlocks(S) {
  for (const u of UNLOCKS) {
    if (S.un[u.key]) continue;
    const ok = u.kind === "wave" ? S.best >= u.at : u.kind === "rb" ? S.rb >= u.at : S.souls >= lg(u.at);
    if (ok) { S.un[u.key] = true; if (u.key === "pet") derive(S); ev(S, { t: "unlock", key: u.key, title: u.title, say: u.say }); }
  }
}

// ---------- волны ----------
function startWave(S) {
  S.hp = 1; S.kills = 0;
  S.waveLog.push(S.stats.played); if (S.waveLog.length > 30) S.waveLog.shift();
  if (S.waveLog.length === 30 && S.stats.played - S.waveLog[0] <= 60) feat(S, "carpet");
  if (S.z > S.zrec) {                                       // пройденная волна — новый рекорд забега
    S.zrec = S.z; S.stats.pushN = (S.stats.pushN || 0) + 1;
    if (S.rr.z && !S.rr.hit && S.zrec >= S.rr.z) {           // забег дошёл до рекорда, с которым начинался
      const t = Math.max(0.1, S.stats.played - (S.stats.rbAt || 0));
      S.rr.hit = t; S.rr.log.push(Math.round(t * 10) / 10); if (S.rr.log.length > 10) S.rr.log.shift();
      S.stats.reachT = (S.stats.reachT || 0) + t; S.stats.reachN = (S.stats.reachN || 0) + 1;
      ev(S, { t: "reach", sec: t, z: S.rr.z });
    }
  }
  if (S.z > S.cycBest) S.cycBest = S.z;
  if (S.z > S.best) S.best = S.z;
  if (isBoss(S.z)) { S.bossT = S.d.bossTime + (S.buff.clock > 0 ? 15 : 0); ev(S, { t: "boss_in", z: S.z, boss: bossOf(S.z) }); }   // «Карманные часы»: +15 с
  else ev(S, { t: "wave", z: S.z });
  checkUnlocks(S);
}
function kill(S, src) {
  const elite = isElite(S);
  const l = lootBase(S.z) + soulsLg(S) + (elite ? L10(LANE.elite.loot) : 0);
  gain(S, l);
  S.kills += 1; S.stats.kills += 1;
  if (elite) S.album.elites += 1;
  ev(S, { t: "kill", loot: l, src, z: S.z, elite });
  if (S.kills >= CFG.mobs) {
    if (S.mode === "push") { S.z += 1; startWave(S); }
    else S.kills = 0;
  }
}
function bossWin(S) {
  const l = lootBase(S.z) + L10(CFG.bossLoot) + soulsLg(S);
  gain(S, l);
  if (S.d.bossTime - S.bossT <= 3) achMark(S, "fastboss");
  if (S.bossT <= 1) achMark(S, "clutch");
  if (S.failRow > 0) achMark(S, "revenge");
  S.stats.bosses += 1; S.failRow = 0;
  if (S.stats.bosses >= 25) feat(S, "cheat");
  ev(S, { t: "boss_win", z: S.z, loot: l, boss: bossOf(S.z) });
  offerDraft(S);
  S.wall = false;
  S.z += 1; startWave(S);
}
function bossFail(S) {
  if (S.forgiven < S.d.barrier) {                           // Divine Barrier: ещё одна попытка
    S.forgiven += 1; S.bossT = S.d.bossTime; ev(S, { t: "barrier" });
    achMark(S, "barrier");
    return;
  }
  S.stats.fails = (S.stats.fails || 0) + 1;
  ev(S, { t: "boss_fail", z: S.z, boss: bossOf(S.z) });
  S.failRow += 1; if (S.failRow >= 3) feat(S, "curse");
  S.z -= 1; S.mode = "farm"; S.wall = true; S.hp = 1; S.kills = 0;
}
export function canBeatBoss(S) {                            // хватит ли наёмников на босса следующей волны
  const d = dpsLg(S);
  return d !== NEG && d + S.d.bossMul + L10(S.d.bossTime) >= hpLg(S.z + 1) + L10(CFG.bossHp);
}
export function goBoss(S) {                                 // «На босса»
  if (S.altar > 0 || (!S.wall && S.mode === "push")) return;
  S.mode = "push"; S.wall = false; S.z += isBoss(S.z + 1) ? 1 : 0;
  if (isBoss(S.z)) startWave(S);
}
export function setMode(S, mode) {
  if (isBoss(S.z)) return;
  S.mode = mode; if (mode === "push") S.wall = false;
}

function damage(S, dmg, src) {                              // нанести dmg (lg) текущей цели
  if (S.act.siege > 0) S.grd.dealt = lsum(S.grd.dealt, dmg);   // идёт «Натиск»: тот же урон идёт ещё и в Стража Затмения
  const boss = isBoss(S.z);
  S.hp -= Math.pow(10, Math.min(6, dmg + (boss ? S.d.bossMul : 0) - targetHp(S)));
  if (S.hp > 0) return;
  if (boss) { bossWin(S); return; }
  let guard = CFG.mobs;                                     // лишний урон уходит в следующих, не дальше одной волны
  while (S.hp <= 0 && guard-- > 0 && !isBoss(S.z)) { kill(S, src); S.hp += 1; }
  if (S.hp <= 0 || isBoss(S.z)) S.hp = 1;
}

// ---------- удар ----------
export function hit(S, src, weak) {                         // src: click | hold | flurry; weak — попал в слабое место босса
  if (src !== "flurry") {
    if (S.bucket < 1) return false;                         // не больше 15 ударов в секунду, запас 40
    S.bucket -= 1; S.stats.clicks += 1; S.idleT = 0;
  }
  if (S.un.combo) {
    const before = comboTier(S);
    S.combo += src === "hold" ? 0.5 : 1; S.comboIdle = 0;
    if (S.combo >= 250) feat(S, "frenzy");
    const now = comboTier(S);
    if (now > before) {
      ev(S, { t: "tier", i: now, name: CFG.combo[now][2] });
      if (!(S.altar > 0)) damage(S, clickLg(S) + L10(CFG.groundStrike), "strike");
    }
  }
  if (S.altar > 0) { altarHit(S); return true; }            // стоит жертвенник: удары идут в него
  const crit = Math.random() < critChance(S);
  const wk = !!weak && !!S.un.weak && isBoss(S.z);
  const dmg = clickLg(S) + (crit ? L10(critMult(S)) : 0) + (wk ? L10(LANE.weak.mult) : 0);
  if (crit) S.stats.crits += 1;
  if (wk) S.stats.weak = (S.stats.weak || 0) + 1;
  ev(S, { t: "hit", dmg, crit, src, weak: wk });
  damage(S, dmg, src);
  if (S.d.tesla && Math.random() < S.d.tesla) damage(S, dmg, "tesla");   // Tesla Bullets: удар повторяется
  return true;
}

// ---------- ход времени ----------
export function tick(S, dt, live) {                         // live=false — офлайн: без умений, комбо и огоньков
  S.stats.played += live ? dt : 0;
  if (live && S.mode === "push" && !S.wall) S.stats.pushT = (S.stats.pushT || 0) + dt;   // время движения вперёд: не «Фарм» и не стена перед боссом
  if (live) {
    S.sess += dt;
    if (S.live) S.stats.live = (S.stats.live || 0) + dt;      // идёт стрим aliveenjoyer
    S.achT += dt; if (S.achT >= 0.25) { S.achT = 0; checkAch(S); stepKeep(S); }
    if (S.watch && S.live && S.chest.air < KEEP.airCap) {     // сундук эфира: копится, пока свой стрим идёт фоном в игре
      S.chest.airT += dt;
      if (S.chest.airT >= KEEP.airEvery) { S.chest.airT -= KEEP.airEvery; S.chest.air += 1; ev(S, { t: "chest_in", kind: "air" }); }
    }
  }
  S.bucket = Math.min(40, S.bucket + CFG.clickCap * dt);
  if (live) {
    S.idleT += dt;
    if (S.idleT >= 300 && S.d.dps !== NEG) feat(S, "weave");
    for (const s of SKILLS) {
      if (S.cd[s.id] > 0) S.cd[s.id] = Math.max(0, S.cd[s.id] - dt);
      if (S.act[s.id] > 0) { S.act[s.id] = Math.max(0, S.act[s.id] - dt); if (S.act[s.id] === 0) { ev(S, { t: "buff_end", id: s.id }); if (s.id === "siege") siegeEnd(S); } }
    }
    auStep(S, dt);
    for (const id in S.buff) if (S.buff[id] > 0) { S.buff[id] = Math.max(0, S.buff[id] - dt); if (S.buff[id] === 0) ev(S, { t: "buff_end", id }); }
    if (S.un.combo && S.combo > 0) {
      S.comboIdle += dt;
      if (S.comboIdle > CFG.comboHold) S.combo = Math.max(0, S.combo - CFG.comboDrain * dt);
    }
    if (S.act.flurry > 0) {
      S.flAcc += S.d.flurry * dt;
      while (S.flAcc >= 1) { S.flAcc -= 1; hit(S, "flurry"); }
    }
    if (S.un.wisp) {
      if (S.wispOn > 0) { S.wispOn -= dt; if (S.wispOn <= 0) { S.wispOn = 0; ev(S, { t: "wisp_gone" }); scheduleWisp(S); } }
      else { S.wispIn -= dt; if (S.wispIn <= 0) { S.wispOn = CFG.wispLife; S.wispKind = rollWisp(S); ev(S, { t: "wisp", id: S.wispKind }); } }
    }
    S.seenT += dt;
    if (S.un.crate && !S.crate) { S.crateIn -= dt; if (S.crateIn <= 0) { S.crate = true; ev(S, { t: "crate_in" }); } }
    if (S.un.statue) {
      if (S.statueOn > 0) { S.statueOn -= dt; if (S.statueOn <= 0) { S.statueOn = 0; S.statueIn = span(LANE.statue.every); } }
      else { S.statueIn -= dt; if (S.statueIn <= 0) { S.statueOn = LANE.statue.time; ev(S, { t: "statue" }); } }
    }
    if (S.un.urn) {
      if (S.urnOn > 0) { S.urnOn -= dt; if (S.urnOn <= 0) urnDone(S); }
      else { S.urnIn -= dt; if (S.urnIn <= 0) { S.urnOn = LANE.urn.time; S.urnHits = 0; ev(S, { t: "urn" }); } }
    }
    if (S.altar > 0) {                                      // пока стоит жертвенник, наёмники ждут
      S.altar -= dt;
      if (S.altar > 0) return;
      altarEnd(S);
    } else if (S.un.altar) {                                // жертвенник приходит, только когда игрок на месте
      if (S.altarIn > 0) S.altarIn -= dt;
      if (S.altarIn <= 0 && !isBoss(S.z) && S.seenT < LANE.altar.away) { S.altar = LANE.altar.time; S.altarPaid = NEG; ev(S, { t: "altar_in" }); }
    }
  } else if (S.altar > 0) altarEnd(S);
  const d = dpsLg(S);
  if (S.act.siege > 0 && d !== NEG) S.grd.dealt = lsum(S.grd.dealt, d + L10(dt));   // «Натиск»: наёмники бьют и Стража
  if (isBoss(S.z)) {
    if (d !== NEG) S.hp -= Math.pow(10, Math.min(6, d + S.d.bossMul - targetHp(S))) * dt;
    S.bossT -= dt;
    if (S.hp <= 0) bossWin(S);
    else if (S.bossT <= 0) bossFail(S);
  } else if (d !== NEG) {
    const rate = Math.pow(10, Math.min(d - targetHp(S), rushCap(S)));
    S.hp -= rate * dt;
    let guard = 400;
    while (S.hp <= 0 && guard-- > 0 && !isBoss(S.z)) { kill(S, "dps"); S.hp += 1; }
    if (isBoss(S.z)) S.hp = 1;
  }
  if (S.wall && S.set.autoBoss && !isBoss(S.z) && canBeatBoss(S)) goBoss(S);
}

// Офлайн: только наёмники, CFG.offEff скорости, не дольше окна. Возвращает, что набежало.
export function offline(S, seconds) {
  const cap = CFG.offCap + 3600 * S.rel.urn;
  const eff = S.d.offEff;
  const t = Math.min(seconds, cap) * eff;
  const before = { souls: S.souls, z: S.z, life: S.life };
  if (S.act.siege > 0) siegeEnd(S);                         // натиск оборвался: что успели снять — снято
  for (const id in S.act) S.act[id] = 0;                    // умения и бафы за время отсутствия истекли
  S.buff = {}; S.combo = 0; S.wispOn = 0; S.statueOn = 0; S.urnOn = 0; if (S.altar > 0) altarEnd(S);
  if (S.d.dps === NEG || t < 5) return null;
  const step = 2;
  for (let x = 0; x < t; x += step) tick(S, step, false);
  S.ev.length = 0;
  for (const id in S.cd) S.cd[id] = Math.max(0, S.cd[id] - seconds);
  return { seconds, counted: Math.min(seconds, cap), eff, gained: lsub(S.life, before.life), waves: S.z - before.z };
}

// ---------- покупки ----------
export function buyInfo(S, i, mode) {                       // mode: 1 | 10 | "ms" | "max"
  const lv = S.lv[i], base = i ? heroCost0(i) : WHIP_COST0;
  let n = mode === "ms" ? nextMs(lv) - lv : mode === "max" ? Math.max(1, affordable(S, S.souls, base, lv)) : mode;
  const cost = chunkCost(S, base, lv, n);
  return { n, cost, can: cost <= S.souls };
}
export function buy(S, i, mode) {
  const b = buyInfo(S, i, mode);
  if (!b.can) return false;
  const before = S.lv[i];
  S.souls = lsub(S.souls, b.cost);
  S.lv[i] += b.n; S.lvRun += b.n;
  derive(S);
  const ms = nextMs(before) <= S.lv[i];
  ev(S, { t: "buy", i, n: b.n, first: before === 0, ms, gain: ms ? msGain(before) : 0 });
  return true;
}
export function heroesShown(S) {                            // сколько строк показывать: нанятые + следующий
  let n = 0;
  for (let i = 1; i <= N; i++) if (S.lv[i]) n = i;
  return Math.min(N, n + 1);
}

// ---------- умения и огонёк ----------
export function skillOpen(S, s) { return s.need === "rb1" ? S.rb >= 1 : s.need === "ecl" ? eclOpen(S) : S.best >= s.wave; }
export function useSkill(S, id) {
  const s = SKILLS.find((x) => x.id === id);
  if (!s || !skillOpen(S, s) || S.cd[id] > 0) return false;
  S.cd[id] = s.cd * S.d.cdMul;
  if (id === "siege") S.grd.dealt = NEG;                    // «Натиск»: счёт урона по Стражу с нуля
  if (id === "rewind") {
    const r = rateLg(S);
    if (r !== NEG) { const l = r + L10(3600); gain(S, l); ev(S, { t: "gift", loot: l, title: "Перемотка" }); }
  } else {
    S.act[id] = (s.dur + (id === "flurry" ? 3 * S.rel.flurry : 0)) * S.d.durMul;
    if (id === "ult" && S.altar > 0) { for (let i = 0; i < LANE.altar.ult && S.altar > 0; i++) altarHit(S); }   // ульта по жертвеннику — тридцать ударов разом
    else if (id === "ult" && !isBoss(S.z)) {
      const until = S.z + 3;
      let guard = 40;
      while (S.z < until && !isBoss(S.z) && guard-- > 0) kill(S, "ult");
      S.hp = 1;
    }
  }
  S.stats.skills = (S.stats.skills || 0) + 1;
  if (id === "ult") S.stats.ults = (S.stats.ults || 0) + 1;
  ev(S, { t: "skill", id, name: s.name });
  return true;
}
function scheduleWisp(S) {                                  // следующий огонёк: 5–15 минут, чаще к концу окна
  const u = Math.pow(Math.random(), 1 / 5);
  S.wispIn = (CFG.wispMin + (CFG.wispMax - CFG.wispMin) * u) * S.d.wispMul * (S.live ? 0.5 : 1);   // в эфире огоньки вдвое чаще
}
function rollWisp(S) {                                       // что принесёт следующий огонёк; самый первый в игре — «Жатва»
  if (!S.wisps) return WISP[0].id;
  let r = Math.random();
  for (const x of WISP) { if (r < x.p) return x.id; r -= x.p; }
  return WISP[0].id;
}
export function takeWisp(S) {
  if (S.wispOn <= 0) return null;
  const w = WISP.find((x) => x.id === S.wispKind) || WISP.find((x) => x.id === rollWisp(S));
  S.wispOn = 0; S.wisps += 1; S.wispKind = "";
  if (S.wisps >= 10) feat(S, "echo");
  let loot = NEG;
  if (w.id === "catch") {
    const r = rateLg(S);
    loot = r === NEG ? S.souls + L10(0.15) : Math.min(S.souls + L10(0.15), r + L10(1200));
    if (loot !== NEG) gain(S, loot);
  } else if (w.id === "breath") { for (const s of SKILLS) S.cd[s.id] = 0; }   // «Второе дыхание»: все умения готовы
  else {
    S.buff[w.id] = w.dur * S.d.durMul;
    if (w.id === "clock" && isBoss(S.z)) S.bossT += 15;     // босс уже на линии — добавка сразу
  }
  scheduleWisp(S);
  ev(S, { t: "wisp_take", id: w.id, title: w.title, text: w.text, loot });
  return w;
}
export function orbBonus(S, loot) { gain(S, loot + L10(CFG.orbBonus)); S.stats.orbs = (S.stats.orbs || 0) + 1; }   // подобрал сферу: +50 % душ этого трупера

// ---------- обменник: души кликера → души RPG стрима ----------
// Здесь только цена в душах кликера. Сколько душ RPG можно взять за день, решает сервер (js/swap.js).
export const swapPriceLg = (n) => CFG.swapBase + Math.pow(n / CFG.swapK, 1 / CFG.swapP);   // lg цены n-й души RPG за день
export function swapMax(S, took, left) {                    // на сколько душ RPG хватает банка сейчас, не больше left
  let c = NEG, m = 0;
  while (m < left && m < 100000) {                          // потолок дня — 100 000; цикл на сотню тысяч шагов считается за миллисекунды
    c = lsum(c, swapPriceLg(took + m + 1));
    if (S.souls === NEG || c > S.souls) break;
    m++;
  }
  return m;
}
export function swapPay(S, took, m) {                       // списать цену m душ RPG, купленных после took
  let c = NEG;
  for (let k = 1; k <= m; k++) c = lsum(c, swapPriceLg(took + k));
  S.souls = S.souls === NEG || c >= S.souls ? NEG : lsub(S.souls, c);
  S.stats.swapped = (S.stats.swapped || 0) + m;
}

// ---------- события на линии ----------
const span = (a) => a[0] + Math.random() * (a[1] - a[0]);
export function touch(S) { S.seenT = 0; }                    // игрок что-то сделал: он на месте
export function breakCrate(S) {                             // ящик: 20 секунд дохода
  if (!S.crate) return false;
  S.crate = false; S.crateIn = span(LANE.crate.every); S.album.crates += 1;
  const r = rateLg(S), min = lootBase(S.z) + soulsLg(S) + L10(LANE.crate.min);
  const l = r === NEG ? min : Math.max(min, r + L10(LANE.crate.income));
  gain(S, l); ev(S, { t: "crate", loot: l });
  return true;
}
const STATUE = [["dmg", "урон +2 %"], ["souls", "души +2 %"], ["crit", "шанс крита +1 %"], ["timer", "таймер босса +1 с"]];
export function breakStatue(S) {                            // золотая статуя: маленький бонус до возрождения
  if (S.statueOn <= 0) return false;
  S.statueOn = 0; S.statueIn = span(LANE.statue.every);
  const pick = STATUE[Math.floor(Math.random() * STATUE.length)];
  S.statues[pick[0]] += 1; S.album.statues += 1;
  derive(S); ev(S, { t: "statue_take", k: pick[0], text: pick[1] });
  return true;
}
export function hitUrn(S) {                                 // урна: каждый удар +2 % к награде, до +100 %
  if (S.urnOn <= 0) return false;
  S.urnHits = Math.min(LANE.urn.hits, S.urnHits + 1);
  ev(S, { t: "urn_hit", n: S.urnHits });
  return true;
}
function urnDone(S) {                                       // урна долетела: 10 минут дохода и надбавка за удары
  S.urnOn = 0; S.urnIn = span(LANE.urn.every);
  if (S.urnHits <= 0) { ev(S, { t: "urn_done", loot: NEG, hits: 0 }); return; }
  const r = rateLg(S), min = lootBase(S.z) + soulsLg(S) + L10(50);
  const l = (r === NEG ? min : Math.max(min, r + L10(LANE.urn.income))) + L10(1 + LANE.urn.perHit * S.urnHits);
  S.album.urns += 1;
  gain(S, l); ev(S, { t: "urn_done", loot: l, hits: S.urnHits });
}
function altarHit(S) {                                      // удар по жертвеннику: души; всего не больше 10 минут дохода
  const A = LANE.altar, r = rateLg(S), one = lootBase(S.z) + soulsLg(S);
  const l = r === NEG ? one : Math.max(one, r + L10(A.hit));
  const cap = r === NEG ? one + L10(A.minHits) : Math.max(one + L10(A.minHits), r + L10(A.cap));
  const ok = S.altarPaid === NEG || lsum(S.altarPaid, l) <= cap + 1e-9;
  if (!ok) { altarEnd(S); return; }                         // потолок выбран: жертвенник уходит сразу, наёмники снова в деле
  gain(S, l); S.altarPaid = lsum(S.altarPaid, l);
  ev(S, { t: "altar_hit", loot: l });
}
function altarEnd(S) {
  S.altar = 0; S.altarIn = span(LANE.altar.every);
  if (S.altarPaid > NEG) S.album.altars += 1;
  ev(S, { t: "altar_out", loot: S.altarPaid });
}

// ---------- предметы забега ----------
function rollDraft(S) {                                     // три разных предмета; ячейки заняты — только то, что уже есть
  const owned = ITEMS.filter((x) => S.items[x.id]);
  const pool = (owned.length >= S.d.slots ? owned : ITEMS).filter((x) => (S.items[x.id] || 0) < (x.max || ITEM_MAX)
    && (!x.need || S.un[x.need] || S.items[x.id]) && (!x.feat || S.feat[x.feat]));
  const out = [];
  while (out.length < 3 && pool.length) {                   // выбор с весами редкости, без повторов
    let sum = 0; for (const x of pool) sum += RARITY[x.rar].w;
    let r = Math.random() * sum, i = 0;
    while (i < pool.length - 1 && (r -= RARITY[pool[i].rar].w) > 0) i++;
    out.push(pool.splice(i, 1)[0].id);
  }
  return out.length ? out : null;
}
// Автовыбор (открывается первым возрождением, ключ auto в UNLOCKS): предмет после босса берётся сам, карточки не выходят.
// Что берётся из трёх, по шагам: любимый предмет игрока (S.auto.fav — список по порядку важности) → тот, что уже лежит
// в ячейке (ранг растёт, новая ячейка не тратится) → новый. Внутри шага — редкость выше, потом тот, что игрок брал чаще.
const RAR_RANK = { c: 0, r: 1, l: 2, x: 2 };
export const autoOpen = (S) => !!S.un.auto;
export function autoChoice(S) {                             // что взял бы автовыбор из открытого выбора; null — выбора нет
  if (!S.draft) return null;
  let best = null, bk = null;
  for (const id of S.draft) {
    const x = ITEMS.find((q) => q.id === id), f = S.auto.fav.indexOf(id);
    const k = [f < 0 ? 1 : 0, f < 0 ? 0 : f, S.items[id] ? 0 : 1, -RAR_RANK[x.rar], -(S.col[id] || 0)];
    let c = 0;
    for (let i = 0; bk && i < k.length && !c; i++) c = k[i] - bk[i];
    if (!bk || c < 0) { best = id; bk = k; }
  }
  return best;
}
function openDraft(S) {                                     // выложить следующий выбор; с автовыбором — сразу взять
  S.draft = rollDraft(S);
  if (!S.draft) return;
  if (S.auto.on && autoOpen(S)) take(S, autoChoice(S), true);
  else ev(S, { t: "draft" });
}
function offerDraft(S) {
  if (S.draft) { S.drafts = Math.min(5, S.drafts + 1); return; }   // выбор уже открыт — этот ждёт очереди, не больше пяти
  openDraft(S);
}
function take(S, id, auto) {                                // предмет взят: игроком или автовыбором
  S.items[id] = (S.items[id] || 0) + 1;
  const before = starsOf(S, id);
  S.col[id] = (S.col[id] || 0) + 1;
  if (starsOf(S, id) > before && before > 0) ev(S, { t: "star", id, stars: starsOf(S, id) });
  S.draft = null;
  derive(S);
  ev(S, { t: "item", id, rank: S.items[id], auto: !!auto });
  if (S.drafts > 0) { S.drafts -= 1; openDraft(S); }
}
export function pickItem(S, id) {
  if (!S.draft || S.draft.indexOf(id) < 0) return false;
  take(S, id, false);
  return true;
}
export function setAuto(S, on) {                            // включить или выключить; открытый выбор и очередь разбираются сразу
  if (!autoOpen(S)) return false;
  S.auto.on = !!on;
  if (S.auto.on && S.draft) take(S, autoChoice(S), true);
  return true;
}
export const favPos = (S, id) => S.auto.fav.indexOf(id);    // место в любимых с нуля; −1 — не любимый
export function favToggle(S, id) {                          // добавить в конец списка любимых или убрать из него
  const i = S.auto.fav.indexOf(id), x = ITEMS.find((q) => q.id === id);
  if (i >= 0) { S.auto.fav.splice(i, 1); return false; }
  if (!x || (x.feat && !S.feat[x.feat])) return false;      // закрытый легендарный или тайный любимым не сделать
  S.auto.fav.push(id);
  return true;
}
export function favUp(S, id) {                              // поднять любимый предмет на одно место
  const i = S.auto.fav.indexOf(id);
  if (i <= 0) return false;
  S.auto.fav.splice(i - 1, 2, id, S.auto.fav[i - 1]);
  return true;
}

// ---------- возрождение ----------
// Пепел — целое число, пока оно умещается в обычную запись: и остаток, и цены реликвий, и награда за возрождение.
// Иначе на экране «1 пепел» и цена «1», а на деле 1,45 и 1,69 — и покупка не проходит.
function ashInt(x) {
  if (x === NEG || x >= 15) return x;
  const v = Math.floor(Math.pow(10, x) + 1e-6);
  return v <= 0 ? NEG : L10(v);
}
// Пепел дают за волны, пройденные в этом забеге. Волну старта (S.runZ: реликвия «Старт», покровитель «Наследие») игрок
// не проходил, поэтому её доля вычитается — той же формулой и с той же «Мощью», что у рекорда забега. Забег с волны
// не дальше ashFrom получает ровно столько же, сколько раньше. Без вычета возрождение сразу после возрождения давало
// пепел за волну старта, не пройдя ни одной: со «Стартом» — сотни пепла, с «Наследием» при низкой «Мощи» — до ×66
// к честной игре, раз в четыре секунды (14.11.2026).
const ashWave = (z) => (z > CFG.ashFrom ? Math.pow((z - CFG.ashFrom) / CFG.ashDiv, CFG.ashPow) : 0);
export function ashGain(S) {                                // lg пепла, который даст возрождение сейчас
  const z = S.zrec, might = L10(1 + 0.15 * (S.pat.might || 0)) / 100;   // «Мощь»: пепел растёт с волной
  let base = ashWave(z) - ashWave(S.runZ) * Math.pow(10, (S.runZ - z) * might);
  base += S.lvRun / CFG.ashLv;
  return base < 1 ? NEG : ashInt(L10(Math.floor(base)) + S.rel.ashplus * L10(1.05) + z * might);
}
export function rebirth(S) {
  const g = ashGain(S);
  if (g === NEG || !S.un.rebirth) return false;
  S.ash = ashInt(lsum(S.ash, g)); S.ashAll = ashInt(lsum(S.ashAll, g)); S.ashLife = lsum(S.ashLife, g); S.rb += 1; S.cycRb += 1;
  const st = S.stats;
  st.ashOnce = Math.max(st.ashOnce || 0, g);
  if (st.rbAt !== undefined && st.played - st.rbAt <= 180) achMark(S, "speedrun");
  st.rbAt = st.played;
  newRun(S);
  ev(S, { t: "rebirth", ash: g, n: S.rb });
  ev(S, { t: "wave", z: S.z });
  checkUnlocks(S);
  return true;
}
function newRun(S) {                                         // забег с начала: общее у возрождения и Затмения
  S.lv.fill(0); S.lvRun = 0; S.souls = NEG; S.run = NEG;
  // старт: реликвия «Старт» (по 10 волн) или «Наследие» (доля лучшей волны цикла) — что дальше
  S.z = Math.max(1 + 10 * S.rel.start, Math.floor(Math.min(0.9, 0.15 * (S.pat.legacy || 0)) * S.cycBest));
  if (isBoss(S.z)) S.z += 1;
  S.zrec = S.z; S.kills = 0; S.hp = 1; S.mode = "push"; S.wall = false;
  S.runZ = S.z; S.pw0 = { t: S.stats.pushT || 0, n: S.stats.pushN || 0 }; S.waveLog = [S.stats.played];   // датчик темпа меряет забег с начала
  S.rr.z = S.cycBest > S.z ? S.cycBest : 0; S.rr.hit = 0;   // цель забега — рекорд цикла; после Затмения цикл новый, цели нет
  S.combo = 0; S.tier = -1; S.buff = {};
  S.items = {}; S.draft = null; S.drafts = 0; S.forgiven = 0;
  S.statues = { dmg: 0, souls: 0, crit: 0, timer: 0 }; S.altar = 0; S.urnOn = 0; S.statueOn = 0;
  if (S.act.siege > 0) siegeEnd(S);                         // натиск оборвался: что успели снять — снято
  for (const s of SKILLS) S.act[s.id] = 0;
  derive(S);
}

// ---------- датчик темпа: за сколько проходится волна и не пора ли возрождаться ----------
// now — сколько сейчас уходит на волну: среднее по последним пройденным (до восьми), а если текущая тянется дольше — она сама.
// mine — среднее за забег: секунды движения вперёд на одну пройденную волну. То же самое сервер усредняет по всем игрокам.
// limit — предел: время волны, с которого следующего босса уже не взять. У босса здоровья как у целой волны, а времени
// на него — таймер босса (с поправкой на урон по боссам). Значит, пока наёмники проходят волну быстрее этого времени,
// босс им по силам; волна дольше — упёрлись. Первая версия считала порог по скорости набора пепла — она звала возрождаться
// через 17 секунд после открытия возрождения, поэтому порог привязан к правилу самой игры, а не к выгоде.
// state: fly — быстрее половины предела; slow — от половины предела до предела; stuck — дольше предела или босс не по зубам;
// farm — игрок сам стоит в «Фарме»; none — мерить пока нечего. canRb — возрождение уже что-то даст.
export function pace(S) {
  const log = S.waveLog, t = S.stats.played, n = log.length;
  let now = null;
  if (n >= 2) { const k = Math.min(8, n - 1); now = (log[n - 1] - log[n - 1 - k]) / k; }
  const cur = n ? Math.max(0, t - log[n - 1]) : 0;           // столько уже идёт текущая волна
  if (n && (now === null || cur > now)) now = cur;
  const dn = (S.stats.pushN || 0) - S.pw0.n, dt = (S.stats.pushT || 0) - S.pw0.t;
  const mine = dn >= 1 && dt > 0 ? dt / dn : null;
  const limit = S.d.bossTime * Math.pow(10, Math.min(6, S.d.bossMul));
  const canRb = !!S.un.rebirth && ashGain(S) !== NEG;
  let state = "none";
  if (S.wall && !canBeatBoss(S)) state = "stuck";
  else if (S.mode === "farm" && !S.wall) state = "farm";
  else if (now !== null) state = now >= limit ? "stuck" : now >= limit / 2 ? "slow" : "fly";
  // Путь до рекорда: после возрождения всё начинается заново, поэтому честнее всего мерить, за сколько забег возвращается
  // к рекорду, с которым начался. since — секунд игры с возрождения (null, пока возрождений не было); target — тот рекорд
  // (0 — цели нет: первый забег или новый цикл); reach — за сколько до него дошли (null — ещё в пути);
  // usual — среднее по прошлым забегам (до пяти последних, этот не в счёт).
  const rr = S.rr, prev = rr.hit ? rr.log.slice(0, -1) : rr.log, last = prev.slice(-5);
  const usual = last.length ? last.reduce((a, b) => a + b, 0) / last.length : null;
  const since = S.rb > 0 || S.ecl > 0 ? Math.max(0, t - (S.stats.rbAt || 0)) : null;
  return { now, mine, limit, state, canRb, since, target: rr.z, reach: rr.hit || null, usual };
}

// ---------- Страж Затмения: цель между Затмениями ----------
// Открывается вместе с Затмением. Умение «Натиск» на полминуты включает счёт: весь урон, который игрок и наёмники наносят
// на линии, идёт ещё и в Стража (линия при этом живёт как обычно). Здоровье стража — одно на много натисков и не
// восстанавливается. Победа — осколки сразу (их можно тут же потратить на покровителей), дальше выходит страж толще.
// Затмение начинает счёт стражей цикла заново.
//
// Здоровье меряется не числом, а долей: натиск снимает урон / (здоровье трупера РЕКОРДНОЙ волны × 10^(grdBase + grdStep·№)).
// Так страж не становится пустяком, когда игрок растёт: у стены урон за полминуты — около десяти таких труперов, то есть
// без бафов первый страж теряет несколько процентов за натиск, а под «Яростью», «Жатвой», «Подмогой» или «Бурей» — в разы
// и десятки раз больше. Первая версия держала здоровье числом от рекорда на момент выхода стража: осколки за победу
// давали сотни волн, следующий страж падал с одного натиска, и бот за 21 час ушёл на 16 000-ю волну вместо 2 400-й.
// Поэтому же в делителе рекорд за всё время, а не волна забега: в начале забега, пока волны «пролетают», урон на порядки
// больше здоровья тех труперов, и натиск там не должен давать ничего особенного.
export const grdOpen = (S) => eclOpen(S);
export const grdShards = (S) => CFG.grdShards + Math.floor(S.grd.lv / 2);   // сколько осколков дадут за нынешнего стража: 2, 2, 3, 3, 4…
const grdNeed = (S) => hpLg(Math.max(CFG.eclWave, S.best)) + CFG.grdBase + CFG.grdStep * S.grd.lv;   // lg урона, равного всему здоровью стража сейчас
export const grdLeft = (S) => S.grd.left;                    // какая доля здоровья осталась, 0…1
export function grdNow(S) {                                   // доля здоровья, которую уже снял идущий натиск
  const g = S.grd;
  return g.dealt === NEG ? 0 : Math.min(g.left, Math.pow(10, Math.min(0, g.dealt - grdNeed(S))));
}
function siegeEnd(S) {                                        // натиск кончился: его урон снимается со стража
  const g = S.grd, took = grdNow(S);
  g.dealt = NEG; g.last = took;
  S.stats.sieges = (S.stats.sieges || 0) + 1;
  g.left -= took;
  if (g.left <= 1e-6) {                                       // повержен
    const n = grdShards(S);
    S.shards += n; g.lv += 1; g.left = 1; g.last = 0; S.stats.guards = (S.stats.guards || 0) + 1;
    ev(S, { t: "guard_kill", shards: n, n: g.lv });
    return;
  }
  ev(S, { t: "siege_end", took, left: g.left });
}

// ---------- второй слой: Затмение, осколки, покровители ----------
// Затмение открывается после победы над боссом 1000-й волны. Оно сжигает первый слой целиком — пепел и реликвии — и даёт
// осколки: ⌊4 · lg(пепел этого цикла)⌋, считая и тот пепел, что дало бы возрождение прямо сейчас. Осколки, покровители,
// ачивки, коллекция предметов, рекорды и открытое остаются. Покровитель «Мощь» — мотор слоя: пепел начинает расти
// с волной, и каждое возрождение уходит глубже прошлого.
export const eclOpen = (S) => S.best > CFG.eclWave;
// Затмение приходит раз в сутки: сколько секунд ждать следующего. Часы перевели назад — ждать от нового времени.
export function eclWait(S, now) {
  if (!S.eclAt) return 0;
  const t = now === undefined ? Date.now() : now;
  if (t < S.eclAt) S.eclAt = t;
  return Math.max(0, CFG.eclCool - (t - S.eclAt) / 1000);
}
export function shardsGain(S) {                              // сколько осколков даст Затмение сейчас
  const a = lsum(S.ashAll, ashGain(S));
  return a > 0 ? Math.floor(CFG.shardK * a + 1e-9) : 0;
}
export function shardsFree(S) {                              // осколки, которые ещё не потрачены
  let spent = 0;
  for (const p of PATRONS) { const L = S.pat[p.id] || 0; spent += p.cost === "pow" ? Math.pow(2, L) - 1 : L * (L + 1) / 2; }
  return S.shards - spent - auHeld(S);
}

// ---------- Автозапуск умений: час за осколки, и осколки возвращаются с прибавкой ----------
// Открывается вместе с Затмением (раньше осколков нет). Игрок платит осколки — и час игры все открытые умения включаются
// сами, как только готовы, «Натиск» тоже. Заплаченное не пропадает: за этот час осколки возвращаются по одному, все до
// единого, и сверх того — прибавка. Цена и прибавка считаются от волны, до которой дошёл забег в момент покупки (S.zrec):
// чем выше стоишь, когда включаешь, тем дороже час и тем больше плюс. Час идёт, только пока игра на экране: без игрока
// (вкладка скрыта, игра закрыта) он стоит на месте и ничего не теряется.
// В счёте осколков это выглядит так: S.shards (получено за всё время) цена не трогает — заплаченное просто «занято»
// (auHeld) и освобождается по мере возврата; в S.shards попадает только прибавка.
export const auOpen = (S) => eclOpen(S);
export const auWave = (S) => Math.max(1, S.zrec);            // «волна фарма»: до какой волны дошёл этот забег
export const auBonus = (S, w) => Math.max(1, Math.floor((w === undefined ? auWave(S) : w) / CFG.auStep));   // сколько осколков час принесёт сверх цены
export const auPrice = (S, w) => CFG.auCost * auBonus(S, w);
export const auOn = (S) => S.au.left > 0;
export const auHeld = (S) => Math.max(0, S.au.pay - S.au.back);   // заплачено и ещё не вернулось
export function auBuy(S) {
  if (!auOpen(S) || auOn(S)) return false;
  const w = auWave(S), p = auPrice(S, w);
  if (p > shardsFree(S)) return false;
  S.au.left = CFG.auHour; S.au.pay = p; S.au.total = p + auBonus(S, w); S.au.back = 0; S.au.w = w;
  S.stats.auHours = (S.stats.auHours || 0) + 1;
  ev(S, { t: "au_on", pay: p, gain: S.au.total - p, w });
  return true;
}
export function setAuRenew(S, on) { S.au.renew = !!on; if (S.au.renew && !auOn(S)) auBuy(S); }
function auStep(S, dt) {                                     // зовётся из tick, только когда игрок в игре
  const a = S.au;
  if (a.left <= 0) return;
  for (const s of SKILLS) if (S.cd[s.id] <= 0 && skillOpen(S, s)) useSkill(S, s.id);
  a.left = Math.max(0, a.left - dt);
  const due = a.left <= 0 ? a.total : Math.floor(a.total * (1 - a.left / CFG.auHour) + 1e-9);
  while (a.back < due) {
    a.back += 1;
    if (a.back > a.pay) { S.shards += 1; S.stats.auGain = (S.stats.auGain || 0) + 1; ev(S, { t: "au_gain" }); }
  }
  if (a.left <= 0) {
    ev(S, { t: "au_end", pay: a.pay, gain: a.total - a.pay });
    a.pay = 0; a.total = 0; a.back = 0; a.w = 0;
    if (a.renew) auBuy(S);                                    // продление: по цене волны, на которой забег сейчас
  }
}
export const patronCost = (S, p) => (p.cost === "pow" ? Math.pow(2, S.pat[p.id] || 0) : (S.pat[p.id] || 0) + 1);
export function buyPatron(S, id) {
  const p = PATRONS.find((x) => x.id === id);
  if (!p || (p.cap && S.pat[id] >= p.cap) || patronCost(S, p) > shardsFree(S)) return false;
  S.pat[id] += 1;
  derive(S);
  ev(S, { t: "patron", id, name: p.name, lv: S.pat[id] });
  return true;
}
export function eclipse(S, now) {
  const n = shardsGain(S);
  if (!eclOpen(S) || n < 1 || eclWait(S, now) > 0) return false;
  S.eclAt = now === undefined ? Date.now() : now;
  const g = ashGain(S);
  if (g !== NEG) S.ashLife = lsum(S.ashLife, g);
  S.shards += n; S.ecl += 1;
  S.stats.shardsOnce = Math.max(S.stats.shardsOnce || 0, n);
  S.ash = NEG; S.ashAll = NEG;
  for (const r of RELICS) S.rel[r.id] = 0;
  S.cycBest = 1; S.cycRb = 0;
  if (S.act.siege > 0) siegeEnd(S);
  S.grd.lv = 0; S.grd.left = 1; S.grd.last = 0;             // новый цикл — стражи с первого
  S.stats.rbAt = S.stats.played;
  const step = chaosOpen(S) && S.chaos < CFG.chaosMax;       // третий слой: шаг «Скупщика теней» за это Затмение
  if (step) S.chaos += 1;
  newRun(S);
  ev(S, { t: "eclipse", shards: n, n: S.ecl, chaos: step ? S.chaos : 0 });
  ev(S, { t: "wave", z: S.z });
  checkUnlocks(S);
  return true;
}
export const relicCost = (S, r) => ashInt((r.base ? L10(r.base) : 0) + S.rel[r.id] * L10(r.grow));   // цена уровня — целая, вниз
export function buyRelic(S, id) {
  const r = RELICS.find((x) => x.id === id);
  if (!r || (r.cap && S.rel[id] >= r.cap)) return false;
  const c = relicCost(S, r);
  if (S.ash === NEG || c > S.ash + 1e-9) return false;
  S.ash = ashInt(lsub(S.ash, c));
  S.rel[id] += 1;
  derive(S);
  ev(S, { t: "relic", id });
  return true;
}

// ---------- удержание: сундуки, задания дня, скины ----------
// Всё это не сбрасывается ни возрождением, ни Затмением. Числа — KEEP в data.js.
export function setWatch(S, v) { S.watch = !!v; }           // стрим aliveenjoyer идёт и включён фоном в игре (js/stream.js)
export const dayNo = (now) => {                              // номер дня по часам игрока
  const d = now === undefined ? new Date() : new Date(now);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
};
export function taskValue(S, src) {                         // счётчики заданий: растут всю игру, возрождение их не трогает
  const st = S.stats;
  switch (src) {
    case "crates": case "altars": return S.album[src] || 0;
    case "wisps": return S.wisps || 0;
    case "rb": return S.rb || 0;
    case "items": { let n = 0; for (const k in S.col) n += S.col[k] || 0; return n; }
    default: return st[src] || 0;
  }
}
export const taskText = (t) => t.text.replace("#", group(t.min ? Math.round(t.need / 60) : t.need));
export function taskNow(S, i) {                             // сколько сделано по заданию i сегодня, не больше нужного
  const q = S.tsk.list[i], t = q && TASKS.find((x) => x.id === q.id);
  if (!t) return 0;
  return S.tsk.done[i] ? t.need : Math.max(0, Math.min(t.need, taskValue(S, t.src) - q.base));
}
function rollTasks(S, d) {                                   // три задания дня: порядок общий для всех (по номеру дня), берём первые открытые
  let seed = (d * 2654435761) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pool = TASKS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = pool[i]; pool[i] = pool[j]; pool[j] = x; }
  return pool.filter((t) => !t.un || S.un[t.un]).slice(0, 3).map((t) => ({ id: t.id, base: taskValue(S, t.src) }));
}
export function dayRoll(S, now) {                           // новый день — новые задания; пропущенный день режет серию вдвое
  const d = dayNo(now), T = S.tsk;
  if (T.day === d && T.list.length) return false;
  if (T.day > d) return false;                              // часы перевели назад: задания остаются прежними
  if (T.day && T.streak > 0 && T.full < d - 1) T.streak = Math.floor(T.streak / 2);
  T.day = d; T.list = rollTasks(S, d); T.done = T.list.map(() => false); T.all = false;
  derive(S);
  return true;
}
const income = (S, sec) => {                                 // души за sec секунд дохода, но не меньше душ с полусотни труперов
  const r = rateLg(S), min = lootBase(S.z) + soulsLg(S) + L10(50);
  return r === NEG ? min : Math.max(min, r + L10(sec));
};
export function stepKeep(S, now) {                          // зовётся несколько раз в секунду и при загрузке
  dayRoll(S, now);
  const T = S.tsk;
  for (let i = 0; i < T.list.length; i++) {
    if (T.done[i]) continue;
    const t = TASKS.find((x) => x.id === T.list[i].id);
    if (!t || taskValue(S, t.src) - T.list[i].base < t.need) continue;
    T.done[i] = true;
    const l = income(S, KEEP.taskIncome);
    gain(S, l); S.stats.tasks = (S.stats.tasks || 0) + 1;
    ev(S, { t: "task", i, text: taskText(t), loot: l });
  }
  if (!T.all && T.list.length && T.done.every(Boolean)) {
    T.all = true; T.full = T.day; T.streak += 1;
    S.stats.streakMax = Math.max(S.stats.streakMax || 0, T.streak);
    S.chest.day += 1;
    derive(S);
    ev(S, { t: "chest_in", kind: "day", streak: T.streak });
  }
}
export const chestsWaiting = (S) => (S.chest.air || 0) + (S.chest.day || 0);
export const tskinCount = (S) => { let n = 0; for (const x of TSKINS) if (S.skins.own[x.id] > 0) n += 1; return n; };
function rollSkin(pool) {                                    // редкость по весам среди тех, что есть в pool, внутри редкости — поровну
  let sum = 0; const rars = [];
  for (const k in TSKIN_RAR) if (pool.some((x) => x.rar === k)) { rars.push(k); sum += TSKIN_RAR[k].w; }
  let r = Math.random() * sum, k = rars[rars.length - 1];
  for (const q of rars) { if (r < TSKIN_RAR[q].w) { k = q; break; } r -= TSKIN_RAR[q].w; }
  const same = pool.filter((x) => x.rar === k);
  return same[Math.floor(Math.random() * same.length)];
}
export function openChest(S, kind) {                        // kind: air | day → { kind, loot, skin, dupe, name, rar } или null
  const c = S.chest;
  if (kind !== "air" && kind !== "day") return null;
  if (!(c[kind] > 0)) return null;
  c[kind] -= 1; S.stats.chests = (S.stats.chests || 0) + 1;
  let loot = income(S, kind === "air" ? KEEP.airIncome : KEEP.dayIncome);
  const left = TSKINS.filter((x) => !(S.skins.own[x.id] > 0));
  const forced = left.length > 0 && c.dry >= KEEP.pity;
  let pick = null, dupe = false;
  if (forced || Math.random() < (kind === "air" ? KEEP.airSkin : KEEP.daySkin)) {
    pick = rollSkin(forced ? left : TSKINS);
    dupe = S.skins.own[pick.id] > 0;
    S.skins.own[pick.id] = (S.skins.own[pick.id] || 0) + 1;
    if (dupe) loot += L10(KEEP.dupe); else S.skins.on[pick.id] = true;
  }
  c.dry = pick && !dupe ? 0 : c.dry + 1;
  gain(S, loot);
  if (kind === "air") S.buff.harvest = Math.max(S.buff.harvest || 0, 60 * S.d.durMul);   // сундук эфира ещё и даёт «Жатву» на минуту
  const out = { t: "chest", kind, loot, skin: pick ? pick.id : null, dupe, name: pick ? pick.name : "", rar: pick ? pick.rar : "" };
  ev(S, out);
  return out;
}
export function wearSkin(S, id, on) {                       // поставить скин трупера в строй или убрать; "std" — обычный трупер
  if (id !== "std" && !(S.skins.own[id] > 0)) return false;
  S.skins.on[id] = !!on;
  if (!lineSkins(S).length) S.skins.on.std = true;           // совсем без труперов нельзя
  return true;
}
export const lineSkins = (S) => ["std"].concat(TSKINS.map((x) => x.id)).filter((id) => S.skins.on[id] && (id === "std" || S.skins.own[id] > 0));
export function pickSkin(S) { const l = lineSkins(S); return l.length ? l[Math.floor(Math.random() * l.length)] : "std"; }
// Скины героев из RPG: список приходит с сервера для вошедшего через Twitch. Возвращает, сколько новых.
export function setRpgSkins(S, list) {
  const next = [];
  for (const id of Array.isArray(list) ? list : []) if (RPG_SKINS[id] && next.indexOf(id) < 0) next.push(id);
  next.sort();
  const had = S.rpg.skins;
  const added = next.filter((id) => had.indexOf(id) < 0);
  if (added.length === 0 && next.length === had.length) return 0;
  S.rpg.skins = next;
  derive(S);
  if (added.length) ev(S, { t: "rpgskins", added, n: next.length });
  return added.length;
}
export const rpgSkinMul = (id) => (RPG_SKINS[id] ? KEEP.rpgMul[RPG_SKINS[id][1]] : 1);
export const hasRpgSkin = (S, id) => S.rpg.skins.indexOf(id) >= 0;

// Что делать дальше: одна строка под линией. Порядок — как в PLAN.md § 17.1.
export function nextUp(S) {
  if (S.altar > 0) return { k: "altar", text: "Жертвенник: бей быстрее — каждый удар даёт души" };
  if (S.statueOn > 0) return { k: "statue", text: "Золотая статуя на линии — разбей, пока не исчезла" };
  if (S.urnOn > 0) return { k: "urn", text: "Летит урна — бей по ней, награда растёт с каждым ударом" };
  if (chestsWaiting(S) > 0) return { k: "chest", text: (S.chest.air > 0 ? "Сундук эфира" : "Сундук дня") + " ждёт — открой его во вкладке «Скины»" };
  for (const s of SKILLS) if (skillOpen(S, s) && S.cd[s.id] <= 0 && S.act[s.id] <= 0) return { k: "skill", text: "Готово умение «" + s.name + "»" };
  if (S.wall && canBeatBoss(S)) return { k: "boss", text: "Наёмники справятся с боссом — жми «На босса»" };
  if (S.wall && eclOpen(S) && eclWait(S) <= 0 && S.cycRb >= 3 && shardsGain(S) >= Math.max(15, 0.5 * S.shards)) return { k: "eclipse", text: "Пора в Затмение: осколков выйдет " + shardsGain(S) + ". Кнопка — во вкладке «Реликвии»" };
  if (S.un.rebirth && ashGain(S) !== NEG && (S.ashAll === NEG || ashGain(S) >= S.ashAll) && S.wall) return { k: "rebirth", text: "Пора возрождаться: пепла выйдет не меньше, чем у тебя было" };
  let best = null;
  for (let i = 0; i <= Math.min(N, heroesShown(S)); i++) {
    const b = buyInfo(S, i, "ms");
    if (b.can && S.lv[i] > 0) { best = { k: "ms", i, text: "Хватает на веху: " + (i ? HEROES[i - 1].name : "Хлыст") + " ×" + msGain(S.lv[i]) }; break; }
  }
  if (best) return best;
  if (S.crate) return { k: "crate", text: "На линии ящик — разбей его, внутри души" };
  if (S.wall) return { k: "wall", text: "Босс пока не по зубам: качай отряд или возрождайся" };
  return null;
}

// ---------- ачивки ----------
// S.ach — полученные: ключ «лестница:номер порога» или id одиночной. Определения — data.js (ACH_LADDERS, ACH_SINGLE).
// Каждая навсегда даёт +1 % урона (derive). Проверка идёт четыре раза в секунду игрового времени (tick) и при загрузке.
export const achCount = (S) => (S.ach ? Object.keys(S.ach).length : 0);
export const ACH_TOTAL = ACH_LADDERS.reduce((n, l) => n + l.at.length, 0) + ACH_SINGLE.length;
export function achValue(S, id) {                            // то, по чему считается лестница id
  const st = S.stats;
  switch (id) {
    case "best": return S.best;
    case "life": return S.life === NEG ? -1 : S.life;         // lg
    case "ashAll": return S.ashLife === NEG ? -1 : S.ashLife;   // lg; за всё время, Затмение его не обнуляет
    case "ecl": return S.ecl || 0;
    case "shards": return S.shards || 0;
    case "patrons": { let n = 0; for (const k in S.pat) n += S.pat[k] || 0; return n; }
    case "chaos": return chaosStep(S);
    case "streak": return st.streakMax || 0;
    case "tskins": return tskinCount(S);
    case "rpgskins": return S.rpg.skins.length;
    case "rb": return S.rb;
    case "elites": case "crates": case "altars": case "statues": case "urns": return S.album[id] || 0;
    case "wisps": return S.wisps || 0;
    case "relics": { let n = 0; for (const k in S.rel) n += S.rel[k] || 0; return n; }
    case "coll": { let n = 0; for (const k in S.col) if (S.col[k] > 0) n += 1; return n; }
    case "itemsGot": { let n = 0; for (const k in S.col) n += S.col[k] || 0; return n; }
    case "stars": { let n = 0; for (const x of ITEMS) n += starsOf(S, x.id); return n; }
    default: return st[id] || 0;                              // счётчики и «лучшее за всё время» из S.stats
  }
}
const achNum = (l, v) => (l.fmt === "lg" ? (v > 0 ? txt(v) : "0") : l.fmt === "t" ? (v < 3600 ? Math.floor(v / 60) + " мин" : Math.floor(v / 3600) + " ч")
  : v >= 100000 ? txt(L10(v)) : group(v));
export const achGoal = (l, i) => l.how.replace("#", achNum(l, l.at[i]));        // «Дойти до волны 100»
export const achNow = (l, v) => achNum(l, l.fmt === "lg" || l.fmt === "t" ? v : Math.floor(v));   // текущее значение тем же видом
function achGive(S, key, name, text, quiet) {
  if (S.ach[key]) return 0;
  S.ach[key] = 1;
  if (!quiet) ev(S, { t: "ach", key, name, text });
  return 1;
}
export function achMark(S, id, quiet) {                      // одиночная ачивка по событию: из ядра или из интерфейса (вход, место в таблице…)
  const a = ACH_SINGLE.find((x) => x.id === id);
  if (!a || !S.ach || S.ach[id]) return false;
  achGive(S, id, a.name, a.text, quiet);
  derive(S);
  return true;
}
export function achNote(S, key, n) { S.stats[key] = (S.stats[key] || 0) + n; }   // счётчик, который знает только интерфейс: время со стримом на фоне
export function checkAch(S, quiet) {                         // выдать всё, что заработано; возвращает, сколько выдано
  const st = S.stats;
  // лучшее за всё время: считается из того, что есть сейчас
  st.comboMax = Math.max(st.comboMax || 0, Math.floor(S.combo));
  let hired = 0, lvMax = 0;
  for (let i = 1; i <= N; i++) if (S.lv[i] > 0) { hired += 1; if (S.lv[i] > lvMax) lvMax = S.lv[i]; }
  st.hired = Math.max(st.hired || 0, hired); st.lvMax = Math.max(st.lvMax || 0, lvMax); st.whipMax = Math.max(st.whipMax || 0, S.lv[0]);
  st.hitMax = Math.max(st.hitMax || 0, clickLg(S));
  if (S.d.dps !== NEG) st.dpsMax = Math.max(st.dpsMax || 0, dpsLg(S));
  if (S.souls !== NEG) st.bankMax = Math.max(st.bankMax || 0, S.souls);
  const now = new Date(), day = now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
  if (st.day !== day) { st.day = day; st.days = (st.days || 0) + 1; }

  let got = 0;
  for (const l of ACH_LADDERS) {
    const v = achValue(S, l.id);
    for (let i = 0; i < l.at.length && v >= l.at[i]; i++) if (!S.ach[l.id + ":" + i]) got += achGive(S, l.id + ":" + i, l.name, achGoal(l, i), quiet);
  }
  const one = (id, ok) => { if (ok && !S.ach[id]) { const a = ACH_SINGLE.find((x) => x.id === id); if (a) got += achGive(S, id, a.name, a.text, quiet); } };
  let on = 0, items = 0, top = 0, leg = 0, sec = 0;
  for (const s of SKILLS) if (S.act[s.id] > 0) on += 1;
  for (const k in S.items) if (S.items[k] > 0) { items += 1; if (S.items[k] > top) top = S.items[k]; }
  for (const x of ITEMS) if (x.feat && S.feat[x.feat]) { if (x.rar === "l") leg += 1; else if (x.rar === "x") sec += 1; }
  one("allskills", on >= 5);
  one("fullslots", items > 0 && items >= S.d.slots);
  one("rank4", top >= ITEM_MAX);
  one("legend1", leg >= 1); one("legend3", leg >= 3); one("secret1", sec >= 1); one("secret3", sec >= 3);
  one("x2", (st.live || 0) >= 1);
  one("night", (now.getHours() === 3 || now.getHours() === 4) && S.idleT < 60 && st.clicks > 0);
  one("marathon", S.sess >= 7200);
  if (got) derive(S);
  return got;
}
