"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X, Share2, Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { shareBlob } from "@/lib/save-image"

/**
 * Full-screen preview of a watermarked image. The user long-presses the image
 * to save it to Photos — the only path that reliably works inside the Telegram
 * webview, where downloads are blocked. A native Share button is offered too
 * for platforms that support it.
 */
export function SaveImageSheet({
  open,
  onClose,
  render,
  fileName = "modemorph.png",
  title,
}: {
  open: boolean
  onClose: () => void
  /** Produces the watermarked PNG. Called fresh each time the sheet opens. */
  render: () => Promise<Blob>
  fileName?: string
  title?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let objectUrl: string | null = null
    let cancelled = false
    setLoading(true)
    setUrl(null)
    render()
      .then((b) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(b)
        setBlob(b)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (cancelled) return
        toast.error("Не удалось подготовить изображение")
        onClose()
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || typeof document === "undefined") return null

  const handleShare = async () => {
    if (!blob) return
    const ok = await shareBlob(blob, fileName, title)
    if (!ok) toast("Зажмите фото и выберите «Сохранить в фото»")
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center justify-between p-4 text-white/90">
        <span className="text-sm font-medium">Сохранить изображение</span>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10" aria-label="Закрыть">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {loading || !url ? (
          <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
        ) : (
          <img
            src={url}
            alt="ModeMorph"
            className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl select-none"
            style={{ WebkitTouchCallout: "default" } as React.CSSProperties}
          />
        )}
      </div>

      <div className="p-5 pb-8 space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-xs text-white/70 flex items-center justify-center gap-1.5">
          <Download className="w-3.5 h-3.5" />
          Зажмите фото, чтобы сохранить в галерею
        </p>
        <button
          onClick={handleShare}
          disabled={!blob}
          className="w-full h-12 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
        >
          <Share2 className="w-4 h-4" />
          Поделиться
        </button>
      </div>
    </div>,
    document.body,
  )
}
