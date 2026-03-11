import { type NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

interface VTONRequest {
  avatar_url: string
  items: Array<{
    name: string
    description?: string
    color?: string
    material?: string
    image_url?: string
  }>
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Используем service role для операций с базой
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = await request.json()
    const { items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 })
    }

    // Get user profile to get avatar URL
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single()

    if (profileError || !profile?.avatar_url) {
      return NextResponse.json(
        {
          error: "User avatar not found. Please upload an avatar in your profile.",
        },
        { status: 400 },
      )
    }

    // Prepare VTON request
    const vtonRequest: VTONRequest = {
      avatar_url: profile.avatar_url,
      items: items.map((item) => ({
        name: item.name || "Unnamed item",
        description: item.description || "",
        color: item.color || "",
        material: item.material || "",
        image_url: item.image_url || "",
      })),
    }

    console.log("Sending VTON request:", vtonRequest)

    const authToken = request.headers.get("authorization")?.replace("Bearer ", "")

    // Use NEXT_PUBLIC_AI_API_URL + /vton
    const vtonUrl = `${process.env.NEXT_PUBLIC_AI_API_URL}/vton`

    // Make request to VTON service
    const vtonResponse = await fetch(vtonUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
      body: JSON.stringify(vtonRequest),
    })

    if (!vtonResponse.ok) {
      const errorText = await vtonResponse.text()
      console.error("VTON service error:", vtonResponse.status, errorText)

      // Try to extract meaningful error from n8n response
      let userError = "Сервис примерки временно недоступен"
      try {
        const parsed = JSON.parse(errorText)
        if (parsed?.error) userError = parsed.error
        else if (parsed?.message) userError = parsed.message
      } catch {
        // not JSON, use default
      }

      return NextResponse.json(
        { error: userError },
        { status: vtonResponse.status >= 500 ? 503 : vtonResponse.status },
      )
    }

    let vtonResult = await vtonResponse.json()

    // n8n returns array — unwrap first element
    if (Array.isArray(vtonResult)) {
      if (vtonResult.length === 0) {
        return NextResponse.json({ error: "Сервис примерки вернул пустой ответ" }, { status: 502 })
      }
      vtonResult = vtonResult[0]
    }

    // n8n might return 200 with error in body
    if (vtonResult?.error) {
      console.error("VTON service returned error in body:", vtonResult.error)
      return NextResponse.json(
        { error: typeof vtonResult.error === "string" ? vtonResult.error : "Ошибка сервиса примерки" },
        { status: 502 },
      )
    }

    // Extract image from any known field name
    let imageData: string | null =
      vtonResult?.image_url || vtonResult?.url || vtonResult?.imageUrl ||
      vtonResult?.avatar_url || vtonResult?.result_url || vtonResult?.image || null

    if (!imageData) {
      console.error("VTON: no image field found in response:", Object.keys(vtonResult || {}))
      return NextResponse.json({ error: "Сервис примерки не вернул изображение" }, { status: 502 })
    }

    // If base64 — upload to Yandex S3 and return a persistent URL
    if (imageData.startsWith("data:image/")) {
      try {
        const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/)
        if (!matches) {
          return NextResponse.json({ error: "Некорректный формат изображения" }, { status: 502 })
        }
        const ext = matches[1] === "jpeg" ? "jpg" : matches[1]
        const base64Data = matches[2]
        const buffer = Buffer.from(base64Data, "base64")

        const s3Client = new S3Client({
          region: "ru-central1",
          endpoint: "https://storage.yandexcloud.net",
          credentials: {
            accessKeyId: process.env.YANDEX_ACCESS_KEY_ID!,
            secretAccessKey: process.env.YANDEX_SECRET_ACCESS_KEY!,
          },
        })
        const bucket = process.env.YANDEX_BUCKET_NAME!
        const key = `vton/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: `image/${matches[1]}`,
          ACL: "public-read",
        }))

        imageData = `https://storage.yandexcloud.net/${bucket}/${key}`
        console.log("VTON: uploaded base64 to S3:", imageData)
      } catch (uploadErr) {
        console.error("VTON: S3 upload failed:", uploadErr)
        // Fall back to returning base64 data URL directly
      }
    }

    return NextResponse.json({
      success: true,
      result: { image_url: imageData },
    })
  } catch (error) {
    console.error("Error in VTON API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
