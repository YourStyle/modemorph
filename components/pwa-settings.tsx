"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ArrowRight } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { InstallSheet, isMobileBrowser } from "@/components/install-banner"
import { disablePush, enablePush, isIOS, isStandalone, onPwaChange, pushSubscribed, pushSupported } from "@/lib/pwa"

// Вкладка «Уведомления» в веб-версии: установка на экран «Домой» и веб-пуши
// на это устройство. В Telegram не рендерится — там канал бот.
export function PwaSettings() {
  const [, rerender] = useState(0)
  const [pushOn, setPushOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)

  useEffect(() => {
    void pushSubscribed().then(setPushOn)
    return onPwaChange(() => rerender((n) => n + 1))
  }, [])

  const standalone = isStandalone()
  const ios = isIOS()
  // iOS отдаёт PushManager только установленному приложению (16.4+).
  const pushAvailable = pushSupported() && (!ios || standalone)

  const togglePush = async (on: boolean) => {
    setBusy(true)
    try {
      if (on) await enablePush()
      else await disablePush()
      setPushOn(on)
      toast.success(on ? "Уведомления на это устройство включены" : "Уведомления на это устройство выключены")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось включить уведомления")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 border-t border-line pt-4">
      {!standalone && isMobileBrowser() && (
        <button
          type="button"
          onClick={() => setInstallOpen(true)}
          className="flex w-full items-center justify-between py-2 text-left"
        >
          <div className="space-y-1">
            <span className="text-body text-ink">Установить на телефон</span>
            <p className="text-caption text-ink-2">
              {ios ? "После установки здесь появятся уведомления" : "Иконка на рабочем столе, без браузера"}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-ink-3" />
        </button>
      )}
      <InstallSheet isOpen={installOpen} onClose={() => setInstallOpen(false)} />

      {pushAvailable && (
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-ink text-body">Уведомления на это устройство</Label>
            <p className="text-caption text-ink-2">Напоминания и новости приходят как push</p>
          </div>
          <Switch checked={pushOn} onCheckedChange={togglePush} disabled={busy} />
        </div>
      )}
    </div>
  )
}
