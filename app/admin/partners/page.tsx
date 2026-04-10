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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Check, X, Eye, Building2, Clock, Loader2 } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

interface Partner {
  id: number
  user_id: string
  company_name: string
  contact_name: string
  website: string | null
  description: string | null
  status: string
  rejected_reason: string | null
  approved_at: string | null
  created_at: string
  api_calls_total: number
}

const STATUS_FILTER_TABS = [
  { value: "", label: "Все" },
  { value: "pending", label: "Ожидают" },
  { value: "approved", label: "Одобренные" },
  { value: "rejected", label: "Отклонённые" },
  { value: "suspended", label: "Приостановленные" },
]

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "outline", label: "Ожидает" },
  approved: { variant: "default", label: "Одобрен" },
  rejected: { variant: "destructive", label: "Отклонён" },
  suspended: { variant: "secondary", label: "Приостановлен" },
}

export default function AdminPartnersPage() {
  const { toast } = useToast()
  const [partners, setPartners] = useState<Partner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState("")
  const [rejectDialog, setRejectDialog] = useState<{ partnerId: number; companyName: string } | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const loadPartners = async (status?: string) => {
    try {
      setIsLoading(true)
      const params = status ? `?status=${status}` : ""
      const data = await api.get<{ partners: Partner[] }>(`/api/admin/partners${params}`)
      setPartners(data.partners)
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось загрузить партнёров", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPartners(activeFilter || undefined)
  }, [activeFilter])

  const handleApprove = async (partnerId: number) => {
    setActionLoading(partnerId)
    try {
      await api.patch(`/api/admin/partners/${partnerId}`, { status: "approved" })
      toast({ title: "Партнёр одобрен" })
      loadPartners(activeFilter || undefined)
    } catch {
      toast({ title: "Ошибка", variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async () => {
    if (!rejectDialog) return
    setActionLoading(rejectDialog.partnerId)
    try {
      await api.patch(`/api/admin/partners/${rejectDialog.partnerId}`, {
        status: "rejected",
        rejected_reason: rejectReason || undefined,
      })
      toast({ title: "Партнёр отклонён" })
      setRejectDialog(null)
      setRejectReason("")
      loadPartners(activeFilter || undefined)
    } catch {
      toast({ title: "Ошибка", variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  const pendingCount = partners.filter((p) => p.status === "pending").length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Партнёры
          </h1>
          {pendingCount > 0 && (
            <p className="text-sm text-orange-600 mt-1">
              <Clock className="h-3.5 w-3.5 inline mr-1" />
              {pendingCount} заявок ожидают рассмотрения
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTER_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={activeFilter === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : partners.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Партнёров не найдено</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Компания</TableHead>
                  <TableHead>Контакт</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>API вызовы</TableHead>
                  <TableHead>Дата заявки</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => {
                  const badge = STATUS_BADGE[partner.status] ?? STATUS_BADGE.pending
                  return (
                    <TableRow key={partner.id}>
                      <TableCell>
                        <div className="font-medium">{partner.company_name}</div>
                        {partner.website && (
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">
                            {partner.website}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{partner.contact_name}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{partner.api_calls_total}</TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDistanceToNow(new Date(partner.created_at), {
                          addSuffix: true,
                          locale: ru,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/admin/partners/${partner.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {partner.status === "pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => handleApprove(partner.id)}
                                disabled={actionLoading === partner.id}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setRejectDialog({ partnerId: partner.id, companyName: partner.company_name })}
                                disabled={actionLoading === partner.id}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить заявку</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Вы собираетесь отклонить заявку от <strong>{rejectDialog?.companyName}</strong>.
            Укажите причину (необязательно):
          </p>
          <Input
            placeholder="Причина отклонения"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading !== null}
            >
              Отклонить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
