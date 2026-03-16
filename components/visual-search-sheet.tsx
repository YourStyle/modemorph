"use client"

import { useState, useRef } from "react"
import { Camera, X, Loader2 } from "lucide-react"
import { CommonSheet } from "@/components/common-sheet"
import { api } from "@/lib/api-client"

interface SearchResult {
  id: number
  score: number
  image_url: string
  name: string
  clothing_type?: string
  color?: string
}

interface VisualSearchSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function VisualSearchSheet({ isOpen, onClose }: VisualSearchSheetProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    setPreviewUrl(null)
    setResults([])
    setError(null)
    onClose()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
    setResults([])
    setError(null)
    void runSearch(file)
  }

  async function runSearch(file: File) {
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("image", file)
      const data = await api.post<{ results: SearchResult[] }>("/api/clip/search", formData, {
        headers: {},
      })
      setResults(data.results || [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ошибка поиска"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={handleClose} title="Визуальный поиск">
      <div className="flex flex-col gap-4 px-4 pb-6">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {!previewUrl && (
          <button
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/20 py-10 text-white/50 active:opacity-70"
            onClick={() => fileRef.current?.click()}
          >
            <Camera size={40} />
            <span className="text-sm">Загрузите фото вещи</span>
          </button>
        )}

        {previewUrl && (
          <div className="relative">
            <img src={previewUrl} alt="preview" className="w-full rounded-2xl object-cover max-h-64" />
            <button
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1"
              onClick={() => {
                setPreviewUrl(null)
                setResults([])
                setError(null)
              }}
            >
              <X size={16} className="text-white" />
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-white/60">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Ищем похожее...</span>
          </div>
        )}

        {error && (
          <p className="text-center text-sm text-red-400">{error}</p>
        )}

        {results.length > 0 && (
          <div>
            <p className="mb-3 text-sm text-white/60">Найдено: {results.length}</p>
            <div className="grid grid-cols-3 gap-2">
              {results.map((item) => (
                <div key={item.id} className="flex flex-col gap-1">
                  <div className="aspect-square overflow-hidden rounded-xl bg-white/5">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-white/10" />
                    )}
                  </div>
                  {item.name && (
                    <p className="truncate text-xs text-white/70">{item.name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && previewUrl && results.length === 0 && !error && (
          <p className="text-center text-sm text-white/40">Ничего не найдено</p>
        )}

        {previewUrl && !loading && (
          <button
            className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm text-white active:opacity-70"
            onClick={() => fileRef.current?.click()}
          >
            <Camera size={16} />
            Загрузить другое фото
          </button>
        )}
      </div>
    </CommonSheet>
  )
}
