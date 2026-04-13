// Catch-all stub — middleware.ts rewrites /api/* to FastAPI backend.
// This file exists only so Next.js recognizes /api/* as valid routes
// and passes them through middleware instead of returning 404.

export async function GET() {
  return new Response("Proxy not configured", { status: 502 })
}

export async function POST() {
  return new Response("Proxy not configured", { status: 502 })
}

export async function PUT() {
  return new Response("Proxy not configured", { status: 502 })
}

export async function PATCH() {
  return new Response("Proxy not configured", { status: 502 })
}

export async function DELETE() {
  return new Response("Proxy not configured", { status: 502 })
}
