"use client"

import { useState, useRef } from "react"
import { CommonSheet } from "./common-sheet"
import { Upload, Loader2, Sparkles, AlertCircle } from "lucide-react"
import { api } from "@/lib/api-client"
import { STYLE_LABELS, CLOTHING_TYPE_LABELS } from "@/lib/labels"

interface StyleCheckResult {
  score: number | null
  item_style: string
  item_color: string
  item_type: string
  user_style: string
  style_match: boolean
  similar_items: number
  verdict: string
}

interface StyleCheckSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function StyleCheckSheet({ isOpen, onClose }: StyleCheckSheetProps) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<StyleCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
      setError("Не получилось проверить вещь. Попробуйте ещё раз")
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setPhoto(null)
    setPreview(null)
    setResult(null)
    setError(null)
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Подойдёт ли вещь?" swipeAction="close">
      <div className="pb-6 space-y-5">
        {/* Upload area */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {!result ? (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-line rounded-2xl p-8 text-center cursor-pointer transition-colors hover:border-ink-3"
            >
              {preview ? (
                <img src={preview} alt="Item" className="max-h-48 mx-auto rounded-xl object-contain" />
              ) : (
                <div className="text-ink-3">
                  <Upload className="h-10 w-10 mx-auto mb-3" />
                  <p className="text-body font-medium text-ink-2">Загрузите фото вещи</p>
                  <p className="text-caption text-ink-3 mt-1">Мы проверим, подходит ли она вашему стилю</p>
                </div>
              )}
            </div>

            <button
              onClick={handleCheck}
              disabled={!photo || loading}
              className="w-full h-11 rounded-full bg-signal text-body font-semibold text-signal-ink transition-transform duration-press active:scale-[0.98] disabled:bg-canvas-sunk disabled:text-ink-3"
            >
              {loading ? (
                <span className="inline-flex items-center"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Анализируем...</span>
              ) : (
                <span className="inline-flex items-center"><Sparkles className="h-4 w-4 mr-2" /> Проверить совместимость</span>
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
            {/* Score circle — единственный акцент (--signal), без градиента и без палитры "светофор".
                score приходит null, когда сравнивать не с чем: гардероб пуст или
                вещам ещё не проставили эмбеддинги. Тогда кольца нет вовсе —
                рисовать 0% значило бы выдать «нечего сравнить» за «не подходит». */}
            <div className="flex flex-col items-center">
              {result.score !== null && (
                <div className="relative w-28 h-28 mb-3">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--canvas-sunk))" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      stroke="hsl(var(--signal))" strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${(result.score / 100) * 314} 314`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-h2 text-ink">{result.score}%</span>
                  </div>
                </div>
              )}
              <p className="text-body font-semibold text-ink">{result.verdict}</p>
            </div>

            {/* Details */}
            <div className="bg-canvas-sunk rounded-2xl p-4 space-y-3">
              <div className="flex justify-between text-caption">
                <span className="text-ink-2">Тип вещи</span>
                <span className="font-medium text-ink">{CLOTHING_TYPE_LABELS[result.item_type] || result.item_type}</span>
              </div>
              <div className="flex justify-between text-caption">
                <span className="text-ink-2">Стиль вещи</span>
                <span className="font-medium text-ink">{STYLE_LABELS[result.item_style] || result.item_style}</span>
              </div>
              <div className="flex justify-between text-caption">
                <span className="text-ink-2">Ваш стиль</span>
                <span className="font-medium text-ink">{STYLE_LABELS[result.user_style] || result.user_style}</span>
              </div>
              <div className="flex justify-between text-caption">
                <span className="text-ink-2">Совпадение стиля</span>
                <span className="font-medium text-ink">
                  {result.style_match ? "Да" : "Новый стиль"}
                </span>
              </div>
              {result.similar_items > 0 && (
                <div className="flex justify-between text-caption">
                  <span className="text-ink-2">Похожих вещей</span>
                  <span className="font-medium text-ink">{result.similar_items} в гардеробе</span>
                </div>
              )}
            </div>

            {/* Preview */}
            {preview && (
              <div className="flex justify-center">
                <img src={preview} alt="Item" className="max-h-32 rounded-xl object-contain" />
              </div>
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
    </CommonSheet>
  )
}
