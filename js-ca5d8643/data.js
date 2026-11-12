// Баланс и содержимое. Числа — те же, что в tools/sim.py (CFG) и в PLAN.md § 18. Менять здесь, а не в коде.
import { L10 } from "./num.js";

export const CFG = {
  // волны
  hp0: 5, hp1: 1.30, knee: 140, hp2: 1.15, lateStep: 0.01, lateEvery: 500,
  lootDiv: 10, mobs: 10, bossEvery: 10, bossHp: 10, bossLoot: 10, bossTime: 30,
  rush: 2,                       // «прорыв»: волн в секунду, когда труперы умирают с одного удара с запасом
  rushOver: 10,                  // запас урона, с которого начинается прорыв
  // наёмники: lg цены и урона первого уровня ступени k = a + b(k−1) + c(k−1)²
  costA: 1.0, costB: 0.80, costC: 0.030, dpsA: 0.0, dpsB: 0.62, dpsC: 0.0285,
  costG: 1.07, whipCost: 5,
  // удар
  clickOfDps: 0.02, critChance: 0.05, critMult: 3, holdRate: 4, clickCap: 15,
  // комбо: порог → множитель удара
  combo: [[10, 1.2, "Разогрев"], [25, 1.5, "Раж"], [50, 2, "Ярость"], [100, 3, "Буйство"], [250, 4, "Легенда"]],
  comboHold: 2.0, comboDrain: 10, groundStrike: 5,
  // сферы душ
  orbBonus: 0.5, orbLife: 1.5, orbWave: 35,
  // офлайн
  offEff: 0.25, offCap: 12 * 3600,
  // пепел
  ashFrom: 50, ashDiv: 6, ashPow: 1.6, ashLv: 500, ashDmg: 0.02, rebirthHold: 1.2,
  // огонёк
  wispMin: 300, wispMax: 900, wispLife: 13, wispFirstWave: 30,
  // обменник: lg цены n-й души RPG за день = swapBase + (n / swapK)^(1 / swapP). Первая стоит тысячу, сотая — 12 триллионов,
  // трёхсотая — число из 66 цифр. Те же три числа стоят на сервере (SWAP_* в /opt/wlapp/app.py)
  swapBase: 3, swapK: 25, swapP: 0.6,
};

export const MILESTONES = [10, 25, 50, 75, 100, 125, 150];

// Наёмники по ступеням. Портрет — art/heroes/hero-<id>.webp. Лэша здесь нет: Лэш — это игрок.
// Роль: w — стрелок (Оружие), s — заклинатель (Дух), v — громила (Живучесть).
export const HEROES = [
  ["abrams", "Абрамс", "v"], ["heyz", "Хейз", "w"], ["infernus", "Инфернус", "s"], ["makginnis", "МакГиннис", "w"],
  ["bibop", "Бибоп", "s"], ["vindikta", "Виндикта", "w"], ["kelvin", "Кельвин", "v"], ["seven", "Севен", "s"],
  ["shiv", "Шив", "w"], ["dinamo", "Динамо", "v"], ["ledi-gayst", "Леди Гайст", "s"], ["mo-i-krill", "Мо и Крилл", "v"],
  ["paradoks", "Парадокс", "s"], ["poket", "Покет", "s"], ["varden", "Варден", "w"], ["reyt", "Рейт", "w"],
  ["ayvi", "Айви", "v"], ["yamato", "Ямато", "s"], ["viskus", "Вискус", "v"], ["grey-telon", "Грей Тэлон", "w"],
  ["mirazh", "Мираж", "s"], ["hollidey", "Холлидей", "w"], ["kaliko", "Калико", "w"], ["vayper", "Вайпер", "w"],
  ["sinkler", "Синклер", "s"], ["billi", "Билли", "v"], ["greyvs", "Грейвс", "s"], ["drifter", "Дрифтер", "w"],
  ["viktor", "Виктор", "v"], ["peydzh", "Пейдж", "s"], ["mina", "Мина", "s"], ["dorman", "Дорман", "v"],
  ["rem", "Рем", "s"], ["silver", "Сильвер", "w"], ["apollon", "Аполлон", "w"], ["selesta", "Селеста", "s"],
  ["venator", "Венатор", "w"], ["solomon", "Соломон", "s"], ["violetta", "Виолетта", "s"], ["ret-king", "Рэт Кинг", "v"],
  ["sestra-herrou", "Сестра Хэрроу", "s"], ["busya", "Буся", "v"], ["dohlyy-denni", "Дохлый Денни", "w"],
].map(([id, name, role], i) => ({ id, name, role, k: i + 1 }));

