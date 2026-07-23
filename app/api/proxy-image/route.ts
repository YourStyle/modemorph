import { NextRequest } from "next/server"

// Same-origin image proxy. Needed because remote item/result images (Yandex S3,
// partner CDNs) don't send CORS headers, which breaks both `fetch()` (for share)
// and reading pixels back from <canvas> (for the watermark). Routing the bytes
// through Next makes them same-origin, so both just work.

// ponytail: allowlist-by-deny — reject localhost/private ranges instead of an
// allowlist of every partner CDN. Only image bytes are ever returned to the
// caller, so the SSRF surface is small; tighten to a host allowlist if needed.
function isBlockedHost(h: string): boolean {
  return (
    h === "localhost" ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  )
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url")
  if (!target) return new Response("Missing url", { status: 400 })

  let u: URL
  try {
    u = new URL(target)
  } catch {
    return new Response("Bad url", { status: 400 })
  }
  if (u.protocol !== "https:" || isBlockedHost(u.hostname)) {
    return new Response("Forbidden host", { status: 403 })
  }

  let upstream: Response
  try {
    upstream = await fetch(u.toString())
  } catch {
    return new Response("Upstream fetch failed", { status: 502 })
  }
  if (!upstream.ok) return new Response("Upstream error", { status: 502 })

  const contentType = upstream.headers.get("content-type") || "image/jpeg"
  if (!contentType.startsWith("image/")) {
    return new Response("Not an image", { status: 415 })
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
