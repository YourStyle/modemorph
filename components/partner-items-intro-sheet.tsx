"use client"

import { useState, useEffect } from "react"
import { CommonSheet } from "./common-sheet"
import { Sparkles } from "lucide-react"
import { Button } from "./ui/button"
import Image from "next/image"

const STORAGE_KEY = "partner_items_intro_seen"

interface PartnerItemsIntroSheetProps {
  /** Two sample partner item image URLs */
  sampleImages: string[]
  /** Trigger: call with true when user first sees recommendations */
  shouldShow: boolean
}

export function PartnerItemsIntroSheet({ sampleImages, shouldShow }: PartnerItemsIntroSheetProps) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!shouldShow) return
    try {
      if (localStorage.getItem(STORAGE_KEY)) return
      // Small delay so recommendations render first
      const timer = setTimeout(() => setIsOpen(true), 1500)
      return () => clearTimeout(timer)
    } catch {
      // ignore
    }
  }, [shouldShow])

  const handleClose = () => {
    setIsOpen(false)
    try { localStorage.setItem(STORAGE_KEY, "1") } catch {}
  }

  const img1 = sampleImages[0] || ""
  const img2 = sampleImages[1] || ""

  return (
    <CommonSheet
      isOpen={isOpen}
      onClose={handleClose}
      title=""
      backgroundColor="white"
      swipeAction="close"
    >
      <div className="pb-5">
        {/* Overlapping product images */}
        {(img1 || img2) && (
          <div className="relative h-28 mb-4 flex justify-center">
            {img1 && (
              <div className="absolute left-1/2 -translate-x-[70%] -rotate-6 w-24 h-24 rounded-2xl overflow-hidden shadow-lg border-2 border-white">
                <Image src={img1} alt="" fill className="object-cover" sizes="96px" />
              </div>
            )}
            {img2 && (
              <div className="absolute left-1/2 -translate-x-[30%] rotate-6 w-24 h-24 rounded-2xl overflow-hidden shadow-lg border-2 border-white">
                <Image src={img2} alt="" fill className="object-cover" sizes="96px" />
              </div>
            )}
          </div>
        )}

        {/* Badge */}
        <div className="flex justify-center mb-3">
          <span
            className="inline-flex items-center text-white text-sm px-3 py-1 rounded-full font-medium"
            style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Рекомендуем
          </span>
        </div>

        <h2 className="text-xl font-bold text-foreground tracking-tight text-center mb-2">
          Вещи от наших партнёров
        </h2>

        <div className="space-y-2 px-2">
          <p className="text-sm text-gray-600 text-center leading-relaxed">
            В подборках вы увидите вещи с пометкой <span className="inline-flex items-center text-xs font-medium text-white px-1.5 py-0.5 rounded-md" style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}>
            <Sparkles className="w-2.5 h-2.5 mr-0.5" />Рекомендуем</span> — это товары от проверенных партнёров: SELA, Lacoste, Gate31, Love Republic.
          </p>

          <p className="text-sm text-gray-600 text-center leading-relaxed">
            Мы подбираем их на основе вашего стиля и гардероба. Если вещь понравилась — можете перейти в магазин или сразу добавить её в свой гардероб.
          </p>

          <p className="text-xs text-gray-400 text-center">
            Вы также можете дать обратную связь 👍/👎 на каждый образ — мы учтём это в будущих рекомендациях.
          </p>
        </div>

        <div className="mt-4 px-2">
          <Button
            onClick={handleClose}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white h-11 rounded-2xl font-medium"
          >
            Понятно
          </Button>
        </div>
      </div>
    </CommonSheet>
  )
}
