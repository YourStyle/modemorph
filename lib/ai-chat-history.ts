// lib/ai-chat-history.ts
//
// Client for the server-side AI chat history API (GET/POST /api/ai/chats...).
// Contract is fixed by the backend team (see backend/migrations/023_ai_chats.sql),
// but the routes may not exist yet at any given moment — every function here
// swallows network/HTTP errors (404 included) and resolves to `null` instead
// of throwing, so callers can degrade to "no history" without try/catch
// scattered everywhere and without ever showing a blank screen.
//
// The one-time migration of the legacy localStorage transcript
// ("ai_assistant_history") is also owned here: migrateLocalHistoryOnce()
// only clears localStorage once the import call actually succeeds, so an
// unavailable backend never loses the user's local history — it just
// retries next time the page loads.

import { api } from "@/lib/api-client"

export interface AiChatSummary {
  id: string | number
  title: string | null
  updated_at: string
  message_count: number
}

export interface AiChatMessageContent {
  text?: string
  outfit?: unknown
  /** Карточки вещей, упомянутых в ответе (не образ). content — JSONB, миграция не нужна. */
  items?: unknown
  attachedItem?: { id: string | number; name: string; image_url?: string | null } | null
}

export interface AiChatMessage {
  id: string | number
  role: "user" | "assistant"
  content: AiChatMessageContent | string
  created_at: string
}

export interface AiChatRecord {
  id: string | number
  title: string | null
  created_at: string
  updated_at: string
}

/** In-memory shape used by the chat UI itself (app/app/ai-assistant/page.tsx). */
export interface LocalMessage {
  role: "user" | "assistant"
  content: string
  outfit?: unknown
  items?: unknown
  attachedItem?: { id: string | number; name: string; image_url?: string | null } | null
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

export async function listChats(): Promise<AiChatSummary[] | null> {
  const res = await safe(() => api.get<{ chats: AiChatSummary[] }>("/api/ai/chats"))
  return Array.isArray(res?.chats) ? res!.chats : null
}

export async function createChat(title?: string): Promise<AiChatRecord | null> {
  const res = await safe(() => api.post<{ chat: AiChatRecord }>("/api/ai/chats", title ? { title } : {}))
  return res?.chat ?? null
}

export async function getChat(
  id: string | number,
): Promise<{ chat: AiChatRecord; messages: AiChatMessage[] } | null> {
  const res = await safe(() => api.get<{ chat: AiChatRecord; messages: AiChatMessage[] }>(`/api/ai/chats/${id}`))
  if (!res) return null
  return { chat: res.chat, messages: Array.isArray(res.messages) ? res.messages : [] }
}

export async function postMessage(
  chatId: string | number,
  role: "user" | "assistant",
  content: AiChatMessageContent,
): Promise<unknown | null> {
  const res = await safe(() =>
    api.post<{ message: unknown }>(`/api/ai/chats/${chatId}/messages`, { role, content }),
  )
  return res?.message ?? null
}

export async function deleteChat(id: string | number): Promise<boolean> {
  const res = await safe(() => api.delete<{ ok: boolean }>(`/api/ai/chats/${id}`))
  return !!res?.ok
}

export async function importChats(messages: Array<{ role: "user" | "assistant"; content: AiChatMessageContent }>): Promise<AiChatRecord | null> {
  const res = await safe(() => api.post<{ chat: AiChatRecord }>("/api/ai/chats/import", { messages }))
  return res?.chat ?? null
}

export function toApiContent(m: LocalMessage): AiChatMessageContent {
  return {
    text: m.content,
    ...(m.outfit ? { outfit: m.outfit } : {}),
    ...(m.items ? { items: m.items } : {}),
    ...(m.attachedItem ? { attachedItem: m.attachedItem } : {}),
  }
}

export function fromApiMessage(m: AiChatMessage): LocalMessage {
  const c = m.content
  if (typeof c === "string") {
    return { role: m.role, content: c }
  }
  return {
    role: m.role,
    content: c?.text ?? "",
    outfit: c?.outfit,
    items: c?.items,
    attachedItem: c?.attachedItem ?? undefined,
  }
}

const LEGACY_STORAGE_KEY = "ai_assistant_history"
const MIGRATED_FLAG_KEY = "ai_assistant_history_imported"

/**
 * Runs at most once per browser (persisted via MIGRATED_FLAG_KEY): ships the
 * legacy localStorage transcript to the server via /api/ai/chats/import.
 * Only marks itself done — and only clears the legacy key — once the import
 * actually succeeds, so a backend that's still deploying just gets retried
 * on the next app open instead of silently losing history.
 */
export async function migrateLocalHistoryOnce(): Promise<{ chatId: string } | null> {
  if (typeof window === "undefined") return null
  try {
    if (localStorage.getItem(MIGRATED_FLAG_KEY)) return null
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocalMessage[]
    if (!Array.isArray(parsed) || parsed.length === 0) return null

    const messages = parsed
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: toApiContent(m) }))
    if (messages.length === 0) return null

    const chat = await importChats(messages)
    if (!chat) return null

    localStorage.setItem(MIGRATED_FLAG_KEY, "1")
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    return { chatId: String(chat.id) }
  } catch {
    return null
  }
}
