"use client"

import { useEffect, useState, useRef } from "react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FileUp, Upload, Loader2, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

interface Feed {
  id: number
  file_name: string
  status: string
  items_total: number
  items_imported: number
  items_skipped: number
  error_log: string | null
  created_at: string
  completed_at: string | null
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending: { label: "Ожидает", variant: "outline", icon: Clock },
  processing: { label: "Обработка...", variant: "secondary", icon: RefreshCw },
  completed: { label: "Готово", variant: "default", icon: CheckCircle2 },
  failed: { label: "Ошибка", variant: "destructive", icon: XCircle },
}

export default function PartnerFeedsPage() {
  const { toast } = useToast()
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFeeds = async () => {
    try {
      const data = await api.get<{ feeds: Feed[] }>("/api/partner/feeds")
      setFeeds(data.feeds)
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadFeeds()
    // Poll for status updates while any feed is processing
    const interval = setInterval(() => {
      loadFeeds()
    }, 10_000)
    return () => clearInterval(interval)
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("feed_file", file)

      await api.post("/api/partner/feeds", formData, {
        headers: {}, // Let browser set Content-Type with boundary
      })

      toast({ title: "Фид загружен", description: "Обработка начнётся автоматически" })
      loadFeeds()
    } catch (err: any) {
      toast({
        title: "Ошибка загрузки",
        description: err.message || "Не удалось загрузить файл",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const hasProcessing = feeds.some((f) => f.status === "pending" || f.status === "processing")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileUp className="h-6 w-6" />
            XML фиды
          </h1>
          <p className="text-gray-500 mt-1">Загрузите каталог товаров в формате YML</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.yml"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Загрузить фид
          </Button>
        </div>
      </div>

      {/* Info card */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-medium text-gray-900 mb-2">Формат фида</h3>
          <p className="text-sm text-gray-500 mb-3">
            Поддерживается формат Yandex Market Language (YML). Фид должен содержать элементы{" "}
            <code className="bg-gray-100 px-1 rounded">offer</code> с категориями, названиями, изображениями и ценами.
          </p>
          <div className="flex gap-4 text-sm">
            <div className="text-gray-500">Макс. размер: <span className="font-medium text-gray-900">50 МБ</span></div>
            <div className="text-gray-500">Формат: <span className="font-medium text-gray-900">XML/YML</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Feeds table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : feeds.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileUp className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Нет загруженных фидов</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Файл</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Импортировано</TableHead>
                  <TableHead>Пропущено</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeds.map((feed) => {
                  const cfg = STATUS_CONFIG[feed.status] || STATUS_CONFIG.pending
                  const Icon = cfg.icon
                  return (
                    <TableRow key={feed.id}>
                      <TableCell className="font-medium">{feed.file_name}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant} className="gap-1">
                          <Icon className={`h-3 w-3 ${feed.status === "processing" ? "animate-spin" : ""}`} />
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {feed.status === "completed" ? feed.items_imported : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {feed.status === "completed" ? feed.items_skipped : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {format(new Date(feed.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}
                      </TableCell>
                      <TableCell>
                        <Link href={`/partner/feeds/${feed.id}`}>
                          <Button variant="ghost" size="sm">Детали</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {hasProcessing && (
        <p className="text-sm text-gray-500 text-center">
          <RefreshCw className="h-3.5 w-3.5 inline mr-1 animate-spin" />
          Статус обновляется автоматически
        </p>
      )}
    </div>
  )
}
