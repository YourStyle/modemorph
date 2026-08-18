"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetPortal } from "@/components/ui/sheet"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

interface CommonSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /**
   * @deprecated НЕ РАБОТАЕТ. Шит всегда рисуется на светлом холсте.
   * Проп остался ради 13 существующих вызовов; пять из них передают "dark"
   * и ничего этим не добиваются. Именно из-за него три шита
   * (create-look, add-collection, visual-search) верстались под тёмный фон
   * и показывали белый текст по светлому — то есть невидимый.
   * Содержимое любого шита обязано быть светлым: text-ink / text-ink-2.
   * Не добавляйте новых вызовов с этим пропом, его нужно вычистить целиком.
   */
  backgroundColor?: "white" | "dark"
  onMinimize?: () => void
  /** Поведение при свайпе вниз: 'close' (по умолчанию) или 'minimize' */
  swipeAction?: 'close' | 'minimize'
}

export function CommonSheet({
  isOpen,
  onClose,
  title,
  children,
  backgroundColor = "white",
  onMinimize,
  swipeAction = 'close'
}: CommonSheetProps) {
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef<number>(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    // Начинаем отслеживать только если касание на drag handle
    const target = e.target as HTMLElement
    if (!target.closest('.drag-handle')) return

    startYRef.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return

    const currentY = e.touches[0].clientY
    const deltaY = currentY - startYRef.current

    // Позволяем свайпить только вниз
    if (deltaY > 0) {
      setDragY(deltaY)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)

    // Если протащили больше 100px - выполняем действие
    if (dragY > 100) {
      if (swipeAction === 'minimize' && onMinimize) {
        onMinimize()
      } else {
        onClose()
      }
    }

    // Сбрасываем позицию
    setDragY(0)
  }

  // Сбрасываем dragY при закрытии шторки
  useEffect(() => {
    if (!isOpen) {
      setDragY(0)
      setIsDragging(false)
    }
  }, [isOpen])

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetPortal>
        {/* Dark overlay like in subscription sheet */}
        <SheetPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <SheetPrimitive.Content
          ref={contentRef}
          className={cn(
            "fixed z-50 inset-x-0 bottom-0 h-[80vh] rounded-t-[28px] border-0 p-0 bg-background",
            "flex flex-col",
            "transition-all duration-300 overflow-hidden",
            // Тени сверху нет намеренно: у неё был отрицательный Y
            // (0 -4px 24px), то есть она рисовалась НАД верхней кромкой шита и
            // читалась как лишняя полоса над ним. Шит и так отделён от фона
            // затемнением подложки и скруглением.
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          )}
          style={{
            transform: `translateY(${dragY}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          // Раньше здесь стоял голый preventDefault: тап по затемнению не
          // закрывал шит вообще. Вместе с неработающим крестиком закрыть его
          // можно было только свайпом за ручку. Теперь первая же попытка
          // закрыть — тап вне шита — действительно закрывает, а для шитов с
          // долгой операцией (примерка, анализ) сворачивает в виджет.
          onInteractOutside={(e) => {
            e.preventDefault()
            if (swipeAction === "minimize" && onMinimize) onMinimize()
            else onClose()
          }}
        >
        {/* Стеклянная шапка шита (test/gauntlet/design/LIQUID_GLASS.md, уровень 1) — только
            ручка и заголовок. Тело ниже остаётся плотным холстом, там блюрить нечего. */}
        <div className="glass-flat relative shrink-0 will-change-transform">
          {/* Drag handle */}
          <div className="drag-handle flex justify-center py-3 cursor-grab active:cursor-grabbing">
            <div className="w-10 h-1 rounded-full bg-foreground/15" />
          </div>

          {/* Кнопка сворачивания (если передана) */}
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="absolute top-4 right-16 p-2 rounded-full transition-all duration-200 z-10 text-foreground/60 hover:bg-secondary hover:text-foreground active:scale-95"
              aria-label="Свернуть в виджет"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          )}

          {/* Крестика нет: на устройстве тап по нему не срабатывал, а закрытие
              и так есть двумя привычными способами — свайп вниз за ручку и тап
              по затемнению вне шита (см. onInteractOutside выше). Лишний
              элемент в шапке, который не работает, хуже его отсутствия. */}

          {title && (
            <SheetHeader className="px-4 pb-4">
              <SheetTitle className="text-left text-foreground text-2xl font-semibold tracking-tight">
                {title}
              </SheetTitle>
            </SheetHeader>
          )}
        </div>

        {/* Scroll container — flex-1 (not h-full) so it only claims the
            space left over after the header's own flow height, instead of
            stacking a second 100%-of-parent box below it and overflowing
            the sheet. min-h-0 is required: without it a flex child refuses
            to shrink below its content size and the scroll breaks. Bottom
            padding adds env(safe-area-inset-bottom) on top of the visual
            pb-6 so content isn't hidden behind the iPhone home indicator. */}
        <div
          className={cn(
            "flex-1 min-h-0 overflow-x-hidden px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] overflow-y-auto bg-background text-foreground",
            !title && "pt-4"
          )}
        >
          {children}
        </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  )
}
