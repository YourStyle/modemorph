"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

interface FeatureCost {
  id: number
  feature_name: string
  display_name: string
  cost_credits: number
  cost_subscription_credits: number
  description: string
  is_active: boolean
}

export default function FeatureCostsPage() {
  const [featureCosts, setFeatureCosts] = useState<FeatureCost[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchFeatureCosts()
  }, [])

  const fetchFeatureCosts = async () => {
    try {
      const { data, error } = await supabase.from("feature_costs").select("*").order("feature_name")

      if (error) throw error
      setFeatureCosts(data || [])
    } catch (error) {
      console.error("Error fetching feature costs:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить настройки стоимости",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const updateFeatureCost = async (id: number, updates: Partial<FeatureCost>) => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from("feature_costs")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)

      if (error) throw error

      setFeatureCosts((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))

      toast({
        title: "Успешно",
        description: "Настройки стоимости обновлены",
      })
    } catch (error) {
      console.error("Error updating feature cost:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось обновить настройки",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Загрузка...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Настройка стоимости функций</h1>
        <p className="text-muted-foreground mt-2">Управление стоимостью различных функций приложения в кредитах</p>
      </div>

      <div className="grid gap-6">
        {featureCosts.map((feature) => (
          <Card key={feature.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{feature.display_name}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </div>
                <Switch
                  checked={feature.is_active}
                  onCheckedChange={(checked) => updateFeatureCost(feature.id, { is_active: checked })}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`regular-${feature.id}`}>Стоимость для обычных пользователей (кредиты)</Label>
                  <Input
                    id={`regular-${feature.id}`}
                    type="number"
                    min="0"
                    value={feature.cost_credits}
                    onChange={(e) =>
                      updateFeatureCost(feature.id, {
                        cost_credits: Number.parseInt(e.target.value) || 0,
                      })
                    }
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`subscription-${feature.id}`}>Стоимость для подписчиков (кредиты)</Label>
                  <Input
                    id={`subscription-${feature.id}`}
                    type="number"
                    min="0"
                    value={feature.cost_subscription_credits}
                    onChange={(e) =>
                      updateFeatureCost(feature.id, {
                        cost_subscription_credits: Number.parseInt(e.target.value) || 0,
                      })
                    }
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`description-${feature.id}`}>Описание</Label>
                <Textarea
                  id={`description-${feature.id}`}
                  value={feature.description}
                  onChange={(e) => updateFeatureCost(feature.id, { description: e.target.value })}
                  disabled={saving}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
