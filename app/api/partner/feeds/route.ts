import { type NextRequest, NextResponse } from "next/server"
import { getPartnerUser } from "@/lib/partner-auth"
import { createClient } from "@supabase/supabase-js"
import { uploadBase64ToS3 } from "@/lib/openrouter"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** List feeds for the authenticated partner */
export async function GET(request: NextRequest) {
  const result = await getPartnerUser(request)
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (result.partner.status !== "approved") {
    return NextResponse.json({ error: "Partner not approved" }, { status: 403 })
  }

  const supabase = getSupabase()
  const { data: feeds, error } = await supabase
    .from("partner_feeds")
    .select("*")
    .eq("partner_id", result.partner.id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: "Failed to fetch feeds" }, { status: 500 })
  }

  return NextResponse.json({ feeds: feeds ?? [] })
}

/** Upload a new YML feed file */
export async function POST(request: NextRequest) {
  const result = await getPartnerUser(request)
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (result.partner.status !== "approved") {
    return NextResponse.json({ error: "Partner not approved" }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "Ожидается multipart/form-data с полем feed_file" },
      { status: 400 },
    )
  }

  const file = formData.get("feed_file")
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Поле feed_file обязательно" }, { status: 400 })
  }

  // Validate file type (XML/YML)
  const fileName = file.name
  if (!fileName.match(/\.(xml|yml)$/i)) {
    return NextResponse.json(
      { error: "Поддерживаются только файлы XML/YML" },
      { status: 400 },
    )
  }

  // Max 50 MB
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Максимальный размер файла — 50 МБ" },
      { status: 400 },
    )
  }

  // Upload to S3
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const s3Key = `feeds/${result.partner.id}/${Date.now()}_${fileName}`

  const s3Client = new S3Client({
    region: "ru-central1",
    endpoint: "https://storage.yandexcloud.net",
    credentials: {
      accessKeyId: process.env.YANDEX_ACCESS_KEY_ID!,
      secretAccessKey: process.env.YANDEX_SECRET_ACCESS_KEY!,
    },
  })
  const bucket = process.env.YANDEX_BUCKET_NAME!

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: "application/xml",
      }),
    )
  } catch (err) {
    console.error("[Partner Feeds] S3 upload error:", err)
    return NextResponse.json({ error: "Ошибка загрузки файла" }, { status: 500 })
  }

  const fileUrl = `https://storage.yandexcloud.net/${bucket}/${s3Key}`

  // Create feed record
  const supabase = getSupabase()
  const { data: feed, error } = await supabase
    .from("partner_feeds")
    .insert({
      partner_id: result.partner.id,
      file_url: fileUrl,
      file_name: fileName,
      status: "pending",
    })
    .select()
    .single()

  if (error) {
    console.error("[Partner Feeds] Insert error:", error)
    return NextResponse.json({ error: "Ошибка создания записи" }, { status: 500 })
  }

  console.log(`[Partner Feeds] Feed ${feed.id} uploaded by partner ${result.partner.id}: ${fileName}`)

  return NextResponse.json({
    success: true,
    feed: {
      id: feed.id,
      file_name: feed.file_name,
      status: feed.status,
      created_at: feed.created_at,
    },
  })
}
