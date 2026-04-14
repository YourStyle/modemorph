"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Key, Plus, Trash2, Copy, CheckCircle2, Loader2, AlertTriangle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

interface Token {
  id: number
  name: string
  token_prefix: string
  is_active: boolean
  rate_limit_per_minute: number
  last_used_at: string | null
  created_at: string
  revoked_at: string | null
}

export default function PartnerTokensPage() {
  const { toast } = useToast()
  const [tokens, setTokens] = useState<Token[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTokenName, setNewTokenName] = useState("")
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingLimit, setEditingLimit] = useState<number | null>(null)
  const [limitValue, setLimitValue] = useState("")

  const handleUpdateLimit = async (tokenId: number) => {
    const val = parseInt(limitValue)
    if (!val || val < 1 || val > 1000) {
      toast({ title: "Лимит должен быть от 1 до 1000", variant: "destructive" })
      return
    }
    try {
      await api.patch(`/api/partner/tokens/${tokenId}/rate-limit`, { rate_limit_per_minute: val })
      toast({ title: `Лимит обновлён: ${val}/мин` })
      setEditingLimit(null)
      loadTokens()
    } catch {
      toast({ title: "Ошибка обновления лимита", variant: "destructive" })
    }
  }

  const loadTokens = async () => {
    try {
      const data = await api.get<{ tokens: Token[] }>("/api/partner/tokens")
      setTokens(data.tokens)
    } catch {
      toast({ title: "Ошибка загрузки токенов", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTokens()
  }, [])

  const handleCreate = async () => {
    if (!newTokenName.trim()) return
    setCreating(true)
    try {
      const data = await api.post<{ token: { id: number; name: string; token_prefix: string; key: string } }>(
        "/api/partner/tokens",
        { name: newTokenName.trim() },
      )
      setCreatedKey(data.token.key)
      setNewTokenName("")
      loadTokens()
    } catch (err: any) {
      toast({ title: err.message || "Ошибка", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: number) => {
    setRevoking(id)
    try {
      await api.delete(`/api/partner/tokens/${id}`)
      toast({ title: "Токен отозван" })
      loadTokens()
    } catch {
      toast({ title: "Ошибка", variant: "destructive" })
    } finally {
      setRevoking(null)
    }
  }

  const handleCopy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const activeCount = tokens.filter((t) => t.is_active).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Key className="h-6 w-6" />
            API токены
          </h1>
          <p className="text-gray-500 mt-1">Управление ключами доступа к API</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-gradient-to-r from-[#EC9DE2] to-[#89AEFF] hover:opacity-90 border-0 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Создать токен
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Key className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>У вас пока нет токенов</p>
              <p className="text-sm">Создайте токен для доступа к API</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Ключ</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Лимит/мин</TableHead>
                  <TableHead>Последнее использование</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell className="font-mono text-sm text-gray-500">
                      {token.token_prefix}...
                    </TableCell>
                    <TableCell>
                      <Badge variant={token.is_active ? "default" : "secondary"}>
                        {token.is_active ? "Активен" : "Отозван"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {editingLimit === token.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number" min={1} max={1000}
                            value={limitValue}
                            onChange={(e) => setLimitValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleUpdateLimit(token.id); if (e.key === "Escape") setEditingLimit(null) }}
                            className="w-20 h-7 text-xs"
                            autoFocus
                          />
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleUpdateLimit(token.id)}>OK</Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { if (token.is_active) { setEditingLimit(token.id); setLimitValue(String(token.rate_limit_per_minute)) } }}
                          className={`${token.is_active ? "hover:bg-gray-100 cursor-pointer" : ""} rounded px-2 py-0.5`}
                          title={token.is_active ? "Нажмите для изменения" : undefined}
                        >
                          {token.rate_limit_per_minute}/мин
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {token.last_used_at
                        ? formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true, locale: ru })
                        : "Не использовался"}
                    </TableCell>
                    <TableCell className="text-right">
                      {token.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRevoke(token.id)}
                          disabled={revoking === token.id}
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

      {/* Create token dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setCreatedKey(null)
            setNewTokenName("")
            setCopied(false)
          }
        }}
      >
        <DialogContent>
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Токен создан
                </DialogTitle>
                <DialogDescription>
                  Скопируйте токен сейчас — он больше не будет показан.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-yellow-800">
                    Сохраните этот токен в надёжном месте. После закрытия окна вы не сможете его увидеть снова.
                  </p>
                </div>
                <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm text-green-400 break-all">
                  {createdKey}
                </div>
                <Button onClick={handleCopy} className="w-full" variant="outline">
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                      Скопировано!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Скопировать токен
                    </>
                  )}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => { setCreateOpen(false); setCreatedKey(null) }}>
                  Готово
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Создать API токен</DialogTitle>
                <DialogDescription>
                  Дайте токену понятное название, чтобы различать ключи для разных проектов.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="Название токена (например, Production)"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Отмена
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newTokenName.trim() || creating}
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
