// app/api/translations/normalize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { normalizeWithAI } from '@/lib/naming/ai-normalizer';

export async function POST(request: NextRequest) {
  try {
    const { original, category } = await request.json();

    if (!original || typeof original !== 'string') {
      return NextResponse.json(
        { error: 'Invalid input: original is required' },
        { status: 400 }
      );
    }

    const result = await normalizeWithAI(original, category);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Normalization API error:', error);

    return NextResponse.json(
      {
        error: 'Normalization failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
