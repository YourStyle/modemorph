"use client"

import { useState, useRef } from "react"
import { CommonSheet } from "./common-sheet"
import { Upload, Loader2, Sparkles, AlertCircle, Send } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api-client"
import { referralLink } from "@/lib/referral"
import { useFeature } from "@/hooks/use-feature"
import { SubscriptionSheet } from "@/components/subscription-sheet"

interface CheckItem {
  id: number
  name: string
  image_url: string | null
}

// «Стоит ли покупать?»: образы с новой вещью из своего гардероба и честное
// «похожее уже есть». Раньше здесь был процент CLIP-близости, который мерил
// «есть ли вещь того же типа» и хвалил дубли (замер 27.09.2026).
interface StyleCheckResult {
  is_clothing: boolean
  item: { name: string; clothing_type: string | null } | null
  duplicates: CheckItem[]
  outfits: { title: string; items: CheckItem[] }[]
  wardrobe_size: number
}

interface StyleCheckSheetProps {
  isOpen: boolean
  onClose: () => void
}

function looksWord(n: number) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return "образ"
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "образа"
  return "образов"
}

function verdict(r: StyleCheckResult): { title: string; note?: string } {
  if (!r.is_clothing) return { title: "На фото не видно вещи", note: "Попробуйте снять её крупнее или загрузить скрин из магазина." }
  if (r.wardrobe_size === 0) return { title: "Пока не с чем сравнить", note: "Добавьте несколько вещей в гардероб — и мы соберём с ней образы." }
  const n = r.outfits.length
  if (r.duplicates.length > 0) {
    return {
      title: "Похожее у вас уже есть",
      note: n > 0 ? `Если всё же брать — вот ${n} ${looksWord(n)} с ней из ваших вещей.` : undefined,
    }
  }
  if (n > 0) return { title: "Берите — она впишется", note: `Собирается ${n} ${looksWord(n)} из ваших вещей.` }
  return { title: "С вашим гардеробом почти не сочетается", note: "Под неё придётся докупать ещё вещи." }
}

function Thumb({ src, label, accent }: { src: string | null; label: string; accent?: boolean }) {
  return (
    <div className="w-20 flex-shrink-0 space-y-1">
      <div className={`aspect-square rounded-lg overflow-hidden bg-canvas-sunk ${accent ? "ring-2 ring-signal" : ""}`}>
        {src && <img src={src} alt={label} className="w-full h-full object-cover" />}
      </div>
      <p className="text-caption text-ink-2 line-clamp-2 leading-tight">{label}</p>
    </div>
  )
}

