"use client"

import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Code2, Plus, Trash2, Copy, CheckCircle2, Loader2, AlertTriangle, Globe } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

interface WidgetKey {
  id: number
  name: string
  key_prefix: string
  allowed_origins: string[]
  is_active: boolean
  rate_limit_per_minute: number
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

const WIDGET_HOST =
  typeof window !== "undefined" ? window.location.origin : "https://modemorph.ru"

function snippet(key: string) {
  return `<div id="modemorph-widget"></div>
<script src="${WIDGET_HOST}/widget.js"
        data-key="${key}"
        data-mount="#modemorph-widget"
        data-cart='[{"sku":"ТЕКУЩИЙ_SKU"}]'></script>`
}

export default function PartnerWidgetPage() {
  const { toast } = useToast()
  const [keys, setKeys] = useState<WidgetKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [origins, setOrigins] = useState("")
  const [created, setCreated] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<number | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = async () => {
    try {
      const data = await api.get<{ keys: WidgetKey[] }>("/api/partner/widget-keys")
      setKeys(data.keys)
    } catch {
      toast({ title: "Ошибка загрузки ключей", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const parsedOrigins = useMemo(
    () => origins.split(/[\n,]/).map((o) => o.trim()).filter(Boolean),
    [origins],
  )

  const handleCreate = async () => {
    if (!name.trim()) return
    if (parsedOrigins.length === 0) {
      toast({ title: "Укажите хотя бы один домен", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const data = await api.post<{ key: { key: string } }>("/api/partner/widget-keys", {
        name: name.trim(),
        allowed_origins: parsedOrigins,
      })
      setCreated(data.key.key)
      setName("")
      setOrigins("")
      load()
    } catch (err: any) {
      toast({ title: err.message || "Ошибка", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: number) => {
    setRevoking(id)
    try {
      await api.delete(`/api/partner/widget-keys/${id}`)
      toast({ title: "Ключ отозван" })
      load()
    } catch {
      toast({ title: "Ошибка", variant: "destructive" })
    } finally {
      setRevoking(null)
    }
  }

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Code2 className="h-6 w-6" />
            Виджет подбора образов
          </h1>
          <p className="text-gray-500 mt-1">
            Встройте подбор образов по корзине на свой сайт. Ключ привязан к вашим доменам.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-gradient-to-r from-[#EC9DE2] to-[#89AEFF] hover:opacity-90 border-0 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Создать ключ
        </Button>
      </div>

      {/* How it works / embed snippet */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как встроить</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            Вставьте сниппет в карточку товара или корзину. Подставьте артикулы (SKU) товаров
            из текущей корзины — виджет соберёт образы из вашего каталога:
          </p>
          <div className="relative">
            <pre className="bg-gray-900 rounded-xl p-4 text-xs text-green-300 overflow-x-auto whitespace-pre">
{snippet("ВАШ_КЛЮЧ")}
            </pre>
            <Button
              size="sm" variant="ghost"
              className="absolute top-2 right-2 text-gray-400 hover:text-white"
              onClick={() => copy(snippet("ВАШ_КЛЮЧ"), "snippet-template")}
            >
              {copied === "snippet-template" ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-sm text-gray-600">
            Для динамической корзины вызывайте JS-API при её изменении:
          </p>
          <pre className="bg-gray-100 rounded-xl p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre">
{`window.ModeMorph.render({
  cart: [{ sku: "ABC123" }, { sku: "DEF456" }],
  mount: "#modemorph-widget"
})`}
          </pre>
        </CardContent>
      </Card>

      {/* Keys table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Code2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>У вас пока нет виджет-ключей</p>
              <p className="text-sm">Создайте ключ и привяжите его к домену вашего магазина</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Ключ</TableHead>
                  <TableHead>Домены</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Лимит/мин</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-sm text-gray-500">{k.key_prefix}…</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {(k.allowed_origins || []).map((o) => (
                          <Badge key={o} variant="secondary" className="font-normal text-xs">
                            <Globe className="h-3 w-3 mr-1" />
                            {o.replace(/^https?:\/\//, "")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.is_active ? "default" : "secondary"}>
                        {k.is_active ? "Активен" : "Отозван"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{k.rate_limit_per_minute}/мин</TableCell>
                    <TableCell className="text-right">
                      {k.is_active && (
                        <Button
                          variant="ghost" size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRevoke(k.id)}
                          disabled={revoking === k.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) { setCreateOpen(false); setCreated(null); setName(""); setOrigins("") }
        }}
      >
        <DialogContent>
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Ключ создан
                </DialogTitle>
                <DialogDescription>Скопируйте ключ и сниппет сейчас — ключ больше не будет показан.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-800">
                    Это публичный ключ для встраивания — он виден в коде вашей страницы. Доступ ограничен
                    указанными доменами.
                  </p>
                </div>
                <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm text-green-400 break-all">
                  {created}
                </div>
                <Button variant="outline" className="w-full" onClick={() => copy(created, "key")}>
                  {copied === "key"
                    ? <><CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />Скопировано!</>
                    : <><Copy className="h-4 w-4 mr-2" />Скопировать ключ</>}
                </Button>
                <div className="relative">
                  <pre className="bg-gray-900 rounded-xl p-4 text-xs text-green-300 overflow-x-auto whitespace-pre">
{snippet(created)}
                  </pre>
                  <Button
                    size="sm" variant="ghost"
                    className="absolute top-2 right-2 text-gray-400 hover:text-white"
                    onClick={() => copy(snippet(created), "snippet")}
                  >
                    {copied === "snippet" ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setCreateOpen(false); setCreated(null) }}>Готово</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Создать виджет-ключ</DialogTitle>
                <DialogDescription>
                  Привяжите ключ к доменам, на которых будет работать виджет.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Название (например, Основной магазин)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <div>
                  <Input
                    placeholder="https://shop.example.ru, https://www.example.ru"
                    value={origins}
                    onChange={(e) => setOrigins(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Домены через запятую или с новой строки. Только точные origin (схема + хост), без пути.
                  </p>
                  {parsedOrigins.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {parsedOrigins.map((o) => (
                        <Badge key={o} variant="secondary" className="font-normal text-xs">{o}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
                <Button
                  onClick={handleCreate}
                  disabled={!name.trim() || creating}
                  className="bg-gradient-to-r from-[#EC9DE2] to-[#89AEFF] hover:opacity-90 border-0 text-white"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Создать
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
