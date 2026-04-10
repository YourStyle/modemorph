import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenRouterMessage {
  role: "user" | "assistant" | "system"
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

interface OpenRouterImageConfig {
  aspect_ratio?: string
  image_size?: string
}

interface OpenRouterRequest {
  model: string
  messages: OpenRouterMessage[]
  modalities?: string[]
  image_config?: OpenRouterImageConfig
  temperature?: number
}

interface OpenRouterImageResult {
  image_url: { url: string }
}

interface OpenRouterChoice {
  message: {
    role: string
    content: string | null
    images?: OpenRouterImageResult[]
  }
}

export interface OpenRouterResponse {
  choices: OpenRouterChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    cost: number
  }
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error("OPENROUTER_API_KEY not configured")
  return key
}

/** Send a request to OpenRouter and return the parsed response */
export async function openrouterChat(req: OpenRouterRequest): Promise<OpenRouterResponse> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(req),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Download an image URL and return it as a base64 data URI */
export async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get("content-type") || "image/jpeg"
    const buffer = Buffer.from(await res.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString("base64")}`
  } catch (err) {
    console.error("[openrouter] failed to download image:", url, err)
    return null
  }
}

/** Convert a File/Buffer to base64 data URI */
export function bufferToBase64(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`
}

/** Upload a base64 data URI to Yandex S3 and return the public URL */
export async function uploadBase64ToS3(dataUri: string, prefix = "vton"): Promise<string> {
  const matches = dataUri.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!matches) throw new Error("Invalid base64 data URI format")

  const ext = matches[1] === "jpeg" ? "jpg" : matches[1]
  const buffer = Buffer.from(matches[2], "base64")

  const s3Client = new S3Client({
    region: "ru-central1",
    endpoint: "https://storage.yandexcloud.net",
    credentials: {
      accessKeyId: process.env.YANDEX_ACCESS_KEY_ID!,
      secretAccessKey: process.env.YANDEX_SECRET_ACCESS_KEY!,
    },
  })
  const bucket = process.env.YANDEX_BUCKET_NAME!
  const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: `image/${matches[1]}`,
      ACL: "public-read",
    }),
  )

  return `https://storage.yandexcloud.net/${bucket}/${key}`
}
