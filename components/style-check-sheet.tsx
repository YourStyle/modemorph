"use client"

import { useState, useRef } from "react"
import { CommonSheet } from "./common-sheet"
import { Button } from "./ui/button"
import { Upload, Loader2, CheckCircle2, Sparkles, TrendingUp } from "lucide-react"
import { api } from "@/lib/api-client"
import { STYLE_LABELS, CLOTHING_TYPE_LABELS } from "@/lib/labels"

interface StyleCheckResult {
  score: number
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
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
    setResult(null)
  }

  const handleCheck = async () => {
    if (!photo) return
    setLoading(true)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append("image", photo)
      const data = await api.post("/api/style-check", formData, { headers: {} })
      setResult(data)
    } catch (e: any) {
      console.error("Style check failed:", e)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setPhoto(null)
    setPreview(null)
    setResult(null)
  }

  const scoreColor = result
    ? result.score >= 80 ? "text-emerald-600" : result.score >= 60 ? "text-blue-600" : result.score >= 40 ? "text-amber-600" : "text-gray-500"
    : ""

  const scoreGradient = result
    ? result.score >= 80 ? "from-emerald-400 to-emerald-600" : result.score >= 60 ? "from-blue-400 to-blue-600" : result.score >= 40 ? "from-amber-400 to-amber-600" : "from-gray-400 to-gray-500"
    : ""

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Подойдёт ли вещь?" backgroundColor="white" swipeAction="close">
      <div className="pb-6 space-y-5">
        {/* Upload area */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {!result ? (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-300 transition-colors"
            >
              {preview ? (
                <img src={preview} alt="Item" className="max-h-48 mx-auto rounded-xl object-contain" />
              ) : (
                <div className="text-gray-400">
                  <Upload className="h-10 w-10 mx-auto mb-3" />
                  <p className="text-sm font-medium">Загрузите фото вещи</p>
                  <p className="text-xs text-gray-400 mt-1">Мы проверим, подходит ли она вашему стилю</p>
                </div>
              )}
            </div>

            <Button
              onClick={handleCheck}
              disabled={!photo || loading}
              className="w-full h-11 rounded-2xl text-white border-0"
              style={{ background: loading ? "#9ca3af" : "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Анализируем...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Проверить совместимость</>
              )}
            </Button>
          </>
        ) : (
          <>
            {/* Score circle */}
            <div className="flex flex-col items-center">
              <div className="relative w-28 h-28 mb-3">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#f3f4f6" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke="url(#score-grad)" strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(result.score / 100) * 314} 314`}
                  />
                  <defs>
                    <linearGradient id="score-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#EC9DE2" />
                      <stop offset="100%" stopColor="#89AEFF" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-2xl font-bold ${scoreColor}`}>{result.score}%</span>
                </div>
              </div>
              <p className="text-base font-semibold text-gray-900">{result.verdict}</p>
            </div>

            {/* Details */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Тип вещи</span>
                <span className="font-medium">{CLOTHING_TYPE_LABELS[result.item_type] || result.item_type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Стиль вещи</span>
                <span className="font-medium">{STYLE_LABELS[result.item_style] || result.item_style}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Ваш стиль</span>
                <span className="font-medium">{STYLE_LABELS[result.user_style] || result.user_style}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Совпадение стиля</span>
                <span className={`font-medium ${result.style_match ? "text-emerald-600" : "text-amber-600"}`}>
                  {result.style_match ? "Да" : "Новый стиль"}
                </span>
              </div>
              {result.similar_items > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Похожих вещей</span>
                  <span className="font-medium">{result.similar_items} в гардеробе</span>
                </div>
              )}
            </div>

            {/* Preview */}
            {preview && (
              <div className="flex justify-center">
                <img src={preview} alt="Item" className="max-h-32 rounded-xl object-contain" />
              </div>
            )}

            <Button
              onClick={reset}
              variant="outline"
              className="w-full h-11 rounded-2xl"
            >
              Проверить другую вещь
            </Button>
          </>
        )}
      </div>
    </CommonSheet>
  )
}
