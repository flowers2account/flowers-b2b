// Рабочее окно РЕАКТИВНЫХ ответов LAPS-бота: 09:00–18:30 Asia/Almaty, единый
// непрерывный интервал. Это НЕ два узких окна follow-up (09:30–11:00 / 14:00–15:30
// в campaign-followup.ts) — там другая механика (напоминания молчащим), здесь —
// живые ответы на входящие.
//
// Вне этого окна реактивный ответ НЕ отправляется сразу и НЕ теряется: сделка
// помечается тегом LAPS_REPLY_PENDING_TAG, а ближайший проход крона
// /api/cron/campaign-followup в рабочее время (расписание VPS — 09:45 и 14:15
// Almaty, оба внутри 09:00–18:30) подхватывает её через runLapsPendingReplyTick.
// «Не раньше 09:00» обеспечивается самим расписанием крона — отдельное поле
// «not before» не нужно.
//
// Asia/Almaty — фиксированный UTC+5 без переходов на летнее время (Казахстан
// перешёл на единый UTC+5 в 2024), сервер VPS в UTC → считаем смещением, без Intl.

const ALMATY_OFFSET_MIN = 5 * 60
const REPLY_START_MIN = 9 * 60           // 09:00
const REPLY_END_MIN = 18 * 60 + 30       // 18:30

// Тест-сеам: источник «сейчас». Прод — системные часы; смоук подменяет
// (как _timers в message-debounce.ts).
export const _clock = { now: (): number => Date.now() }

function almatyMinutesIntoDay(d: Date): number {
  const shifted = new Date(d.getTime() + ALMATY_OFFSET_MIN * 60_000)
  const dayStartMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  return (shifted.getTime() - dayStartMs) / 60_000
}

/** true → момент попадает в рабочее окно реактивных ответов (09:00–18:30 Almaty). */
export function isWithinLapsReplyHours(d?: Date): boolean {
  const m = almatyMinutesIntoDay(d ?? new Date(_clock.now()))
  return m >= REPLY_START_MIN && m < REPLY_END_MIN
}
