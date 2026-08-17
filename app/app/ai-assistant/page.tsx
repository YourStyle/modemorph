"use client"

import type React from "react"

import { useState, useEffect, useRef, type ComponentType } from "react"
import {
  Send,
  Camera,
  Sparkles,
  Plus,
  X,
  History,
  SquarePen,
  Paperclip,
  Shirt,
  Sun,
  ShoppingBag,
  CalendarDays,
  ExternalLink,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { sessionAuth } from "@/lib/tma/session-auth"
import { PhotoAnalysisForm } from "@/components/photo-analysis-form"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits"
import { SubscriptionSheet } from "@/components/subscription-sheet"
import { useFeature } from "@/hooks/use-feature"
import { api } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { useAnalytics } from "@/hooks/use-analytics"
import { getUserCoords } from "@/lib/tma/geo"
import { useTryOn } from "@/contexts/try-on-context"
import { AiChatHistorySheet } from "@/components/ai-chat-history-sheet"
import { AiChatItemPickerSheet, type AttachableWardrobeItem } from "@/components/ai-chat-item-picker-sheet"
import {
  createChat,
  getChat,
  migrateLocalHistoryOnce,
  postMessage,
  fromApiMessage,
  toApiContent,
  type LocalMessage,
} from "@/lib/ai-chat-history"

interface AttachedItem {
  id: number | string
  name: string
  image_url?: string | null
  color?: string | null
}

interface Message {
  role: "user" | "assistant"
  content: string
  outfit?: UserRecommendation
  attachedItem?: AttachedItem | null
}

interface UserRecommendation {
  id: string
  title: string
  description: string
  items: RecommendationItem[]
}

interface RecommendationItem {
  type: "clothing"
  id: number
  name: string
  image_url: string
  color: string
  url?: string | null
  isUserItem: boolean
}

// Типы ответов от AI API
interface TrashResponse {
  type: "trash"
}

interface ContentResponse {
  content: string
}

interface OutfitResponse {
  id: string
  title: string
  description: string
  items: {
    id: string
    name: string
    user_id: string
    image_url: string
    color: string | null
    shade: string | null
    has_print: string
    notes: string | null
    url: string | null
  }[]
  suggested_items_count: number
}

type AIPromptResponse = TrashResponse | ContentResponse | OutfitResponse

const STORAGE_KEY = "ai_assistant_history"
const MAX_MESSAGES = 100

const GREETING: Message = {
  role: "assistant",
  content:
    "Привет! Я помогу вам с образами и анализом одежды. Спросите, что надеть, прикрепите вещь из гардероба или выберите готовый сценарий ниже.",
}

// Готовые сценарии одним тапом (см. USERFLOW): либо сразу отправляют
// сформулированный запрос, либо (когда сценарию нужен параметр, который
// знает только пользователь — повод) подставляют черновик в поле и отдают
// фокус, чтобы человек его дописал одним движением, а не печатал с нуля.
type ScenarioChip =
  | {
      key: string
      label: string
      icon: ComponentType<{ className?: string; strokeWidth?: number }>
      kind: "send"
      prompt: string
    }
  | {
      key: string
      label: string
      icon: ComponentType<{ className?: string; strokeWidth?: number }>
      kind: "prefill"
      prefill: string
    }

const SCENARIO_CHIPS: ScenarioChip[] = [
  {
    key: "weather",
    label: "На сегодня по погоде",
    icon: Sun,
    kind: "send",
    prompt: "Подбери мне образ на сегодня с учётом погоды",
  },
  {
    key: "shopping",
    label: "Что купить к гардеробу",
    icon: ShoppingBag,
    kind: "send",
    prompt: "Каких вещей не хватает в моём гардеробе? Предложи, что стоит докупить, чтобы собирать больше образов",
  },
  {
    key: "occasion",
    label: "Собрать на повод",
    icon: CalendarDays,
    kind: "prefill",
    prefill: "Собери образ на повод: ",
  },
  {
    key: "declutter",
    label: "Разобрать гардероб",
    icon: Shirt,
    kind: "send",
    prompt: "Разбери мой гардероб: какие вещи почти ни с чем не сочетаются, и их стоит отдать или продать?",
  },
]

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [showPhotoForm, setShowPhotoForm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // История чатов — доступ без чужеродного <h1>: два плавающих круглых
  // значка на той же высоте, что и общая пилюля приложения (top-navigation),
  // не отдельная шапка экрана. currentChatId живёт локально и мирроуит
  // сообщения на сервер лучшим усилием — если бэкенд ещё не отвечает,
  // всё продолжает работать как обычный чат (см. lib/ai-chat-history.ts).
  const [historyOpen, setHistoryOpen] = useState(false)
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [attachedItem, setAttachedItem] = useState<AttachedItem | null>(null)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const historyMirrorDisabledRef = useRef(false)

  const { log, consume } = useFeature()
  const { trackEvent, trackOnce } = useAnalytics()
  const { startTryOn, session: tryOnSession } = useTryOn()

  useReconcileLimits(true)

  // Загрузка истории из localStorage при монтировании (резервный слой —
  // работает даже если серверная история никогда не поднимется).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Message[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error)
    }
  }, [])

  // Одноразовый перенос localStorage-истории на сервер, как только API
  // истории впервые ответит успешно. Ничего не делает и не падает, если
  // роуты ещё не задеплоены — localStorage при этом не трогается.
  useEffect(() => {
    migrateLocalHistoryOnce().then((res) => {
      if (res) setCurrentChatId(res.chatId)
    })
  }, [])

  // Сохранение истории в localStorage при изменении сообщений
  useEffect(() => {
    if (messages.length > 1) {
      try {
        const messagesToSave = messages.slice(-MAX_MESSAGES)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesToSave))
      } catch (error) {
        console.error("Failed to save chat history:", error)
      }
    }
  }, [messages])

  useEffect(() => {
    const uid = sessionAuth.getUserId()
    if (uid) setUserId(uid)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Лучшее усилие: пишет пару реплик в серверную историю. Создаёт чат
  // лениво на первом сообщении. Любая ошибка (роут ещё не задеплоен, сеть,
  // 500) один раз выключает зеркалирование до конца сессии — чтобы не
  // долбить заведомо недоступный эндпоинт на каждую реплику.
  const mirrorTurn = async (turn: LocalMessage[]) => {
    if (historyMirrorDisabledRef.current) return
    try {
      let chatId = currentChatId
      if (!chatId) {
        const title = turn[0]?.content?.slice(0, 60)
        const chat = await createChat(title)
        if (!chat) {
          historyMirrorDisabledRef.current = true
          return
        }
        chatId = String(chat.id)
        setCurrentChatId(chatId)
      }
      for (const m of turn) {
        await postMessage(chatId, m.role, toApiContent(m))
      }
    } catch {
      historyMirrorDisabledRef.current = true
    }
  }

  const handleNewChat = () => {
    setMessages([GREETING])
    setCurrentChatId(null)
    setAttachedItem(null)
    setInputValue("")
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  const handleSelectChat = async (chatId: string) => {
    const res = await getChat(chatId)
    if (!res) {
      toast({
        title: "Не удалось открыть чат",
        description: "Попробуйте ещё раз чуть позже.",
        variant: "destructive",
      })
      return
    }
    const loaded = res.messages.map(fromApiMessage) as Message[]
    setMessages(loaded.length > 0 ? loaded : [GREETING])
    setCurrentChatId(String(res.chat.id))
    setAttachedItem(null)
  }

  const getCurrentWeather = async () => {
    const fallback = { temperature: 20, condition: "Clear", description: "ясно", location: "Москва" }

    try {
      try {
        const cachedWeather = await api.get("/api/weather/cached")
        return {
          temperature: cachedWeather.temperature,
          condition: cachedWeather.condition,
          description: cachedWeather.description,
          location: cachedWeather.location,
        }
      } catch {
        // Continue to geolocation if cached weather fails
      }

      const coords = (await getUserCoords(8000)) || { latitude: 55.7558, longitude: 37.6176 }

      try {
        const weatherData = await api.get(`/api/weather?lat=${coords.latitude}&lon=${coords.longitude}`)
        return {
          temperature: weatherData.temperature,
          condition: weatherData.condition,
          description: weatherData.description,
          location: weatherData.location,
        }
      } catch {
        return fallback
      }
    } catch (error) {
      console.error("Error getting weather:", error)
      return fallback
    }
  }

  const handleSend = async (customPrompt?: string) => {
    const typed = customPrompt || inputValue.trim()
    const pendingAttachment = customPrompt ? null : attachedItem
    if (!typed && !pendingAttachment) return
    if (isLoading) return

    // Вещь из гардероба уходит в /api/ai-assistant тем же единственным полем
    // `prompt` (контракт запроса не меняем) — просто дописываем её словами в
    // ту же строку, что уже печатает пользователь.
    const attachmentLine = pendingAttachment
      ? `Вещь из гардероба: «${pendingAttachment.name}»${pendingAttachment.color ? `, цвет ${pendingAttachment.color}` : ""} (id ${pendingAttachment.id}).`
      : ""
    const userVisibleText = typed || (pendingAttachment ? "С чем сочетать эту вещь?" : "")
    const messageToSend = [userVisibleText, attachmentLine].filter(Boolean).join("\n\n")

    if (messageToSend.length < 20) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Пожалуйста, опишите ваш запрос более подробно (минимум 20 символов). Расскажите больше о том, что вас интересует! 😊",
        },
      ])
      return
    }

    if (messageToSend.length > 2000) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Ваш запрос слишком длинный (максимум 2000 символов). Попробуйте сократить его, сохранив основную суть! ✂️",
        },
      ])
      return
    }

    const userMessage: Message = { role: "user", content: userVisibleText, attachedItem: pendingAttachment }
    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setAttachedItem(null)
    setIsLoading(true)

    try {
      let currentUserId = userId
      if (!currentUserId) {
        console.log("User ID not loaded yet, fetching...")
        currentUserId = sessionAuth.getUserId()
        if (!currentUserId) {
          throw new Error("User not authenticated")
        }
        setUserId(currentUserId)
      }

      console.log("Using user ID:", currentUserId)

      const requestId = crypto.randomUUID()
      void log("ai_requests", "attempt", {
        pagePath: "/app/ai-assistant",
        requestId,
        chars: messageToSend.length,
      })

      const weather = await getCurrentWeather()
      const safeWeather = {
        location: weather?.location || "Москва",
        temperature: weather?.temperature ?? 20,
        description: weather?.description || "ясно",
      }

      console.log("Sending request to /api/ai-assistant:", { promptLength: messageToSend.length, weather: safeWeather })

      // Use api.post — it auto-adds Bearer token and retries on 401 (token refresh)
      const responseData: AIPromptResponse[] = await api.post("/api/ai-assistant", {
        prompt: messageToSend,
        weather: safeWeather,
      })

      console.log("AI API parsed response:", responseData)

      if (!Array.isArray(responseData) || responseData.length === 0) {
        const errMsg = (responseData as any)?.error
        if (errMsg) {
          console.error("AI API returned error:", errMsg)
          throw new Error(errMsg)
        }
        console.error("Invalid response format - not an array or empty:", responseData)
        throw new Error("Invalid response format from AI API")
      }

      const firstResponse = responseData[0]

      void trackOnce("ai_assistant_used", { prompt_length: messageToSend.length })

      let assistantMessage: Message

      if ("type" in firstResponse && firstResponse.type === "trash") {
        assistantMessage = {
          role: "assistant",
          content:
            "Извините, но я не могу помочь с этим запросом. Попробуйте задать вопрос о стиле, моде или гардеробе! 👗✨",
        }
      } else if ("content" in firstResponse) {
        assistantMessage = { role: "assistant", content: firstResponse.content }
      } else if ("id" in firstResponse && "title" in firstResponse && "items" in firstResponse) {
        const outfitRecommendation: UserRecommendation = {
          id: firstResponse.id,
          title: firstResponse.title,
          description: firstResponse.description,
          items: firstResponse.items.map((item) => ({
            type: "clothing",
            id: Number.parseInt(item.id),
            name: item.name,
            image_url: item.image_url,
            color: item.color || "unknown",
            url: item.url || null,
            isUserItem: !!item.user_id,
          })),
        }

        assistantMessage = {
          role: "assistant",
          content: `Отличный выбор! Вот образ "${firstResponse.title}":`,
          outfit: outfitRecommendation,
        }
      } else {
        throw new Error("Unknown response format from AI API")
      }

      setMessages((prev) => [...prev, assistantMessage])
      void mirrorTurn([
        { role: "user", content: userVisibleText, attachedItem: pendingAttachment },
        { role: "assistant", content: assistantMessage.content, outfit: assistantMessage.outfit },
      ])

      const bill = await consume("ai_requests", { pagePath: "/app/ai-assistant", requestId }, 1)
      if (!bill.ok && bill.code === "payment_required") setPaywallOpen(true)
    } catch (error) {
      console.error("Error in handleSend:", error)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Произошла ошибка при обработке вашего запроса. Попробуйте еще раз! 🔄",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveOutfit = async (outfit: UserRecommendation) => {
    try {
      await api.post("/api/user-looks", {
        name: outfit.title,
        description: outfit.description,
        items: outfit.items.map((item) => ({
          type: "user",
          id: item.id,
        })),
      })

      toast({
        title: "Успешно!",
        description: `Образ "${outfit.title}" добавлен в вашу коллекцию`,
      })
    } catch (error) {
      console.error("Failed to save outfit:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить образ. Попробуйте еще раз.",
        variant: "destructive",
      })
    }
  }

  // Тот же путь примерки, что и на карточках образов в остальном приложении
  // (components/outfit-card.tsx → useTryOn → глобальный TryOnSheet) — не
  // изобретаем второй способ примерить образ.
  const handleTryOnOutfit = (outfit: UserRecommendation) => {
    startTryOn(
      {
        id: outfit.id,
        title: outfit.title,
        items: outfit.items.map((item) => ({
          id: String(item.id),
          name: item.name,
          image_url: item.image_url,
          color: item.color,
        })),
        suggested_items_count: outfit.items.length,
      },
      outfit.items.map((item) => ({
        id: String(item.id),
        name: item.name,
        image_url: item.image_url,
        color: item.color,
      })),
    )
  }

  const handleScenarioChip = (chip: ScenarioChip) => {
    if (chip.kind === "send") {
      handleSend(chip.prompt)
    } else {
      setInputValue(chip.prefill)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const handlePickWardrobeItem = (item: AttachableWardrobeItem) => {
    setAttachedItem({ id: item.id, name: item.item_name, image_url: item.image_url, color: item.color })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isEmptyChat = messages.length <= 1

  return (
    // fixed на весь вьюпорт (как экран «Идеи»): экран — самостоятельный чат,
    // не часть скролла страницы. Без этого общая закреплённая шапка (дата/погода)
    // из layout-client добавляет высоту сверх 100dvh, документ скроллится, и
    // автоскролл к последнему сообщению при монтировании уносит нашу шапку
    // чата за пределы экрана — «прыжок» ровно того, что запрещено ТЗ.
    <div className="fixed inset-0 z-[45] flex flex-col overflow-hidden bg-canvas">
      {/* Доступ к истории и новому чату БЕЗ отдельной шапки экрана: два
          плавающих круглых значка на той же высоте, что и общая пилюля
          приложения (components/top-navigation.tsx, z-50), а не полоса с
          заголовком поверх контента. Экран выглядит так же, как остальные —
          с общей пилюлей наверху, — просто по бокам от неё появляются два
          входа, которых у пилюли на других экранах нет. */}
      {/* Кнопки стоят ПОД пилюлей, а не по бокам от неё. Верхние углы в Telegram
          заняты нативными контролами: слева «Закрыть», справа ⌄ и ⋯. Пилюля по
          центру между ними проскакивает, а боковые кнопки садились ровно на них
          — с устройства это и прилетело. Ниже полосы Telegram углы наши. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex items-center justify-end gap-2 px-4"
        style={{ top: "calc(var(--tg-content-top) + var(--tg-hint-h, 0px) + 8px)" }}
      >
        <button
          onClick={() => setHistoryOpen(true)}
          aria-label="История чатов"
          className="glass pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-ink transition-transform duration-press active:scale-95"
        >
          <History className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <button
          onClick={handleNewChat}
          aria-label="Новый чат"
          className="glass pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-ink transition-transform duration-press active:scale-95"
        >
          <SquarePen className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      {/* Messages. Верхний отступ учитывает и ряд кнопок над лентой (44px
          кнопка + 8px сверху + 8px снизу), иначе первое сообщение уезжает под них. */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3 pb-56"
        style={{ paddingTop: "calc(var(--tg-content-top) + var(--tg-hint-h, 0px) + 60px)" }}
      >
        {isEmptyChat && (
          <div className="animate-fade-up pt-2 pb-1">
            <p className="mb-3 px-1 text-caption font-semibold uppercase tracking-[0.08em] text-ink-3">
              Готовые сценарии
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {SCENARIO_CHIPS.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => handleScenarioChip(chip)}
                  className="flex flex-col items-start gap-2.5 rounded-2xl border border-line bg-canvas-sunk px-3.5 py-3.5 text-left transition-transform duration-press active:scale-[0.97]"
                >
                  <chip.icon className="h-4 w-4 text-ink-3" strokeWidth={1.75} />
                  <span className="text-caption font-semibold leading-tight text-ink">{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const isUser = message.role === "user"
          return (
            <div
              key={index}
              className={cn("flex animate-fade-up", isUser ? "justify-end" : "justify-start")}
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            >
              <div className={cn("flex max-w-[85%] gap-2.5", isUser && "flex-row-reverse")}>
                <Avatar className="h-7 w-7 flex-shrink-0">
                  <AvatarFallback
                    className={cn(
                      "text-[11px] font-semibold",
                      isUser ? "bg-canvas-sunk text-ink ring-1 ring-inset ring-line" : "bg-ink text-canvas",
                    )}
                  >
                    {isUser ? "Вы" : "ИИ"}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3",
                    isUser ? "bg-ink text-canvas" : "bg-canvas-sunk text-ink",
                  )}
                >
                  {message.attachedItem && (
                    <div
                      className={cn(
                        "mb-2 flex items-center gap-2 rounded-xl border px-2 py-1.5",
                        isUser ? "border-canvas/20 bg-canvas/10" : "border-line bg-canvas",
                      )}
                    >
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-canvas-sunk">
                        {message.attachedItem.image_url && (
                          <img
                            src={message.attachedItem.image_url}
                            alt={message.attachedItem.name}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <span className={cn("truncate text-caption", isUser ? "text-canvas/80" : "text-ink-2")}>
                        {message.attachedItem.name}
                      </span>
                    </div>
                  )}
                  <p className="text-body whitespace-pre-wrap">{message.content}</p>
                  {message.outfit && (
                    <div className="mt-3 border-t border-line/60 pt-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="text-caption font-semibold text-ink">{message.outfit.title}</h4>
                      </div>
                      <p className="mb-3 text-caption text-ink-2">{message.outfit.description}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {message.outfit.items.map((item) => (
                          <div key={item.id} className="text-left">
                            <div className="relative mb-1 aspect-square overflow-hidden rounded-xl bg-canvas">
                              <img
                                src={item.image_url || "/placeholder.svg"}
                                alt={item.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.src = "/placeholder.svg?height=150&width=150"
                                }}
                              />
                              {/* Покупки из каталога: вещь не из гардероба пользователя —
                                  подписываем и (если есть) даём партнёрскую ссылку. */}
                              {!item.isUserItem && (
                                <span className="absolute left-1 top-1 rounded-md bg-ink/85 px-1.5 py-0.5 text-[10px] font-medium text-signal-ink">
                                  Купить
                                </span>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-ink-2">{item.name}</p>
                            {!item.isUserItem && item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-signal"
                              >
                                <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} />В магазин
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* Собрать образ и сохранить / отправить на примерку — оба пути
                          переиспользуют существующие механизмы (POST /api/user-looks,
                          общий useTryOn), ничего нового не изобретаем. */}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleSaveOutfit(message.outfit!)}
                          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-line text-caption font-semibold text-ink transition-transform duration-press active:scale-95"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Сохранить
                        </button>
                        <button
                          onClick={() => handleTryOnOutfit(message.outfit!)}
                          disabled={tryOnSession?.status === "loading" && tryOnSession?.suggestion?.id === message.outfit!.id}
                          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-signal text-caption font-semibold text-signal-ink transition-transform duration-press active:scale-95 disabled:opacity-60"
                        >
                          Примерить
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {isLoading && (
          <div className="flex justify-start animate-fade-up" role="status" aria-live="polite">
            <div className="flex max-w-[85%] gap-2.5">
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className="bg-ink text-canvas text-[11px] font-semibold">ИИ</AvatarFallback>
              </Avatar>
              <div className="rounded-2xl bg-canvas-sunk px-4 py-3">
                <span className="sr-only">Ассистент печатает ответ</span>
                <div className="flex w-36 flex-col gap-2">
                  <div className="skeleton h-2.5 w-full rounded-full" />
                  <div className="skeleton h-2.5 w-2/3 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area — закреплённая внизу, стеклянный хром; safe-area учтена в pb,
          позиция fixed не зависит от скролла страницы, поэтому не «прыгает» при
          появлении клавиатуры */}
      <div className="glass fixed inset-x-0 bottom-0 z-10 border-t border-line pb-24">
        <div className="max-w-7xl mx-auto">
          {/* Готовые сценарии — компактной строкой, доступны и после первого
              сообщения, не только в пустом состоянии. */}
          {!isEmptyChat && (
            <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SCENARIO_CHIPS.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => handleScenarioChip(chip)}
                  disabled={isLoading}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-3.5 py-2 text-caption font-medium text-ink-2 transition-transform duration-press active:scale-95 disabled:opacity-50"
                >
                  <chip.icon className="h-3.5 w-3.5 text-ink-3" strokeWidth={1.75} />
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* Прикреплённая вещь — видна над полем ввода, пока не отправлена. */}
          {attachedItem && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-2xl border border-line bg-canvas-sunk px-3 py-2">
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-canvas">
                {attachedItem.image_url && (
                  <img src={attachedItem.image_url} alt={attachedItem.name} className="h-full w-full object-cover" />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-caption text-ink">{attachedItem.name}</span>
              <button
                onClick={() => setAttachedItem(null)}
                aria-label="Убрать вложение"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-4 pb-4 pt-3">
            <div className="flex gap-2">
              {/* Спросить про конкретную вещь: прикрепить её из гардероба
                  или отдать фото на анализ. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Прикрепить"
                    disabled={isLoading}
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-line text-ink-2 transition-transform duration-press active:scale-95 disabled:opacity-50"
                  >
                    <Paperclip className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-56">
                  <DropdownMenuItem onClick={() => setItemPickerOpen(true)} className="gap-2">
                    <Shirt className="h-4 w-4" strokeWidth={1.75} />
                    Вещь из гардероба
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowPhotoForm(true)} className="gap-2">
                    <Camera className="h-4 w-4" strokeWidth={1.75} />
                    Фото на анализ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={attachedItem ? "Что спросить об этой вещи?" : "Опишите ваш стиль или задайте вопрос..."}
                className="flex-1 rounded-full border-line bg-canvas-sunk text-ink placeholder:text-ink-3"
                disabled={isLoading}
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || (!inputValue.trim() && !attachedItem)}
                aria-label="Отправить"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-signal text-signal-ink transition-transform duration-press active:scale-95 disabled:bg-canvas-sunk disabled:text-ink-3"
              >
                <Send className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Analysis Modal */}
      {showPhotoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-canvas p-6 animate-scale-in">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-h2 text-ink">Анализ фото</h3>
              <button
                onClick={() => setShowPhotoForm(false)}
                aria-label="Закрыть"
                className="rounded-full p-1.5 text-ink-2 transition-colors hover:bg-canvas-sunk hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PhotoAnalysisForm
              onSuccess={(payload) => {
                setShowPhotoForm(false)
                // PhotoAnalysisForm возвращает объект { items, photos,
                // analysisResults }, не строку (было спрятанной type-ошибкой
                // в исходном файле — content: result присваивал объект в
                // string). Пересказываем находки текстом для чата.
                const items = payload?.items ?? []
                const summary =
                  items.length > 0
                    ? `Нашёл на фото: ${items
                        .slice(0, 5)
                        .map((i) => i.item_name || "вещь")
                        .join(", ")}${items.length > 5 ? "…" : ""}. Загляните в гардероб, чтобы сохранить их.`
                    : "Не удалось распознать вещи на этом фото. Попробуйте другое фото, покрупнее и без лишнего фона."
                setMessages((prev) => [
                  ...prev,
                  { role: "user", content: "Проанализируй это фото одежды" },
                  { role: "assistant", content: summary },
                ])
              }}
            />
          </div>
        </div>
      )}

      {/* SubscriptionSheet */}
      <SubscriptionSheet
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onSuccess={() => setPaywallOpen(false)}
      />

      {/* История чатов */}
      <AiChatHistorySheet
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
      />

      {/* Вещь из гардероба на вопрос "с чем это носить" */}
      <AiChatItemPickerSheet
        isOpen={itemPickerOpen}
        onClose={() => setItemPickerOpen(false)}
        onPick={handlePickWardrobeItem}
      />
    </div>
  )
}
