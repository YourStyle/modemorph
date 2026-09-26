"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { MoreVertical, Share, SquarePlus, X } from "lucide-react"
import { CommonSheet } from "@/components/common-sheet"
import { Button } from "@/components/ui/button"
import { canPromptInstall, inTelegram, isIOS, isStandalone, onPwaChange, promptInstall } from "@/lib/pwa"

const DISMISS_KEY = "pwa_banner_dismissed_at"
const DISMISS_DAYS = 14

export function isMobileBrowser(): boolean {
  return isIOS() || /android/i.test(navigator.userAgent)
}

// Плашка «Установить на телефон» сверху страницы: только мобильный браузер —
// не Telegram, не уже установленное приложение, не админка. Стоит в потоке,
// а не fixed: шапка вне Telegram sticky и сама встаёт под неё.
// Крестик прячет на DISMISS_DAYS; из профиля (Уведомления) шторка доступна всегда.
export function InstallBanner() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    let dismissed = 0
    try {
      dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0)
    } catch {}
    const fresh = Date.now() - dismissed < DISMISS_DAYS * 86400e3
    setShow(!inTelegram() && !isStandalone() && isMobileBrowser() && !fresh)
  }, [])

  if (!show || pathname?.startsWith("/admin") || pathname?.startsWith("/partner")) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {}
    setShow(false)
  }

  return (
    <>
      <div className="flex items-center gap-3 bg-ink px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-canvas">
        <img src="/icon-192.png" alt="" className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-white/20" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-caption font-semibold">ModeMorph на телефон</div>
          <div className="truncate text-micro opacity-70">Без браузера</div>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="shrink-0 rounded-full bg-canvas px-3 py-1.5 text-caption font-medium text-ink transition-transform duration-press active:scale-[.97]"
        >
          Установить
        </button>
        <button type="button" onClick={dismiss} aria-label="Скрыть" className="shrink-0 p-1 opacity-60">
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
      <InstallSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}

export function InstallSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [, rerender] = useState(0)
  useEffect(() => onPwaChange(() => rerender((n) => n + 1)), [])
  const ios = typeof navigator !== "undefined" && isIOS()

  const steps: React.ReactNode[] = ios
    ? [
        <>
          Нажмите <Share className="inline h-4 w-4 -mt-1" strokeWidth={1.75} /> «Поделиться» — внизу экрана в Safari,
          в Chrome — в адресной строке
        </>,
        <>
          Пролистайте вниз и выберите <SquarePlus className="inline h-4 w-4 -mt-1" strokeWidth={1.75} /> «На экран
          „Домой“»
        </>,
        <>Нажмите «Добавить» — иконка ModeMorph появится рядом с остальными приложениями</>,
      ]
    : [
        <>
          Откройте меню браузера <MoreVertical className="inline h-4 w-4 -mt-1" strokeWidth={1.75} /> — справа вверху
        </>,
        <>Выберите «Установить приложение» или «Добавить на главный экран»</>,
        <>Подтвердите — иконка ModeMorph появится на рабочем столе</>,
      ]

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Установить ModeMorph">
      <div className="space-y-5 pb-6">
        {!ios && canPromptInstall() && (
          <Button
            className="w-full"
            onClick={async () => {
              if (await promptInstall()) onClose()
            }}
          >
            Установить в один тап
          </Button>
        )}
        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas-sunk text-caption font-semibold text-ink">
                {i + 1}
              </span>
              <span className="pt-0.5 text-body text-ink">{s}</span>
            </li>
          ))}
        </ol>
        <p className="text-caption text-ink-2">
          {ios
            ? "Если сайт открыт внутри Instagram, Telegram или другого приложения — сначала откройте его в Safari: «…» → «Открыть в браузере»."
            : "После установки в профиле можно включить уведомления на это устройство."}
        </p>
      </div>
    </CommonSheet>
  )
}
