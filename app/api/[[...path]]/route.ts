// Proxy all /api/* requests to FastAPI backend.
// Middleware rewrite doesn't work in standalone mode for external URLs,
// so we use a catch-all API route that forwards requests to BACKEND_URL.

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080"

async function proxy(request: Request) {
  const url = new URL(request.url)
  const target = `${BACKEND_URL}${url.pathname}${url.search}`

  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.delete("connection")

  const init: RequestInit = {
    method: request.method,
    headers,
  }

  // Forward body for non-GET/HEAD requests
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body
    // @ts-ignore - duplex needed for streaming body
    init.duplex = "half"
  }

  try {
    const resp = await fetch(target, init)

    // Build response, strip hop-by-hop headers
    const respHeaders = new Headers(resp.headers)
    respHeaders.delete("transfer-encoding")
    respHeaders.delete("connection")

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    })
  } catch (error) {
    console.error("[API Proxy] Backend error:", error)
    return new Response(JSON.stringify({ error: "Backend unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const HEAD = proxy
export const OPTIONS = proxy
