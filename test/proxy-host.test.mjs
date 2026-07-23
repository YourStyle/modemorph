// Runnable check for the proxy-image SSRF guard.
// Run: node test/proxy-host.test.mjs
// Mirrors isBlockedHost() in app/api/proxy-image/route.ts — keep in sync.
import assert from "node:assert"

function isBlockedHost(h) {
  return (
    h === "localhost" ||
    h.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  )
}

// Must block — private/internal targets.
for (const h of ["localhost", "metadata.internal", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "172.16.0.1", "172.31.255.255"]) {
  assert.equal(isBlockedHost(h), true, `expected BLOCKED: ${h}`)
}
// Must allow — public CDNs.
for (const h of ["storage.yandexcloud.net", "cdn.partner.com", "172.32.0.1", "8.8.8.8"]) {
  assert.equal(isBlockedHost(h), false, `expected ALLOWED: ${h}`)
}

console.log("proxy-host guard: OK")
