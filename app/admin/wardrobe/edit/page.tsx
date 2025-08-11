"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

type WardrobeItem = {
  id: number
  item_name: string
  item_name_en?: string | null
  description?: string | null
  description_en?: string | null
  size_type?: string | null
  material?: string | null
  style?: string | null
  has_print?: boolean | null
  color?: string | null
  shade?: string | null
  has_details?: boolean | null
  url?: string | null
  image_url?: string | null
  is_basic?: boolean | null
  notes?: string | null
  clothing_type?: string | null
  is_hidden?: boolean | null
}

const CLOTHING_TYPES = [
  "верхняя",
  "нижняя",
  "платье",
  "комбинезон",
  "верхняя одежда",
  "обувь",
  "аксессуар",
  "часы",
  "головной убор",
  "спорт",
] as const

export default function WardrobeAdminEditPage() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState<Partial<WardrobeItem>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const idParam = searchParams.get("id")
    if (idParam) {
      setSelectedId(Number.parseInt(idParam))
    }
  }, [searchParams])

  useEffect(() => {
    void loadItems()
  }, [])

  useEffect(() => {
    if (selectedId != null) {
      const it = items.find((i) => i.id === selectedId)
      if (it) {
        setForm({
          item_name: it.item_name,
          item_name_en: it.item_name_en ?? "",
          description: it.description ?? "",
          description_en: it.description_en ?? "",
          size_type: it.size_type ?? "",
          material: it.material ?? "",
          style: it.style ?? "",
          has_print: !!it.has_print,
          color: it.color ?? "",
          shade: it.shade ?? "",
          has_details: !!it.has_details,
          url: it.url ?? "",
          image_url: it.image_url ?? "",
          is_basic: !!it.is_basic,
          notes: it.notes ?? "",
          clothing_type: it.clothing_type ?? "",
          is_hidden: !!it.is_hidden,
        })
      }
    } else {
      setForm({})
    }
  }, [selectedId, items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.item_name?.toLowerCase().includes(q) ||
        i.color?.toLowerCase().includes(q) ||
        i.material?.toLowerCase().includes(q),
    )
  }, [items, search])

  async function loadItems() {
    try {
      setLoading(true)
      const url = `/api/wardrobe${search ? `?search=${encodeURIComponent(search)}` : ""}`
      const res = await fetch(url, { cache: "no-store" })
      const data = await res.json()
      setItems(Array.isArray(data?.items) ? data.items : [])
      if (selectedId == null && data?.items?.length) {
        setSelectedId(data.items[0].id)
      }
    } catch (e) {
      console.error(e)
      toast({ title: "Ошибка", description: "Не удалось загрузить вещи", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  function updateForm<K extends keyof WardrobeItem>(key: K, value: WardrobeItem[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (selectedId == null) return
    setSaving(true)
    try {
      const payload = {
        item_name: form.item_name,
        item_name_en: form.item_name_en,
        description: form.description,
        description_en: form.description_en,
        size_type: form.size_type,
        material: form.material,
        style: form.style,
        has_print: !!form.has_print,
        color: form.color,
        shade: form.shade,
        has_details: !!form.has_details,
        url: form.url,
        image_url: form.image_url,
        is_basic: !!form.is_basic,
        notes: form.notes,
        clothing_type: form.clothing_type,
        is_hidden: !!form.is_hidden,
      }
      const res = await fetch(`/api/wardrobe/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to save")
      }
      const { item } = await res.json()
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)))
      toast({ title: "Сохранено", description: "Вещь успешно сохранена" })
    } catch (e) {
      console.error(e)
      toast({ title: "Ошибка", description: "Не удалось сохранить изменения", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Редактирование гардероба (админ)</h1>

      <div className="mb-4">
        <Input
          placeholder="Поиск: название, цвет, материал"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void loadItems()
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* List */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Список вещей {loading ? "(загрузка...)" : `(${filtered.length})`}</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] overflow-auto">
            <div className="space-y-2">
              {filtered.map((it) => (
                <button
                  key={it.id}
                  onClick={() => setSelectedId(it.id)}
                  className={`w-full flex items-center gap-3 rounded-md p-2 text-left hover:bg-muted ${
                    selectedId === it.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="relative w-12 h-12 rounded-md overflow-hidden bg-gray-100">
                    {it.image_url ? (
                      <Image
                        src={it.image_url || "/placeholder.svg"}
                        alt={it.item_name}
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                        нет фото
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{it.item_name}</div>
                    <div className="text-xs text-gray-500">
                      {(it.color || "").toString()} {(it.size_type || "").toString()}
                    </div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && !loading && <div className="text-sm text-gray-500">Ничего не найдено</div>}
            </div>
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Редактор</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedId == null ? (
              <div className="text-sm text-gray-500">Выберите вещь слева, чтобы отредактировать</div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void save()
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div className="space-y-2">
                  <Label>Название</Label>
                  <Input value={form.item_name || ""} onChange={(e) => updateForm("item_name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Название (EN)</Label>
                  <Input value={form.item_name_en || ""} onChange={(e) => updateForm("item_name_en", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Описание</Label>
                  <Textarea
                    rows={3}
                    value={form.description || ""}
                    onChange={(e) => updateForm("description", e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Описание (EN)</Label>
                  <Textarea
                    rows={3}
                    value={form.description_en || ""}
                    onChange={(e) => updateForm("description_en", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Размер</Label>
                  <Input value={form.size_type || ""} onChange={(e) => updateForm("size_type", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Материал</Label>
                  <Input value={form.material || ""} onChange={(e) => updateForm("material", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Стиль</Label>
                  <Input value={form.style || ""} onChange={(e) => updateForm("style", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Цвет</Label>
                  <Input value={form.color || ""} onChange={(e) => updateForm("color", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Оттенок</Label>
                  <Input value={form.shade || ""} onChange={(e) => updateForm("shade", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Тип одежды</Label>
                  <Select
                    value={(form.clothing_type as string) || ""}
                    onValueChange={(v) => updateForm("clothing_type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLOTHING_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="has_print"
                    checked={!!form.has_print}
                    onCheckedChange={(v) => updateForm("has_print", Boolean(v))}
                  />
                  <Label htmlFor="has_print">Есть принт</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="has_details"
                    checked={!!form.has_details}
                    onCheckedChange={(v) => updateForm("has_details", Boolean(v))}
                  />
                  <Label htmlFor="has_details">Есть детали</Label>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>URL</Label>
                  <Input type="url" value={form.url || ""} onChange={(e) => updateForm("url", e.target.value)} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Заметки</Label>
                  <Textarea rows={2} value={form.notes || ""} onChange={(e) => updateForm("notes", e.target.value)} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Ссылка на изображение</Label>
                  <Input
                    value={form.image_url || ""}
                    onChange={(e) => updateForm("image_url", e.target.value)}
                    placeholder="https://..."
                  />
                  <div className="mt-2">
                    {form.image_url ? (
                      <div className="relative w-40 h-40 rounded overflow-hidden bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={form.image_url || "/placeholder.svg"}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">Нет превью</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_basic"
                    checked={!!form.is_basic}
                    onCheckedChange={(v) => updateForm("is_basic", Boolean(v))}
                  />
                  <Label htmlFor="is_basic">Базовая вещь</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is_hidden"
                    checked={!!form.is_hidden}
                    onCheckedChange={(v) => updateForm("is_hidden", Boolean(v))}
                  />
                  <Label htmlFor="is_hidden">Скрыть вещь</Label>
                </div>

                <div className="md:col-span-2 flex gap-3 pt-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Сохранение..." : "Сохранить"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void loadItems()} disabled={loading}>
                    Обновить список
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
