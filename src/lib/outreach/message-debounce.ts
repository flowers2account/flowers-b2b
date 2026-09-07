// Склейка burst-сообщений одного диалога: если контакт присылает несколько
// сообщений подряд за короткое окно, обработчик кампании должен ответить ОДИН
// раз на объединённый контекст, а не по разу на каждое сообщение.
//
// Механизм: на dealId держим один отложенный таймер. Каждый новый входящий
// сбрасывает окно (clearTimeout + новый setTimeout). Когда пауза выдержана —
// выполняем process(). process() ОБЯЗАН заново получить историю диалога
// (fetchDialogContext) на момент срабатывания — к этому времени все сообщения
// burst'а уже в истории Umnico; кэшировать текст на момент постановки нельзя.
//
// Связь с deal-lock.ts: разные задачи. Дебаунс — не начинать обработку раньше
// времени. Лок — не выполнять две обработки параллельно, если они всё же
// пересеклись. Оба механизма остаются; дебаунс — основная защита, лок — подстраховка.
//
// БЕЗОПАСНОСТЬ in-memory Map: процесс flowers-b2b на VPS запущен в ОДНОМ
// экземпляре (ecosystem.release.config.js → instances: 1, хоть и exec_mode
// cluster). Все входящие одного диалога попадают в один event loop, Map ниже
// сериализует их корректно. При переходе на несколько воркеров этот подход
// (как и deal-lock.ts) перестанет гарантировать склейку между процессами —
// тогда нужна внешняя блокировка (БД/Redis).

// Тест-сеам: подменяемые таймеры. Прод использует глобальные; смоук-тест
// заменяет обе функции на управляемый мок (без реальных setTimeout).
export const _timers: {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
} = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

// Окно склейки. 6 c: покрывает типичный человеческий burst в мессенджере
// (2–4 сообщения с паузами 1–4 c между ними), при этом бот отвечает в пределах
// ~6–8 c после последнего сообщения — по ощущению как живой менеджер, который
// тоже не отвечает мгновенно. Короче (2–3 c) — не склеит медленно печатающих;
// длиннее (10 c+) — выглядит «проигнорировали».
export const BURST_DEBOUNCE_MS = 6000

const pending = new Map<number, unknown>()

/**
 * Отложить обработку диалога dealId на delayMs. Повторный вызов до срабатывания
 * отменяет прежний таймер и ставит новый (окно ожидания сбрасывается). process
 * запускается в фоне — вызывающий (webhook) НЕ ждёт его и может сразу отвечать
 * Umnico 200. Ошибки process логируются и не всплывают.
 */
export function scheduleDebouncedProcessing(
  dealId: number,
  process: () => Promise<void>,
  delayMs: number = BURST_DEBOUNCE_MS,
): void {
  const prev = pending.get(dealId)
  if (prev !== undefined) _timers.clear(prev)

  const handle = _timers.set(() => {
    pending.delete(dealId)
    Promise.resolve()
      .then(process)
      .catch((e) =>
        console.error(
          '[message-debounce] обработка diалога', dealId, 'упала:',
          e instanceof Error ? e.message : e,
        ),
      )
  }, delayMs)

  pending.set(dealId, handle)
}

/** Число диалогов с ещё не сработавшим таймером — для тестов/диагностики. */
export function pendingDebounceSize(): number {
  return pending.size
}
