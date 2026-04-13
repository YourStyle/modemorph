import { NextResponse, type NextRequest } from "next/server"

export async function middleware(_request: NextRequest) {
  // Session-based auth uses Bearer tokens — no cookie management needed.
  // API proxy is handled by app/api/[[...path]]/route.ts catch-all.
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
