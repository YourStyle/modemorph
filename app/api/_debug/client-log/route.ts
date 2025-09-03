export const runtime = "nodejs"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    // В prod можно писать в console или в вашу лог-систему
    console.error("[CLIENT-LOG]", JSON.stringify(body).slice(0, 4000))
  } catch (e) {
    console.error("[CLIENT-LOG] bad payload", e)
  }
  return NextResponse.json({ ok: true })
}
