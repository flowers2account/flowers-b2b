// Общий клиент Gemini — та же форма вызова, что в рабочем /api/translations/batch
// (endpoint v1beta, модель models/gemini-flash-lite-latest). Единая точка, чтобы
// бот и переводчик не расходились по эндпоинту/модели.

const RAW_MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'models/gemini-flash-lite-latest'
// Эндпоинту нужен префикс models/. Нормализуем на случай, если env задан без него.
const MODEL = RAW_MODEL.startsWith('models/') ? RAW_MODEL : `models/${RAW_MODEL}`
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent`

interface CallOptions {
  /** responseMimeType: 'application/json' */
  json?: boolean
  temperature?: number
}

/**
 * Один вызов Gemini generateContent. Возвращает текст ответа либо null
 * (ключ не задан / HTTP-ошибка / сетевой сбой) — никогда не бросает.
 */
export async function callGemini(prompt: string, opts: CallOptions = {}): Promise<string | null> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) {
    console.error('[gemini] GOOGLE_GEMINI_API_KEY not set')
    return null
  }
  try {
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    })
    if (!res.ok) {
      console.error('[gemini] HTTP error:', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text
    return text ?? null
  } catch (err) {
    console.error('[gemini] call failed:', (err as Error)?.message)
    return null
  }
}
