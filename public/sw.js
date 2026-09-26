// Service worker: only web push. No fetch handler — nothing is cached offline,
// so a deploy can never be stuck behind a stale SW.
// Payload from backend/app/services/webpush.py: {title, body, url}.

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data && event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "ModeMorph", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/app" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  // ponytail: always a fresh window. client.navigate() would reuse an open tab,
  // but it rejects for pages this SW doesn't control and then nothing opens.
  const url = new URL(event.notification.data?.url || "/app", self.location.origin).href
  event.waitUntil(self.clients.openWindow(url))
})
