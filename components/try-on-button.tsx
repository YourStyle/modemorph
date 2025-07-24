"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Shirt } from "lucide-react"
import { toast } from "sonner"

interface TryOnButtonProps {
  outfitItems: Array<{
    id: string
    source: string
  }>
  disabled?: boolean
  className?: string
}

export function TryOnButton({ outfitItems, disabled, className }: TryOnButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const handleTryOn = async () => {
    if (!outfitItems || outfitItems.length === 0) {
      toast.error("Выберите вещи для примерки")
      return
    }

    try {
      setIsProcessing(true)
      toast.info("Создаем примерку...")

      const response = await fetch("/api/user-fittings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outfit_items: outfitItems,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create fitting")
      }

      const { fitting } = await response.json()

      if (fitting.status === "failed") {
        toast.error(fitting.error_message || "Ошибка при создании примерки")
      } else {
        toast.success("Примерка создана! Проверьте результат в разделе Аватар")
      }
    } catch (error) {
      console.error("Error creating fitting:", error)
      toast.error(error instanceof Error ? error.message : "Ошибка при создании примерки")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Button
      onClick={handleTryOn}
      disabled={disabled || isProcessing || !outfitItems || outfitItems.length === 0}
      className={className}
    >
      {isProcessing ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          Примеряем...
        </>
      ) : (
        <>
          <Shirt className="w-4 h-4 mr-2" />
          Примерить
        </>
      )}
    </Button>
  )
}