export const heroCost0 = (k) => CFG.costA + CFG.costB * (k - 1) + CFG.costC * (k - 1) * (k - 1);
export const heroDps0 = (k) => CFG.dpsA + CFG.dpsB * (k - 1) + CFG.dpsC * (k - 1) * (k - 1);
export const WHIP_COST0 = L10(CFG.whipCost);

// Умения Лэша. wave — с какой волны открывается (0 — по отдельному условию).
export const SKILLS = [
  { id: "flurry", name: "Шквал", wave: 15, dur: 30, cd: 600, text: "+10 ударов в секунду сами" },
  { id: "rage", name: "Ярость", wave: 30, dur: 30, cd: 600, text: "Урон ×2" },
  { id: "greed", name: "Жадность", wave: 60, dur: 30, cd: 900, text: "Души ×2" },
  { id: "mark", name: "Метка", wave: 100, dur: 30, cd: 900, text: "Половина ударов — крит ×5" },
  { id: "ult", name: "Ульта Лэша", wave: 120, dur: 15, cd: 1800, text: "Бьёт волну оземь: она и две следующие убиты, удары ×10" },
  { id: "rewind", name: "Перемотка", wave: 0, dur: 0, cd: 3600, text: "Сразу час дохода", need: "rb1" },
];

// Бафы: группа решает, как они складываются (внутри группы суммой, между группами произведением).
export const BUFFS = {
  flurry: { name: "Шквал", group: "hit" },
  rage: { name: "Ярость", group: "dmg", dmg: 2 },
  greed: { name: "Жадность", group: "souls", souls: 2 },
  mark: { name: "Метка", group: "luck" },
  ult: { name: "Ульта Лэша", group: "hit", click: 10 },
  harvest: { name: "Жатва", group: "dmg", dmg: 5 },
  storm: { name: "Буря", group: "hit", click: 500 },
};

// Огонёк: что приносит.
export const WISP = [
  { id: "harvest", p: 0.45, dur: 60, title: "Жатва", text: "Урон ×5 на минуту" },
  { id: "catch", p: 0.43, dur: 0, title: "Улов", text: "Души: 15 % банка, но не больше 20 минут дохода" },
  { id: "storm", p: 0.12, dur: 10, title: "Буря", text: "Удар ×500 на 10 секунд" },
];

// Реликвии за пепел: цена уровня L — grow^L, для «Ячейки» — своя.
export const RELICS = [
  { id: "blade", name: "Клинок", text: "Урон ×1,2", grow: 1.3, icon: "relic-blade" },
  { id: "greed", name: "Жадность", text: "Души ×1,15", grow: 1.25, icon: "relic-greed" },
  { id: "ashplus", name: "Пепел+", text: "Пепла за возрождение ×1,05", grow: 1.9, icon: "relic-ash" },
  { id: "urn", name: "Урна", text: "Офлайн: скорость +5 %, окно +1 ч", grow: 2, cap: 10, icon: "relic-urn" },
  { id: "clock", name: "Часовщик", text: "Таймер босса +2 с", grow: 1.8, cap: 15, icon: "relic-clock" },
  { id: "hand", name: "Рука", text: "Удар +1 % урона наёмников", grow: 1.7, cap: 8, icon: "relic-hand" },
  { id: "flurry", name: "Шквал+", text: "Шквал длится на 3 с дольше", grow: 1.5, cap: 20, icon: "relic-flurry" },
  { id: "colossus", name: "Колосс", text: "Урон по боссам ×1,25", grow: 1.35, icon: "relic-colossus" },
  { id: "start", name: "Старт", text: "Начинать забег на 10 волн дальше", grow: 3, cap: 20, icon: "relic-start" },
  { id: "slot", name: "Ячейка", text: "+1 ячейка предмета", grow: 10, base: 50, cap: 4, icon: "relic-slot" },
];

