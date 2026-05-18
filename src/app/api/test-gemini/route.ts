import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

  return NextResponse.json({
    hasKey: !!apiKey,
    keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET',
    environment: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
  });
}
