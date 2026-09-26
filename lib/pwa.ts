// PWA install + web push, for the web version (never inside Telegram).
//
// beforeinstallprompt fires once, early, and only on Chromium (Android/desktop).
// This module is imported by the root layout (components/install-banner.tsx)
// so the listener exists before any page mounts; the sheet reads it later.
// iOS has no install API at all — the only way is Share → «На экран Домой»,
// so there we show instructions. Web push on iOS works only from the installed
// app (16.4+) and only after a tap — hence a button, never an auto-prompt.

import { api } from "@/lib/api-client"

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: InstallPrompt | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferred = e as InstallPrompt
    notify()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    notify()
  })
  if ("serviceWorker" in navigator && !inTelegram()) {
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  }
}

export function onPwaChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function inTelegram(): boolean {
  return typeof window !== "undefined" && !!(window as any).Telegram?.WebApp?.initData
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return false
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

export const canPromptInstall = () => deferred !== null

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const e = deferred
  deferred = null
  await e.prompt()
  const { outcome } = await e.userChoice
  notify()
  return outcome === "accepted"
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

function keyToBytes(b64: string): Uint8Array {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

export async function pushSubscribed(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false
  const reg = await navigator.serviceWorker.getRegistration()
  return !!(await reg?.pushManager.getSubscription())
}

/** Must run from a tap. Throws a user-readable message on failure. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("Браузер не поддерживает уведомления")
  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new Error("Уведомления запрещены в настройках браузера")
  const { key } = await api.get<{ key: string | null }>("/api/me/push-key")
  if (!key) throw new Error("Уведомления пока не настроены на сервере")
  const reg = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }))
  await api.post("/api/me/push-subscription", sub.toJSON())
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await api.delete("/api/me/push-subscription", { body: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}