// Предметы забега: после каждого босса — один из трёх. Ранг до IV, сбрасываются возрождением. Картинка — по id.
// Ветка: w — Оружие, v — Живучесть, s — Дух. Названия английские, как в Deadlock. need — механика, без которой предмет не предлагают.
export const ITEMS = [
  { id: "item-w-monster", branch: "w", rar: "c", name: "Monster Rounds", text: "Урон +8 %" },
  { id: "item-w-lucky", branch: "w", rar: "c", name: "Lucky Shot", text: "Шанс крита +3 %" },
  { id: "item-w-tesla", branch: "w", rar: "r", name: "Tesla Bullets", text: "15 % ударов бьют дважды" },
  { id: "item-w-glass", branch: "w", rar: "r", name: "Glass Cannon", text: "Удар +20 %, но таймер босса −1 с" },
  { id: "item-w-fleet", branch: "w", rar: "c", name: "Fleetfoot", text: "Прорыв на 15 % быстрее" },
  { id: "item-v-colossus", branch: "v", rar: "c", name: "Colossus", text: "Урон по боссам +10 %" },
  { id: "item-v-barrier", branch: "v", rar: "r", name: "Divine Barrier", text: "Один провал босса не считается" },
  { id: "item-v-rite", branch: "v", rar: "c", name: "Healing Rite", text: "Фарм без тебя: +5 % скорости" },
  { id: "item-v-beam", branch: "v", rar: "c", name: "Rescue Beam", text: "Душка подбирает сферы на 5 % чаще", need: "pet" },
  { id: "item-v-unstoppable", branch: "v", rar: "c", name: "Unstoppable", text: "Таймер босса +2 с" },
  { id: "item-s-burst", branch: "s", rar: "r", name: "Mystic Burst", text: "Умения и огоньки на 10 % сильнее", need: "flurry" },
  { id: "item-s-cooldown", branch: "s", rar: "c", name: "Superior Cooldown", text: "Перезарядка умений −4 %", need: "flurry" },
  { id: "item-s-boundless", branch: "s", rar: "c", name: "Boundless Spirit", text: "Бафы длятся на 8 % дольше", need: "flurry" },
  { id: "item-s-charge", branch: "s", rar: "c", name: "Extra Charge", text: "Шквал: +2 удара в секунду", need: "flurry" },
  { id: "item-s-refresher", branch: "s", rar: "r", name: "Refresher", text: "Огоньки на 10 % чаще", need: "wisp" },
  // легендарные: условие видно сразу; после подвига предмет начинает выпадать
  { id: "item-l-frenzy", branch: "w", rar: "l", max: 2, name: "Frenzy", text: "Удар и урон наёмников +50 %", feat: "frenzy", how: "Доведи комбо до яруса «Легенда»: 250 ударов подряд" },
  { id: "item-l-cheat", branch: "v", rar: "l", max: 2, name: "Cheat Death", text: "Провал босса не считается, таймер босса +5 с", feat: "cheat", how: "Победи 25 боссов" },
  { id: "item-l-echo", branch: "s", rar: "l", max: 2, name: "Echo Shard", text: "Умения и бафы длятся в полтора раза дольше", feat: "echo", how: "Поймай 10 огоньков" },
  // тайные: условие не названо, только намёк
  { id: "item-x-curse", branch: "s", rar: "x", max: 2, name: "Curse", text: "Души +50 %", feat: "curse", how: "Говорят, проигрывать тоже надо уметь" },
  { id: "item-x-carpet", branch: "w", rar: "x", max: 2, name: "Magic Carpet", text: "Прорыв вдвое быстрее", feat: "carpet", how: "Кто-то пронёсся по линии быстрее ветра" },
  { id: "item-x-weave", branch: "v", rar: "x", max: 2, name: "Shadow Weave", text: "Фарм без тебя: +25 % скорости", feat: "weave", how: "Тени работают, пока хозяин отдыхает" },
];
export const ITEM_MAX = 4;
// Редкость: цвет рамки и вес в выборе после босса.
export const RARITY = {
  c: { name: "Обычный", color: "#8f94c9", w: 1 },
  r: { name: "Редкий", color: "#4da3ff", w: 0.45 },
  l: { name: "Легендарный", color: "#ffc53d", w: 0.16 },
  x: { name: "Тайный", color: "#ff7ad9", w: 0.16 },
};
// Звёзды предмета: сколько раз он взят за всё время. Не сбрасываются. Каждая звезда после первой — +10 % к его силе.
export const STARS = [1, 5, 15, 40, 100];
// Путь: что ещё впереди, кроме открытий из UNLOCKS.
export const ROAD_EXTRA = [
  { title: "Обменник", cond: "с первой волны", text: "Души кликера меняются на души RPG стрима — кнопка «Обмен» наверху. Первые души за день дешёвые, дальше цена уходит в огромные числа. Чем выше рекорд волны, тем больше дневная норма: до 300 душ. Нужен вход через Twitch." },
  { title: "Легендарные предметы", cond: "подвиги", text: "Три предмета с золотой рамкой. Условия — в коллекции." },
  { title: "Тайные предметы", cond: "???", text: "Три предмета, о которых никто не расскажет." },
  { title: "Затмение", cond: "волна 1 000", text: "Второй слой: осколки, покровители, Колесо судьбы. В разработке.", soon: true },
];
// Вклад в ветку: 3, 6 и 9 рангов дают бонус ветки.
export const BRANCH = {
  w: { name: "Оружие", icon: "branch-weapon", color: "#e0892e", steps: ["удар +25 %", "удар +75 %", "удар +200 %"], click: [1, 1.25, 1.75, 3] },
  v: { name: "Живучесть", icon: "branch-vitality", color: "#6aa84f", steps: ["таймер босса +3 с", "таймер босса +6 с", "таймер босса +10 с"], timer: [0, 3, 6, 10] },
  s: { name: "Дух", icon: "branch-spirit", color: "#a77bd9", steps: ["перезарядка −10 %", "перезарядка −20 %", "перезарядка −35 %"], cd: [1, 0.9, 0.8, 0.65] },
};
export const branchTier = (n) => (n >= 9 ? 3 : n >= 6 ? 2 : n >= 3 ? 1 : 0);

