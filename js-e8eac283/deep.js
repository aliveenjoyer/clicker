// Глубина комбо рисунков — вид всей страницы. Комбо проваливается через «Разлом» на уровни «Подземка» (с 100), «Изнанка»
// (с 250) и «Пустота» (с 500): правила — js/core.js (figGate*, figStep) и DEEP в js/data.js, рисунки и сетка — js/ui.js.
// Здесь — то, что меняется на странице целиком: палитра, подложка за плитами, фон поля боя, шапка, переход между
// уровнями и гул места (js/audio.js). Стили — css/deep.css, картинки — art/deep (tools/cut_deep.py).
//
// Как устроено. Уровень — атрибут data-deep="1…3" на <html>: по нему css меняет цвета (переменные из tokens.css), плиты,
// сетку, шкалу и фон поля. Подложка (#dpBack) лежит под всей страницей (z-index −1): размытая картинка места и немного
// живого — огни поезда, искры, звёзды; анимируются только сдвиг и прозрачность, чтобы страница рядом со стримом и OBS
// не тормозила. Поверх окна чата Twitch и картинки стрима (#twbg в .arena) ничего не кладётся: всё либо под страницей,
// либо внутри поля боя и сетки героев. Родители картинки (.stage, .main, body) не получают ни сдвига, ни фильтра, ни
// прозрачности — браузер считал бы плеер накрытым; при показанном стриме соседи картинки при переходе стоят на месте.
import { DEEP } from "./data.js";
import { setDeep as soundDeep } from "./audio.js";

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const ROMAN = ["", "I", "II", "III"];
let cur = 0, back = null, tag = null, small = null, smallWas = null, flashT = 0, moveT = 0, known = 0;
const got = {};                                              // какие картинки уровней уже запрошены

export const level = () => cur;
export const emblem = (d) => "art/deep/emb-" + DEEP[d].id + ".webp";
export const roman = (d) => ROMAN[d] || "";
const quiet = () => document.body.classList.contains("calm") || matchMedia("(prefers-reduced-motion: reduce)").matches;

// Картинки уровня грузятся заранее — когда комбо подходит к разлому, — чтобы провал не начинался с пустого фона.
export function warm(d) {
  if (!(d >= 1 && d < DEEP.length) || got[d]) return;
  got[d] = true;
  for (const n of ["bg-", "back-", "emb-"]) { const im = new Image(); im.decoding = "async"; im.src = "art/deep/" + n + DEEP[d].id + ".webp"; }
}

function build() {
  if (back) return;
  back = document.createElement("div"); back.id = "dpBack"; back.setAttribute("aria-hidden", "true");
  // два слоя картинки — для плавной смены; .dp-amb — живое этого уровня; .dp-lines — полосы скорости при провале и всплытии
  back.innerHTML = '<i class="dp-img"></i><i class="dp-img"></i><i class="dp-shade"></i><div class="dp-amb"></div><i class="dp-lines"></i>';
  document.body.insertBefore(back, document.body.firstChild);
  const mid = document.querySelector(".top .mid");
  if (mid) {
    tag = document.createElement("div"); tag.id = "dpTag"; tag.className = "dp-tag"; tag.hidden = true;
    tag.innerHTML = '<img alt="" draggable="false"><span class="dp-tt"><b></b><span></span></span>';
    mid.insertBefore(tag, mid.firstChild);
  }
  small = document.querySelector(".logo small");
  if (small) smallWas = small.textContent;
}

// Живое на подложке: немного элементов, у каждого своя скорость и задержка (css — по классу уровня).
function ambient(d) {
  const box = back.querySelector(".dp-amb");
  box.className = "dp-amb" + (d ? " dp-amb-" + DEEP[d].id : "");
  let h = "";
  const rnd = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
  if (d === 1) { for (let i = 0; i < 2; i++) h += '<i class="dp-train" style="--dl:' + (i * 6.5) + 's; --y:' + (i ? 68 : 22) + '%"></i>'; for (let i = 0; i < 6; i++) h += '<i class="dp-lamp" style="--x:' + rnd(3, 97) + '%; --y:' + rnd(6, 90) + '%; --dl:-' + rnd(0, 6) + 's; --du:' + rnd(3.5, 7) + 's"></i>'; }
  if (d === 2) for (let i = 0; i < 14; i++) h += '<i class="dp-ember" style="--x:' + rnd(1, 99) + '%; --dl:-' + rnd(0, 14) + 's; --du:' + rnd(9, 16) + 's; --s:' + rnd(3, 7) + 'px; --sw:' + rnd(-40, 40) + 'px"></i>';
  if (d === 3) { h += '<i class="dp-corona"></i>'; for (let i = 0; i < 18; i++) h += '<i class="dp-star" style="--x:' + rnd(1, 99) + '%; --y:' + rnd(2, 96) + '%; --dl:-' + rnd(0, 5) + 's; --du:' + rnd(2.4, 5.5) + 's; --s:' + rnd(1.5, 3.5) + 'px"></i>'; }
  box.innerHTML = h;
}

