"use client"

import { useEffect, useState } from "react"
import { CommonSheet } from "@/components/common-sheet"
import { History, MessageSquarePlus, Trash2, MessageCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { listChats, deleteChat, type AiChatSummary } from "@/lib/ai-chat-history"
import { toast } from "@/hooks/use-toast"

interface AiChatHistorySheetProps {
  isOpen: boolean
  onClose: () => void
  currentChatId: string | null
  onSelectChat: (chatId: string) => void
  onNewChat: () => void
}

type LoadState = "loading" | "ready" | "unavailable"

export function AiChatHistorySheet({ isOpen, onClose, currentChatId, onSelectChat, onNewChat }: AiChatHistorySheetProps) {
  const [chats, setChats] = useState<AiChatSummary[]>([])
  const [state, setState] = useState<LoadState>("loading")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Refetch every time the sheet opens rather than once on mount — the
  // backend route can appear mid-session (deploy race with this screen),
  // so an open re-check is what lets a previously-"unavailable" history
  // recover without a full app reload.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setState("loading")
    listChats().then((res) => {
      if (cancelled) return
      if (res === null) {
        setState("unavailable")
        return
      }
      setChats(res)
      setState("ready")
    })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const handleDelete = async (id: string | number) => {
    setDeletingId(String(id))
    const ok = await deleteChat(id)
    setDeletingId(null)
    if (ok) {
      setChats((prev) => prev.filter((c) => String(c.id) !== String(id)))
    } else {
      toast({
        title: "Не удалось удалить",
        description: "Попробуйте ещё раз чуть позже.",
        variant: "destructive",
      })
    }
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="История чатов" backgroundColor="white" swipeAction="close">
      <div className="flex flex-col gap-4 pb-6">
        <button
          onClick={() => {
            onNewChat()
            onClose()
          }}
          className="flex min-h-11 items-center gap-2.5 rounded-2xl border border-line px-4 py-3 text-body font-semibold text-ink transition-transform duration-press active:scale-[0.98]"
        >
          <MessageSquarePlus className="h-[18px] w-[18px] text-signal" strokeWidth={1.75} />
          Новый чат
        </button>

        {state === "loading" && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        )}

        {state === "unavailable" && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-canvas-sunk px-4 py-8 text-center">
            <History className="h-6 w-6 text-ink-3" strokeWidth={1.75} />
            <p className="text-body font-semibold text-ink">История временно недоступна</p>
            <p className="text-caption text-ink-2">
              Чат продолжает работать как обычно — история подключится сама, как только сервис будет на связи.
            </p>
          </div>
        )}

        {state === "ready" && chats.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-canvas-sunk px-4 py-8 text-center">
            <MessageCircle className="h-6 w-6 text-ink-3" strokeWidth={1.75} />
            <p className="text-body font-semibold text-ink">Пока нет сохранённых чатов</p>
            <p className="text-caption text-ink-2">Начните разговор — он появится здесь.</p>
          </div>
        )}

        {state === "ready" && chats.length > 0 && (
          <ul className="flex flex-col gap-2">
            {chats.map((chat) => {
              const isActive = currentChatId != null && String(chat.id) === String(currentChatId)
              return (
                <li key={chat.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border px-4 py-3 transition-colors",
                      isActive ? "border-signal bg-signal/[0.06]" : "border-line",
                    )}
                  >
                    <button
                      onClick={() => {
                        onSelectChat(String(chat.id))
                        onClose()
                      }}
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                    >
                      <span className="w-full truncate text-body font-semibold text-ink">
                        {chat.title?.trim() || "Без названия"}
                      </span>
                      <span className="text-caption text-ink-2">
                        {formatDistanceToNow(new Date(chat.updated_at), { addSuffix: true, locale: ru })}
                        {" · "}
                        {chat.message_count} {pluralizeMessages(chat.message_count)}
                      </span>
                    </button>
                    <button
                      onClick={() => handleDelete(chat.id)}
                      disabled={deletingId === String(chat.id)}
                      aria-label="Удалить чат"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-transform duration-press hover:text-ink active:scale-90 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </CommonSheet>
  )
}

function pluralizeMessages(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "сообщение"
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "сообщения"
  return "сообщений"
}
