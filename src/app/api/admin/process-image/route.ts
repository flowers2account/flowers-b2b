import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'file обязателен' }, { status: 400 })
    }

    const apiKey = process.env.REMOVE_BG_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'REMOVE_BG_API_KEY не настроен' }, { status: 500 })
    }

    const rbForm = new FormData()
    rbForm.append('image_file', file)
    rbForm.append('size', process.env.REMOVE_BG_SIZE || 'auto')
    rbForm.append('bg_color', 'ffffff')
    rbForm.append('format', 'jpg')

    const callRemoveBg = () =>
      fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: rbForm,
      })

    let rbRes = await callRemoveBg()

    if (rbRes.status === 429) {
      const delay = parseInt(rbRes.headers.get('Retry-After') || '5', 10) * 1000
      await new Promise(r => setTimeout(r, delay))
      rbRes = await callRemoveBg()
    }

    if (rbRes.status === 402) {
      // Кредиты закончились — возвращаем исходный файл как есть
      const originalBytes = await file.arrayBuffer()
      return new NextResponse(originalBytes, {
        status: 200,
        headers: {
          'Content-Type': file.type,
          'X-No-Credits': '1',
        },
      })
    }

    if (!rbRes.ok) {
      const errText = await rbRes.text().catch(() => '')
      return NextResponse.json(
        { error: `remove.bg вернул ${rbRes.status}${errText ? ': ' + errText.slice(0, 200) : ''}` },
        { status: 502 }
      )
    }

    const processedBytes = await rbRes.arrayBuffer()
    return new NextResponse(processedBytes, {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
