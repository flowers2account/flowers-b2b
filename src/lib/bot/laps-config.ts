// Конфигурация холодной B2B-кампании «LAPS» (обзвон флористов из 2ГИС).
// ОТДЕЛЬНЫЙ параллельный мини-конвейер — по образцу школьной кампании
// (campaign-*.ts), но её код НЕ трогаем и НЕ импортируем из неё логику,
// только общие утилиты (amo.ts helpers, время окон из campaign-followup.ts).
//
// Воронка amoCRM «Обзвон LAPS» pipeline_id=11053958. Этапы прочитаны через
// GET /api/v4/leads/pipelines/11053958 (04.09.2026) и захардкожены — воронка
// создана вручную владельцем, id стабильны.
//
// Канал Umnico — ТОТ ЖЕ номер, что у школьной кампании (один активный saId на
// аккаунт). Кампании различаем по pipeline_id найденной сделки, НЕ по saId.
//
// Кастомные поля СДЕЛКИ — ПЕРЕИСПОЛЬЗУЕМ школьные (CF_CAMPAIGN_* в amo.ts):
//   1689675 Campaign next followup not before, 1689679 Campaign followup count,
//   1689681 Campaign umnico ref. Сделка всегда в одной воронке, поэтому
//   школьный крон (listLeadsByPipeline 11235862) и LAPS-крон (11053958) никогда
//   не обрабатывают чужие сделки — коллизии значений нет.

export const AMO_LAPS_PIPELINE_ID = 11053958

// Этапы воронки 11053958 (GET /leads/pipelines/11053958, сверено 04.09.2026):
export const AMO_LAPS_STATUS_UNSORTED   = 86836470 // Неразобранное
export const AMO_LAPS_STATUS_NEW_LEADS  = 86836474 // Новые лиды (не звонили)
export const AMO_LAPS_STATUS_WHATSAPP   = 86857302 // сообщение в ватсап
export const AMO_LAPS_STATUS_CALL_TRY   = 86836478 // Попытка контакта   [звонки, вне автоматики]
export const AMO_LAPS_STATUS_CALL_BACK  = 86836482 // Перезвонить        [звонки, вне автоматики]
export const AMO_LAPS_STATUS_LPR        = 86836486 // ЛПР определён
export const AMO_LAPS_STATUS_MATERIAL   = 86836490 // Материалы отправлены
export const AMO_LAPS_STATUS_DEMO       = 86836494 // Презентация/демо    [вне автоматики]
export const AMO_LAPS_STATUS_THINKING   = 86836498 // Думает/дожим
export const AMO_LAPS_STATUS_WON        = 142      // Успешно реализовано (глобальный)
export const AMO_LAPS_STATUS_LOST       = 143      // Закрыто и не реализовано (глобальный)

// Порядок этапов от начала к концу — для сравнения «материалы уже отправлены
// (на этой стадии или дальше)», как CAMPAIGN_STAGE_ORDER в campaign-bot.ts.
export const LAPS_STAGE_ORDER: readonly number[] = [
  AMO_LAPS_STATUS_UNSORTED,
  AMO_LAPS_STATUS_NEW_LEADS,
  AMO_LAPS_STATUS_WHATSAPP,
  AMO_LAPS_STATUS_CALL_TRY,
  AMO_LAPS_STATUS_CALL_BACK,
  AMO_LAPS_STATUS_LPR,
  AMO_LAPS_STATUS_MATERIAL,
  AMO_LAPS_STATUS_DEMO,
  AMO_LAPS_STATUS_THINKING,
  AMO_LAPS_STATUS_WON,
  AMO_LAPS_STATUS_LOST,
]

// Экстремальное значение followup count → «фоллоу-ап остановлен навсегда»
// (страховка на случай, если PATCH стадии в 143 не прошёл). LAPS-крон и так
// не трогает сделки вне стадии «Материалы отправлены», но 999 — явный стоп.
export const LAPS_FOLLOWUP_STOPPED = 999

// Тег на сделке = «первый отказ уже обработан» (нужен новый механизм счётчика
// подряд-отказов, БЕЗ новых кастомных полей — используем лёгкую метку-тег).
export const LAPS_REFUSE_ONCE_TAG = 'laps-refuse-1'

// Kill-switch: весь LAPS-конвейер (ответы + фоллоу-ап) работает ТОЛЬКО при
// LAPS_CAMPAIGN_ENABLED === 'true'. По умолчанию ВЫКЛ — как UMNICO_BOT_ENABLED
// и CAMPAIGN_FOLLOWUP_ENABLED, чтобы холодный бот не начал отвечать/слать файлы
// и двигать стадии сам по себе до явного включения владельцем.
export function lapsEnabled(): boolean {
  return process.env.LAPS_CAMPAIGN_ENABLED === 'true'
}

// Материалы кампании. Файл презентации владелец добавит отдельно в
// public/campaign/laps-2gis/ — этот модуль только ссылается по пути.
export const LAPS_PRESENTATION_PDF_URL = 'https://uralskflowers.kz/campaign/laps-2gis/presentation.pdf'
export const LAPS_CATALOG_URL = 'uralskflowers.kz/catalog'
export const LAPS_REGISTER_URL = 'uralskflowers.kz/register'
