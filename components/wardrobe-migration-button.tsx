"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Database, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface WardrobeMigrationButtonProps {
  onMigrationComplete?: () => void
}

export function WardrobeMigrationButton({ onMigrationComplete }: WardrobeMigrationButtonProps) {
  const [isMigrating, setIsMigrating] = useState(false)
  const { toast } = useToast()

  const handleMigration = async () => {
    setIsMigrating(true)
    try {
      const response = await fetch("/api/wardrobe/migrate", {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to execute migration")
      }

      toast({
        title: "Успешно",
        description: "Миграция базы данных выполнена успешно. Теперь вы можете создавать базовые вещи.",
      })

      // Вызываем колбэк, если он предоставлен
      if (onMigrationComplete) {
        onMigrationComplete()
      }
    } catch (error) {
      console.error("Error executing migration:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось выполнить миграцию базы данных",
        variant: "destructive",
      })
    } finally {
      setIsMigrating(false)
    }
  }

  return (
    <Button onClick={handleMigration} disabled={isMigrating} className="flex items-center gap-2">
      {isMigrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
      {isMigrating ? "Выполнение миграции..." : "Обновить структуру базы данных"}
    </Button>
  )
}