export function StyleCheckSheet({ isOpen, onClose }: StyleCheckSheetProps) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<StyleCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { log } = useFeature()
  const [paywallOpen, setPaywallOpen] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
    setResult(null)
    setError(null)
  }

  const handleCheck = async () => {
    if (!photo) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("image", photo)
      const data = await api.post("/api/style-check", formData, { headers: {} })
      setResult(data)
    } catch (e: any) {
      console.error("Style check failed:", e)
      // Лимит запросов к ИИ общий с ассистентом и списывается на сервере.
      if (/\b402\b|payment_required/.test(String(e?.message || ""))) {
        setError("Бесплатные проверки закончились")
        setPaywallOpen(true)
      } else {
        setError("Не получилось проверить вещь. Попробуйте ещё раз")
      }
    } finally {
      setLoading(false)
    }
  }

  // «Спросить подругу»: пересылка в чат Telegram со своей реферальной ссылкой —
  // тот же механизм, что «Пригласить друга» в профиле.
  const handleShare = async () => {
    if (!result?.item) return
    void log("style_check", "click", { action: "share", outfits: result.outfits.length })
    let url = "https://t.me/modemorph_ai_bot"
    try {
      const d = await api.get("/api/discounts/mine")
      if (d?.referral?.code) url = referralLink(d.referral.code)
    } catch {
      // без реферального кода делимся просто ссылкой на бота
    }
    const n = result.outfits.length
    const text = n > 0
      ? `Думаю купить: ${result.item.name}. ModeMorph собрал ${n} ${looksWord(n)} с ней из моего гардероба — брать?`
      : `Думаю купить: ${result.item.name}. Брать?`
    const tg = (window as any)?.Telegram?.WebApp
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
    } else {
      void navigator.clipboard?.writeText(`${text} ${url}`)
      toast.success("Текст скопирован")
    }
  }

  const reset = () => {
    setPhoto(null)
    setPreview(null)
    setResult(null)
    setError(null)
  }

  const v = result ? verdict(result) : null

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Стоит ли покупать?" swipeAction="close">
      <div className="pb-6 space-y-5">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {!result ? (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-line rounded-2xl p-8 text-center cursor-pointer transition-colors hover:border-ink-3"
            >
              {preview ? (
                <img src={preview} alt="Вещь" className="max-h-48 mx-auto rounded-xl object-contain" />
              ) : (
                <div className="text-ink-3">
                  <Upload className="h-10 w-10 mx-auto mb-3" />
                  <p className="text-body font-medium text-ink-2">Фото или скрин вещи из магазина</p>
                  <p className="text-caption text-ink-3 mt-1">Соберём с ней образы из вашего гардероба и скажем, нет ли у вас уже похожей</p>
                </div>
              )}
            </div>

            <button
              onClick={handleCheck}
              disabled={!photo || loading}
              className="w-full h-11 rounded-full bg-signal text-body font-semibold text-signal-ink transition-transform duration-press active:scale-[0.98] disabled:bg-canvas-sunk disabled:text-ink-3"
            >
              {loading ? (
                <span className="inline-flex items-center"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Примеряем к гардеробу...</span>
              ) : (
                <span className="inline-flex items-center"><Sparkles className="h-4 w-4 mr-2" /> Проверить</span>
              )}
            </button>

            {error && !loading && (
              <div className="flex items-center gap-2 text-caption text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {preview && <img src={preview} alt="Вещь" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />}
              <div>
                <p className="text-body font-semibold text-ink">{v?.title}</p>
                {result.item && <p className="text-caption text-ink-2">{result.item.name}</p>}
              </div>
            </div>
            {v?.note && <p className="text-caption text-ink-2 -mt-2">{v.note}</p>}

            {result.duplicates.length > 0 && (
              <div className="space-y-2">
                <p className="text-caption font-medium text-ink">Уже в гардеробе</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {result.duplicates.map((d) => <Thumb key={d.id} src={d.image_url} label={d.name} />)}
                </div>
              </div>
            )}

            {result.outfits.map((o, i) => (
              <div key={i} className="rounded-2xl bg-canvas-sunk p-3 space-y-2">
                <p className="text-caption font-medium text-ink">{o.title}</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  <Thumb src={preview} label="Новая вещь" accent />
                  {o.items.map((it) => <Thumb key={it.id} src={it.image_url} label={it.name} />)}
                </div>
              </div>
            ))}

            {result.item && (
              <button
                onClick={handleShare}
                className="w-full h-11 rounded-full bg-signal text-body font-semibold text-signal-ink inline-flex items-center justify-center transition-transform duration-press active:scale-[0.98]"
              >
                <Send className="h-4 w-4 mr-2" /> Спросить подругу
              </button>
            )}

            <button
              onClick={reset}
              className="w-full h-11 rounded-full border border-line text-body font-medium text-ink transition-transform duration-press active:scale-[0.98]"
            >
              Проверить другую вещь
            </button>
          </>
        )}
      </div>
      <SubscriptionSheet
        isOpen={paywallOpen}
        source="limit:style_check"
        onClose={() => setPaywallOpen(false)}
        onSuccess={() => setPaywallOpen(false)}
      />
    </CommonSheet>
  )
}