function paint(d) {                                          // всё, что зависит от уровня и не анимируется
  build();
  if (d) root.dataset.deep = String(d); else delete root.dataset.deep;
  const L = DEEP[d], imgs = back.querySelectorAll(".dp-img");
  // свежая картинка — во втором слое, прежняя уходит из первого
  imgs[0].style.backgroundImage = imgs[1].style.backgroundImage; imgs[0].className = "dp-img dp-out";
  imgs[1].style.backgroundImage = d ? 'url("art/deep/back-' + L.id + '.webp")' : "none"; imgs[1].className = "dp-img dp-in";
  void imgs[1].offsetWidth; imgs[0].classList.add("dp-go"); imgs[1].classList.add("dp-go");
  back.classList.toggle("dp-on", d > 0);
  ambient(d);
  if (tag) {
    tag.hidden = !d;
    if (d) {
      tag.querySelector("img").src = emblem(d);
      tag.querySelector("b").textContent = "Глубина " + ROMAN[d] + " · " + L.name;
      tag.querySelector(".dp-tt span").textContent = L.rule + ": " + L.how.split(":")[0].split(" — ")[0];
      tag.title = "Комбо рисунков провалилось на глубину " + ROMAN[d] + " — «" + L.name + "» (с комбо " + L.at + "). Правило уровня — «" + L.rule + "»: " + L.how +
        ". Остынет комбо ниже " + L.at + " — всплывёшь обратно";
    }
  }
  if (small) small.textContent = d ? "глубина " + ROMAN[d] + " · " + L.name.toLowerCase() : smallWas;
  const meta = document.querySelector('meta[name="theme-color"]');   // цвет шапки браузера на телефоне — в цвет места
  if (meta) meta.content = ["#12142a", "#061521", "#1a0510", "#05040d"][d];
  soundDeep(d);
}

// Смена уровня. how: "dive" — провал глубже, "rise" — всплытие, иначе — без перехода (загрузка, проверки, рисунки выключены).
export function set(d, how) {
  d = Math.max(0, Math.min(DEEP.length - 1, Math.floor(d) || 0));
  if (d === cur && back) return;
  const was = cur; cur = d;
  if (d) warm(d);
  if (d + 1 < DEEP.length) warm(d + 1);
  const move = (how === "dive" || how === "rise") && !quiet() && was !== d;
  clearTimeout(moveT);
  root.classList.remove("dp-dive", "dp-rise");
  root.classList.toggle("dp-tw", !!document.querySelector(".arena.tw"));   // картинка стрима показана: соседи при переходе стоят на месте
  if (!move) { paint(d); return; }
  build();
  void root.offsetWidth;
  root.classList.add(how === "dive" ? "dp-dive" : "dp-rise");
  flash(how === "dive" ? "dp-fd" : "dp-fr", how === "dive" ? d : was, 1200);
  paint(d);
  if (tag && d && how === "dive") { tag.classList.remove("dp-tagin"); void tag.offsetWidth; tag.classList.add("dp-tagin"); }   // плашка уровня в шапке въезжает
  moveT = setTimeout(() => root.classList.remove("dp-dive", "dp-rise"), 1300);
}

// Вспышка перехода внутри поля боя: обрезана его краем, на картинку стрима рядом не выступает.
function flash(cls, d, ms) {
  const f = $("field"); if (!f) return;
  let el = f.querySelector(".dp-flash");
  if (!el) { el = document.createElement("i"); el.className = "dp-flash"; el.setAttribute("aria-hidden", "true"); f.appendChild(el); }
  el.className = "dp-flash"; el.dataset.lv = String(d); void el.offsetWidth; el.classList.add(cls);
  clearTimeout(flashT); flashT = setTimeout(() => { el.className = "dp-flash"; }, ms);
}
// Разлом открылся (js/rite.js): поле боя на миг вспыхивает цветом уровня, куда он ведёт.
export function pulse(to) { if (!quiet() && to >= 1 && to < DEEP.length) flash("dp-fo", to, 900); }

// Что игрок уже открыл (рекорд глубины): по нему в шкале и во вкладке «Путь» уровни показаны открытыми или под замком.
export function setKnown(n) { known = Math.max(0, Math.min(DEEP.length - 1, n || 0)); root.dataset.deepKnown = String(known); }
export const knownMax = () => known;

export function mount() { build(); setKnown(0); }
