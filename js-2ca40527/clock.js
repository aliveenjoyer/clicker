// Часы игры. Время для Затмения, офлайн-дохода, заданий дня и сохранения берётся с сервера, а не с часов компьютера:
// раньше перевод часов вперёд снимал суточное ожидание Затмения и давал офлайн-доход и задания «из будущего».
// Сервер — сам сайт: заголовок Date его ответа на build.txt. Между сверками время идёт по performance.now.
// Ссылки на performance.now, Date.now и fetch взяты здесь, при загрузке модуля, — подмена их из консоли потом часы
// не трогает. Пока сверки не было (нет связи), часы идут по компьютеру, а Затмение и офлайн-доход ждут сверки.
const PNOW = performance.now.bind(performance), DNOW = Date.now.bind(Date), FETCH = fetch.bind(window);
let base = 0, at = 0, ok = false, build = "", syncing = null;

export const ready = () => ok;
export const now = () => (ok ? base + (PNOW() - at) : DNOW());
export const perf = PNOW;                                   // монотонные миллисекунды для игрового цикла
export const builtAs = () => build;                         // build.txt при первой сверке: по нему видно, что вышла новая версия

// Сверить часы с сервером. Отдаёт текст build.txt (или "", если файла нет — так на своём компьютере в папке game/).
export function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const t0 = PNOW();
      const r = await FETCH("build.txt?t=" + Math.floor(DNOW() / 1000), { cache: "no-store" });
      const t1 = PNOW();
      const d = Date.parse(r.headers.get("Date") || "");
      if (Number.isFinite(d)) { base = d + 500 + (t1 - t0) / 2; at = t1; ok = true; }   // в заголовке целые секунды: середина секунды
      const text = r.ok ? (await r.text()).trim().slice(0, 200) : "";
      if (!build && text) build = text;
      return text;
    } catch (e) {
      return null;                                           // нет связи — сверимся в следующий раз
    } finally { syncing = null; }
  })();
  return syncing;
}
// Сверка при запуске, но не дольше ms: игра не ждёт медленную сеть.
export function first(ms) {
  return Promise.race([sync(), new Promise((r) => setTimeout(r, ms))]);
}
