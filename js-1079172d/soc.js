// Кнопки канала в шапке: Telegram, донат, Twitch — те же три неоновые кнопки, что на aliveenjoyer.art (23.11, его слова
// главной сессии: «Можешь эти три кнопки так же раскатать на все остальные сайты»). Стили — общий файл всех сайтов
// https://aliveenjoyer.art/social.css (исходник Skyrim\Hub\social.css), разметка — в index.html, в шапке справа;
// здесь — только где кнопки стоят и какие у них подписи. Свои правила для шапки — блок «кнопки канала» в css/game.css.
//
// Шапка игры тесная: справа обменник, пепел, осколки, вход, звук и настройки; посередине — «Стрим идёт», сундук эфира
// и уровень глубины. Игровое в шапке важнее: кнопки канала берут только свободное место — длинные подписи, короткие,
// одни значки, а если и значкам места нет (или «Стрим идёт» начинает переноситься на вторую строку) — кнопок нет.
// Подбор — когда в шапке что-то поменялось (её ширина, что в ней показано, длина надписей), а не каждый кадр.
// На телефоне (до 720 px) в строке шапки места нет совсем: там кнопки — второй строкой шапки, во всю ширину.
const PHONE = window.matchMedia ? matchMedia("(max-width: 720px)") : { matches: false, addEventListener() {} };
const MODES = ["", "is-short", "is-icons", "ae-off"];       // подписи как на сайте (длинные; до 1100 px — короткие), короткие, значки, нет кнопок
const SPARE = 12;                                            // сколько места оставить свободным посередине шапки, когда там что-то показано
let nav = null, top = null, right = null, mid = null, key = "", mode = -1;
const shown = (e) => !!e && !e.hidden && getComputedStyle(e).display !== "none";

export function mount() {
  nav = document.querySelector(".top .ae-soc"); top = document.querySelector(".top");
  if (!nav || !top) return;
  right = top.querySelector(".right"); mid = top.querySelector(".mid");
  PHONE.addEventListener("change", () => { key = ""; tick(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { key = ""; tick(); });   // со шрифтами подписи шире
  tick();
}

// Что в шапке сейчас — то, от чего зависит, сколько места свободно. Подбор подписей это не меняет (иначе подбор ходил бы по кругу).
function stateKey() {
  const p = [top.clientWidth, PHONE.matches ? 1 : 0];
  for (const e of mid.children) p.push(shown(e) ? (e.id || e.className) + ":" + e.textContent.length : "-");
  for (const e of right.children) if (e !== nav) p.push(shown(e) ? (e.id || e.className) + ":" + e.textContent.length : "-");
  return p.join("|");
}
function set(i) {
  mode = i;
  nav.classList.remove("is-short", "is-icons", "ae-off", "ae-meas");
  if (MODES[i]) nav.classList.add(MODES[i]);
  for (const a of nav.querySelectorAll("a")) { if (MODES[i] === "is-icons") a.title = a.getAttribute("aria-label"); else a.removeAttribute("title"); }   // одни значки — подпись при наведении
}
// Посередине шапки всё помещается так же, как без кнопок канала: ни одна плашка не стала выше (не перенеслась) и не
// вылезла за себя, шапка не шире себя, и посередине осталось немного места.
function room(base) {
  if (top.scrollWidth > top.clientWidth + 1) return false;
  const kids = [...mid.children].filter(shown);
  let used = 0;
  for (let i = 0; i < kids.length; i++) {
    const e = kids[i], r = e.getBoundingClientRect();
    if (r.height > base[i] + 1 || e.scrollWidth > e.clientWidth + 1) return false;
    used += r.width;
  }
  const gap = parseFloat(getComputedStyle(mid).columnGap) || 0;
  return mid.clientWidth >= (kids.length ? used + gap * (kids.length - 1) + SPARE : 24);
}

export function tick() {
  if (!nav) return;
  const k = stateKey();
  if (k === key) return;
  key = k;
  if (PHONE.matches) {                                       // телефон: вторая строка шапки, подписи — по ширине экрана (social.css)
    if (nav.parentNode !== top) top.appendChild(nav);
    set(0); return;
  }
  if (nav.parentNode !== right) right.insertBefore(nav, right.firstChild);
  // Сначала — как шапка выглядит без кнопок канала. Кнопки на это время не прячутся (display: none заново запустил бы
  // их «загорание», и посреди игры они тускнели бы на пару секунд), а выходят из ряда невидимыми (класс ae-meas).
  nav.classList.add("ae-meas");
  const tight = top.scrollWidth > top.clientWidth + 1;      // шапке тесно и без них (так бывает в поздней игре при идущем стриме) — кнопок нет
  const base = [...mid.children].filter(shown).map((e) => e.getBoundingClientRect().height);
  nav.classList.remove("ae-meas");
  if (!tight) for (let i = 0; i < MODES.length - 1; i++) { set(i); if (room(base)) return; }   // от богатых подписей к бедным: первое, что помещается
  set(MODES.length - 1);
}
export const info = () => (nav ? { mode: MODES[mode] || "long", where: nav.parentNode === top ? "row" : "right" } : null);   // для проверки
