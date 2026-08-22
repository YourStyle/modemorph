"use client"

/**
 * Пайплайн брендов — то, что раньше жило в «Бренды_mode morph.xlsx».
 *
 * Смысл переезда не в том, что таблица стала красивее. Колонку «Показатели»
 * аналитик заполняла руками и по большинству брендов заполнить не могла:
 * числа лежат в каталоге и в логах выдачи. Здесь они подтягиваются сами.
 *
 * Показы и клики намеренно даны штуками, без процентов. За всю историю продукта
 * подтверждённых показов 422, кликов 18 — на таких числах доля не считается,
 * а нарисованный процент выглядел бы как знание, которого нет.
 */

import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Building2, Loader2, Plus, Save, Trash2, X } from "lucide-react"

const EM_DASH = "—"

interface Stats {
  items: number
  distinct_products: number
  served: number
  impressions: number
  clicks: number
}

interface Lead {
  id: number
  name: string
  segment: string | null
  styles: string | null
  contact: string | null
  phone: string | null
  contact_person: string | null
  status: string
  last_touch_at: string | null
  offer_type: string | null
  notes: string | null
  test_start: string | null
  test_end: string | null
  test_status: string | null
  test_notes: string | null
  catalog_brand: string | null
  updated_at: string | null
  stats: Stats | null
}

const STATUSES = ["Не начинали", "Написали", "Жду ответ", "Переговоры", "Тест", "Подключён", "Отказались"]
const SEGMENTS = ["Масс-маркет", "Средний", "Премиум"]
const OFFERS = ["Собрать комплект", "Virtual try-on", "Размещение в каталоге"]

const FIELDS: Array<{ key: keyof Lead; label: string; options?: string[]; type?: string }> = [
  { key: "name", label: "Название бренда" },
  { key: "segment", label: "Сегмент", options: SEGMENTS },
  { key: "styles", label: "Стиль" },
  { key: "contact", label: "Почта / соцсеть" },
  { key: "phone", label: "Телефон" },
  { key: "contact_person", label: "Контактное лицо" },
  { key: "status", label: "Статус", options: STATUSES },
  { key: "last_touch_at", label: "Крайнее касание", type: "date" },
  { key: "offer_type", label: "Тип оффера", options: OFFERS },
  { key: "notes", label: "Комментарии" },
  { key: "test_start", label: "Начало теста", type: "date" },
  { key: "test_end", label: "Конец теста", type: "date" },
  { key: "test_status", label: "Статус теста" },
  { key: "test_notes", label: "Комментарии по тесту" },
  { key: "catalog_brand", label: "Бренд в каталоге" },
]

export default function BrandsPage() {
  const { toast } = useToast()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Lead> | null>(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState("")

  const load = async () => {
    try {
      const data = await api.get<{ leads: Lead[] }>("/api/admin/brand-leads")
      setLeads(data.leads || [])
    } catch {
      toast({ title: "Не удалось загрузить список", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast({ title: "Название бренда обязательно", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const body = Object.fromEntries(FIELDS.map((f) => [f.key, editing[f.key] ?? null]))
      if (editing.id) await api.patch(`/api/admin/brand-leads/${editing.id}`, body)
      else await api.post("/api/admin/brand-leads", body)
      setEditing(null)
      await load()
      toast({ title: editing.id ? "Сохранено" : "Бренд добавлен" })
    } catch (e) {
      toast({
        title: e instanceof Error && e.message.includes("409") ? "Такой бренд уже есть" : "Не удалось сохранить",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (lead: Lead) => {
    if (!confirm(`Удалить «${lead.name}» из пайплайна?`)) return
    try {
      await api.delete(`/api/admin/brand-leads/${lead.id}`)
      await load()
      toast({ title: "Удалён" })
    } catch {
      toast({ title: "Не удалось удалить", variant: "destructive" })
    }
  }

  const shown = leads.filter((l) =>
    !query || [l.name, l.segment, l.styles, l.status, l.contact]
      .some((v) => v?.toLowerCase().includes(query.toLowerCase())))

  const inCatalog = leads.filter((l) => l.stats).length

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ink-3" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Бренды
          </h1>
          <p className="text-ink-2 mt-1">
            {leads.length} в пайплайне, {inCatalog} уже в каталоге
          </p>
        </div>
        <Button onClick={() => setEditing({ status: "Не начинали" })}>
          <Plus className="h-4 w-4 mr-2" />
          Добавить
        </Button>
      </div>

      <Input
        placeholder="Поиск по названию, сегменту, стилю, статусу"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      {editing && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {editing.id ? `Правка: ${editing.name}` : "Новый бренд"}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="text-sm text-ink-2 mb-1 block">{f.label}</label>
                {f.options ? (
                  <select
                    className="h-12 w-full rounded-full border border-transparent bg-canvas-sunk px-4 text-[15px] text-ink"
                    value={(editing[f.key] as string) ?? ""}
                    onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                  >
                    <option value="">{EM_DASH}</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <Input
                    type={f.type ?? "text"}
                    value={(editing[f.key] as string) ?? ""}
                    onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                  />
                )}
                {f.key === "catalog_brand" && (
                  <p className="text-xs text-ink-3 mt-1">
                    Как бренд называется в каталоге — по нему подтянутся показатели.
                  </p>
                )}
              </div>
            ))}
            <div className="md:col-span-3">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Сохранить
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Пайплайн</CardTitle>
          <CardDescription>
            Показатели считаются по каталогу и логам выдачи. «Выдано» — сколько раз
            рекомендатель доставал вещи бренда; это не показы человеку и делить на
            них ничего нельзя. Показы и клики — подтверждённые, штуками.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Бренд</TableHead>
                <TableHead>Сегмент</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Касание</TableHead>
                <TableHead>Оффер</TableHead>
                <TableHead className="text-right">Товаров</TableHead>
                <TableHead className="text-right">Выдано</TableHead>
                <TableHead className="text-right">Показов</TableHead>
                <TableHead className="text-right">Кликов</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((l) => (
                <TableRow
                  key={l.id}
                  className="cursor-pointer hover:bg-canvas-sunk"
                  onClick={() => setEditing(l)}
                >
                  <TableCell className="font-medium text-ink">
                    {l.name}
                    {l.contact && <div className="text-xs text-ink-3">{l.contact}</div>}
                  </TableCell>
                  <TableCell className="text-ink-2">{l.segment || EM_DASH}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "Отказались" ? "destructive" : "outline"}>
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-ink-2">{l.last_touch_at || EM_DASH}</TableCell>
                  <TableCell className="text-ink-2">{l.offer_type || EM_DASH}</TableCell>
                  {l.stats ? (
                    <>
                      <TableCell className="text-right text-ink">{l.stats.items}</TableCell>
                      <TableCell className="text-right text-ink-2">{l.stats.served}</TableCell>
                      <TableCell className="text-right text-ink-2">{l.stats.impressions}</TableCell>
                      <TableCell className="text-right text-ink-2">{l.stats.clicks}</TableCell>
                    </>
                  ) : (
                    // Не ноль, а прочерк: «нет в каталоге» и «есть, но никто не
                    // смотрел» — разные утверждения, и путать их нельзя.
                    <TableCell colSpan={4} className="text-right text-ink-3">
                      нет в каталоге
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); remove(l) }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-ink-2 py-10">
                    Ничего не найдено
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