// События на линии. Время — секунды живой игры (вкладка открыта); every — от и до следующего появления.
export const LANE = {
  crate: { every: [75, 120], income: 20, min: 5 },          // ящик: 20 секунд дохода, не меньше душ пяти труперов
  altar: { every: [480, 720], time: 15, hit: 5, cap: 600, minHits: 40, away: 45, ult: 30 },   // жертвенник: удар — 5 с дохода, всего до 10 минут
  statue: { every: [1200, 2400], time: 10 },                // золотая статуя: маленький бонус до возрождения
  urn: { every: [1800, 3600], time: 20, income: 600, hits: 50, perHit: 0.02 },   // урна: 10 минут дохода, каждый удар +2 %
  elite: { eachWave: 3, at: 4, hp: 20, loot: 30 },          // элита: пятый трупер каждой третьей волны
  weak: { mult: 3 },                                        // слабое место босса: удар втрое сильнее
};

// Боссы: кто на какой волне.
export function bossOf(z) {
  if (z % 1000 === 0) return { id: "patron", name: "Покровитель" };
  if (z % 500 === 0) return { id: "midboss", name: "Мидбосс" };
  if (z % 50 === 0) return { id: "walker", name: "Ходок" };
  return { id: "guardian", name: "Хранитель" };
}

