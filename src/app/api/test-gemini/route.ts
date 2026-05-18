import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_GEMINI_API_KEY not set' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const data = await response.json();

    const generateModels = data.models
      ?.filter((m: { supportedGenerationMethods?: string[] }) =>
        m.supportedGenerationMethods?.includes('generateContent')
      )
      .map((m: { name: string; displayName: string }) => ({
        name: m.name,
        displayName: m.displayName,
      }));

    return NextResponse.json({
      total: data.models?.length ?? 0,
      generateContent: generateModels?.length ?? 0,
      models: generateModels,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
