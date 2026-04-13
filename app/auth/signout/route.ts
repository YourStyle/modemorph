import { redirect } from "next/navigation"

export async function POST() {
  // Session cleanup happens client-side via sessionAuth.clearSession()
  // FastAPI /api/auth/signout is stateless (no-op)
  redirect("/")
}

export async function GET() {
  redirect("/")
}