// Раскрытие игры: что и когда открывается и что говорит Душка. kind: wave | souls | rb (возрождений).
export const UNLOCKS = [
  { key: "squad", kind: "souls", at: 1, title: "Отряд", say: "Найми кого-нибудь. Он будет бить, даже когда ты уйдёшь." },
  { key: "bulk", kind: "wave", at: 5, title: "Покупка пачкой", say: "Теперь уровни можно брать по десять и сразу до вехи." },
  { key: "boss", kind: "wave", at: 10, title: "Босс", say: "Это Хранитель. У тебя полминуты. Не успеешь — подкачаемся и вернёмся." },
  { key: "items", kind: "wave", at: 11, title: "Предметы", say: "За босса — один предмет из трёх. Он с тобой до возрождения. Одинаковые растут в ранге." },
  { key: "flurry", kind: "wave", at: 15, title: "Шквал", say: "Жми «Шквал»: полминуты хлыст бьёт сам." },
  { key: "combo", kind: "wave", at: 20, title: "Комбо", say: "Бей без пауз: чем длиннее серия, тем больнее удар." },
  { key: "wisp", kind: "wave", at: 30, title: "Огоньки", say: "Видишь огонёк? Лови! Он недолго висит." },
  { key: "rage", kind: "wave", at: 30, title: "Ярость", say: "«Ярость» удваивает весь урон. Береги её на босса." },
  { key: "orbs", kind: "wave", at: 35, title: "Сферы душ", say: "Из труперов вылетают сферы. Проведи по ним — получишь в полтора раза больше душ." },
  { key: "rebirth", kind: "wave", at: 50, title: "Возрождение", say: "Упрёшься в стену — возрождайся. Всё начнётся заново, но ты станешь сильнее навсегда." },
  { key: "greed", kind: "wave", at: 60, title: "Жадность", say: "«Жадность» удваивает души. Включай её вместе с огоньком." },
  { key: "pet", kind: "wave", at: 100, title: "Душка-помощник", say: "Теперь я сам подбираю часть сфер. Остальные — твои!" },
  { key: "mark", kind: "wave", at: 100, title: "Метка", say: "«Метка» делает половину ударов критами." },
  { key: "ult", kind: "wave", at: 120, title: "Ульта Лэша", say: "Ульта поднимает всю волну и бьёт её оземь. Красиво же." },
  { key: "relics", kind: "rb", at: 1, title: "Реликвии", say: "За пепел покупают реликвии. Они остаются навсегда." },
  { key: "rewind", kind: "rb", at: 1, title: "Перемотка", say: "«Перемотка» сразу даёт час дохода. Раз в час." },
  { key: "crate", kind: "wave", at: 7, title: "Ящики", say: "Ящик! Разбей его — внутри души. Новый падает каждые пару минут." },
  { key: "altar", kind: "wave", at: 25, title: "Жертвенник грешника", say: "Пятнадцать секунд каждый удар по жертвеннику сыплет души. Наёмники в это время ждут." },
  { key: "statue", kind: "wave", at: 40, title: "Золотые статуи", say: "Золотая статуя стоит десять секунд. Разбей: её бонус с тобой до возрождения." },
  { key: "weak", kind: "wave", at: 70, title: "Слабые места", say: "У босса есть слабое место — мишень. Бей в неё: втрое больнее." },
  { key: "urn", kind: "wave", at: 80, title: "Урна душ", say: "Над линией плывёт урна. Бей её, пока летит: чем больше ударов, тем богаче награда." },
  { key: "elite", kind: "wave", at: 100, title: "Элитные труперы", say: "Элитный трупер крепче в двадцать раз, зато душ с него — в тридцать." },
];
