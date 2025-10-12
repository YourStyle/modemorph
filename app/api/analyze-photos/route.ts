import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 300 // 5 минут

interface ResponseItem {
  index: number
  basic_item_id: number | null
  need_gen: boolean
  clothing_item: string
  description: string
  item_name: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  img_url?: string
  image_url?: string
}

export async function POST(request: Request) {
  try {
    // Получаем текущего пользователя
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    // AI API URL
    const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook"

    // Анализируем каждый файл
    const analysisPromises = files.map(async (file) => {
      const fileFormData = new FormData()
      fileFormData.append("image", file)

      try {
        const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
          method: "POST",
          body: fileFormData,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        })

        if (!response.ok) {
          throw new Error(`AI API error: ${response.status}`)
        }

        const data = await response.json()
        return { success: true, data }
      } catch (error) {
        console.error("Error analyzing photo:", error)
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
      }
    })

    const results = await Promise.all(analysisPromises)

    // Собираем все успешные результаты
    const allItems: ResponseItem[] = []
    for (const result of results) {
      if (result.success && Array.isArray(result.data)) {
        allItems.push(...result.data)
      }
    }

    // Возвращаем результаты
    return NextResponse.json({
      success: true,
      items: allItems,
      totalFiles: files.length,
      successfulAnalyses: results.filter((r) => r.success).length,
    })
  } catch (error) {
    console.error("Error in analyze-photos API:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze photos" },
      { status: 500 }
    )
  }
}
