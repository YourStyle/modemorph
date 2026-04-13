import { NextResponse, type NextRequest } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080"

export async function middleware(request: NextRequest) {
  // Proxy /api/* to FastAPI backend
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, BACKEND_URL)

    const headers = new Headers(request.headers)
    // Remove host header to avoid conflicts
    headers.delete("host")

    try {
      const body = request.method !== "GET" && request.method !== "HEAD"
        ? await request.arrayBuffer()
        : undefined

      const backendResponse = await fetch(url.toString(), {
        method: request.method,
        headers,
        body,
        // @ts-ignore - duplex needed for streaming
        duplex: "half",
      })

      // Forward response with all headers
      const responseHeaders = new Headers(backendResponse.headers)
      responseHeaders.delete("transfer-encoding") // Edge runtime doesn't support chunked

      return new NextResponse(backendResponse.body, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: responseHeaders,
      })
    } catch (error) {
      console.error("[Middleware] Backend proxy error:", error)
      return NextResponse.json(
        { error: "Backend unavailable" },
        { status: 502 },
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match /api/* routes for proxying
    "/api/:path*",
    // Match all other routes except static files
    "/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
