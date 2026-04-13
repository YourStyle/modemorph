import { NextResponse, type NextRequest } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080"

export async function middleware(request: NextRequest) {
  // Proxy /api/* to FastAPI backend via rewrite
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, BACKEND_URL)
    return NextResponse.rewrite(target)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
