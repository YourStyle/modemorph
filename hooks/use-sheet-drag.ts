"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Сколько пикселей вниз нужно пройти, прежде чем шторка поедет за пальцем. */
const ACTIVATE_PX = 8
/** Порог, после которого отпускание закрывает шторку. */
const DISMISS_PX = 100

interface Options {
  isOpen: boolean
  onDismiss: () => void
  /**
   * Скроллер тела шторки. Если он на самом верху (scrollTop <= 0), тянуть
   * можно и за контент — так ведёт себя любая нативная нижняя шторка.
   */
  scrollRef?: React.RefObject<HTMLElement | null>
}

/**
 * Жест «утянуть шторку вниз».
 *
 * Что было не так:
 *
 * 1. Тянуть можно было ТОЛЬКО за шапку (.sheet-drag-zone). Без заголовка это
 *    полоса высотой 28px. Человек тянет вниз от верха содержимого — попадает
 *    мимо, и кажется, что «шторка не поняла, что её тащат». Теперь старт
 *    засчитывается ещё и когда тело прокручено в самый верх.
 *
 * 2. Не было буфера: shторка ехала за первым же пикселем движения. Любое
 *    дрожание пальца при обычном скролле дёргало её. Теперь она стоит на
 *    месте, пока палец не пройдёт ACTIVATE_PX вниз, и жест отменяется
 *    насовсем, если человек первым делом повёл вверх или вбок — это скролл,
 *    а не закрытие.
 *
 * preventDefault сознательно не зовём: React вешает touchmove пассивно, и он
 * там не сработает. Конфликта нет и без него — жест с контента стартует
 * только при scrollTop <= 0, где прокручивать вниз всё равно нечего.
 */
export function useSheetDrag({ isOpen, onDismiss, scrollRef }: Options) {
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const startRef = useRef<{ x: number; y: number } | null>(null)
  const activeRef = useRef(false)
  const cancelledRef = useRef(false)

  const reset = useCallback(() => {
    startRef.current = null
    activeRef.current = false
    cancelledRef.current = false
    setIsDragging(false)
    setDragY(0)
  }, [])

  useEffect(() => {
    if (!isOpen) reset()
  }, [isOpen, reset])

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const target = e.target as HTMLElement
      // Кнопки в шапке тянуть не должны — иначе «свернуть» превращается в драг.
      if (target.closest("button, a, input, textarea, select")) return

      const fromHandle = !!target.closest(".sheet-drag-zone")
      const scroller = scrollRef?.current
      const fromContentTop = !fromHandle && !!scroller && scroller.scrollTop <= 0

      if (!fromHandle && !fromContentTop) return

      const t = e.touches[0]
      startRef.current = { x: t.clientX, y: t.clientY }
      activeRef.current = false
      cancelledRef.current = false
    },
    [scrollRef],
  )

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const start = startRef.current
    if (!start || cancelledRef.current) return

    const t = e.touches[0]
    const dy = t.clientY - start.y
    const dx = t.clientX - start.x

    if (!activeRef.current) {
      // Ещё не решили, что это за жест.
      if (dy <= -ACTIVATE_PX || Math.abs(dx) > Math.abs(dy)) {
        // Повели вверх или вбок — это скролл/свайп, шторку не трогаем до
        // конца касания.
        cancelledRef.current = true
        return
      }
      if (dy < ACTIVATE_PX) return
      activeRef.current = true
      setIsDragging(true)
    }

    if (dy > 0) setDragY(dy - ACTIVATE_PX)
  }, [])

  const onTouchEnd = useCallback(() => {
    const shouldDismiss = activeRef.current && dragY > DISMISS_PX
    reset()
    if (shouldDismiss) onDismiss()
  }, [dragY, onDismiss, reset])

  return {
    dragY,
    isDragging,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: reset,
    },
  }
}
