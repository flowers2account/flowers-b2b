import { NextResponse } from 'next/server';

const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function GET() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_GEMINI_API_KEY not set' }, { status: 500 });
  }

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Переведи: Chr T Commander Pink' }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 50 }
      })
    });

    const data = await response.json();

    return NextResponse.json({
      status: response.status,
      ok: response.ok,
      model: GEMINI_MODEL,
      response: data,
      text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
