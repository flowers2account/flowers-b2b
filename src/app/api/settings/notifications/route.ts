import { NextResponse } from 'next/server'

let clientNotificationsEnabled = true

export async function GET() {
  return NextResponse.json({ enabled: clientNotificationsEnabled })
}

export async function POST(req: Request) {
  const { enabled } = await req.json()
  clientNotificationsEnabled = enabled
  return NextResponse.json({ enabled: clientNotificationsEnabled })
}
