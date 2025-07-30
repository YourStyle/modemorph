import { type NextRequest, NextResponse } from "next/server"

// Простой эндпоинт для проверки статуса webhook
export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "AI Photo Parse Webhook",
    timestamp: new Date().toISOString(),
    maxDuration: 300,
    features: ["Photo analysis", "Object detection", "Color analysis", "Material classification", "Style recognition"],
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    return NextResponse.json({
      received: true,
      timestamp: new Date().toISOString(),
      bodySize: JSON.stringify(body).length,
      message: "Test request processed successfully",
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to process test request" }, { status: 400 })
  }
}
