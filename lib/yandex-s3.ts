import crypto from "crypto"

// Конфигурация Yandex Cloud Object Storage
const YC_REGION = "ru-central1"
const YC_SERVICE = "s3"
const YC_HOST = "storage.yandexcloud.net"

function getCredentials() {
  const accessKeyId = process.env.YANDEX_ACCESS_KEY_ID || process.env.YC_ACCESS_KEY_ID
  const secretAccessKey = process.env.YANDEX_SECRET_ACCESS_KEY || process.env.YC_SECRET_ACCESS_KEY
  const bucket = process.env.YANDEX_BUCKET_NAME || "modemorphs3"
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing required Yandex Cloud credentials in environment variables")
  }
  return { accessKeyId, secretAccessKey, bucket }
}

/**
 * Создает подпись AWS Signature Version 4 для Yandex Cloud
 */
function createSignature(
  method: string,
  path: string,
  queryParams: Record<string, string> = {},
  headers: Record<string, string> = {},
  payloadHash: string,
): { headers: Record<string, string>; url: string } {
  const { accessKeyId, secretAccessKey } = getCredentials()
  const now = new Date()
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "")
  const timeStamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z"

  const canonicalUri = encodeURI(path).replace(/%2F/g, "/")

  const sortedQueryParams = Object.keys(queryParams)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
    .join("&")

  const requestHeaders: Record<string, string> = {
    host: YC_HOST,
    "x-amz-date": timeStamp,
    "x-amz-content-sha256": payloadHash,
    ...headers,
  }

  const sortedHeaderKeys = Object.keys(requestHeaders).sort()
  const canonicalHeaders =
    sortedHeaderKeys.map((key) => `${key.toLowerCase()}:${requestHeaders[key].toString().trim()}`).join("\n") + "\n"

  const signedHeaders = sortedHeaderKeys.map((key) => key.toLowerCase()).join(";")

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    sortedQueryParams,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n")

  const credentialScope = `${dateStamp}/${YC_REGION}/${YC_SERVICE}/aws4_request`
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timeStamp,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n")

  const kDate = crypto.createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest()
  const kRegion = crypto.createHmac("sha256", kDate).update(YC_REGION).digest()
  const kService = crypto.createHmac("sha256", kRegion).update(YC_SERVICE).digest()
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest()

  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const finalHeaders = {
    ...requestHeaders,
    Authorization: authorizationHeader,
  }

  const url = `https://${YC_HOST}${canonicalUri}${sortedQueryParams ? "?" + sortedQueryParams : ""}`

  return { headers: finalHeaders, url }
}

/**
 * Загружает файл в Yandex Cloud Object Storage
 */
export async function uploadToYandexS3(
  fileData: ArrayBuffer | Uint8Array | Buffer,
  key: string,
  contentType?: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { bucket } = getCredentials()

    let fileBuffer: Buffer
    if (Buffer.isBuffer(fileData)) {
      fileBuffer = fileData
    } else if (fileData instanceof ArrayBuffer) {
      fileBuffer = Buffer.from(fileData)
    } else if (fileData instanceof Uint8Array) {
      fileBuffer = Buffer.from(fileData)
    } else {
      throw new Error(`Unsupported data type: ${typeof fileData}`)
    }

    const fileName = key.startsWith("/") ? key.slice(1) : key
    const path = `/${bucket}/${fileName}`

    const payloadHash = crypto.createHash("sha256").update(fileBuffer).digest("hex")

    const headers = {
      "content-type": contentType || "application/octet-stream",
      "content-length": fileBuffer.length.toString(),
    }

    const { headers: signedHeaders, url } = createSignature("PUT", path, {}, headers, payloadHash)

    const response = await fetch(url, {
      method: "PUT",
      headers: signedHeaders,
      body: fileBuffer,
    })

    if (response.ok) {
      const publicUrl = `https://${YC_HOST}/${bucket}/${fileName}`
      return { success: true, url: publicUrl }
    } else {
      const errorText = await response.text()
      console.error("Yandex S3 upload error:", response.status, errorText)
      return { success: false, error: `Upload failed: ${response.status} ${errorText}` }
    }
  } catch (error) {
    console.error("Yandex S3 upload error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Получает файл из Yandex Cloud Object Storage
 */
export async function getFromYandexS3(key: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
  try {
    const { bucket } = getCredentials()
    const fileName = key.startsWith("/") ? key.slice(1) : key
    const path = `/${bucket}/${fileName}`

    const payloadHash = crypto.createHash("sha256").update("").digest("hex")
    const { headers: signedHeaders, url } = createSignature("GET", path, {}, {}, payloadHash)

    const response = await fetch(url, { method: "GET", headers: signedHeaders })

    if (response.ok) {
      const data = Buffer.from(await response.arrayBuffer())
      return { success: true, data }
    } else {
      const errorText = await response.text()
      return { success: false, error: `Get failed: ${response.status} ${errorText}` }
    }
  } catch (error) {
    console.error("Yandex S3 get error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Удаляет файл из Yandex Cloud Object Storage
 */
export async function deleteFromYandexS3(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { bucket } = getCredentials()
    const fileName = key.startsWith("/") ? key.slice(1) : key
    const path = `/${bucket}/${fileName}`

    const payloadHash = crypto.createHash("sha256").update("").digest("hex")
    const { headers: signedHeaders, url } = createSignature("DELETE", path, {}, {}, payloadHash)

    const response = await fetch(url, { method: "DELETE", headers: signedHeaders })

    if (response.ok || response.status === 404) {
      return { success: true }
    } else {
      const errorText = await response.text()
      return { success: false, error: `Delete failed: ${response.status} ${errorText}` }
    }
  } catch (error) {
    console.error("Yandex S3 delete error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Проверяет существование файла в Yandex Cloud Object Storage
 */
export async function checkFileExistsInYandexS3(key: string): Promise<{ exists: boolean; error?: string }> {
  try {
    const { bucket } = getCredentials()
    const fileName = key.startsWith("/") ? key.slice(1) : key
    const path = `/${bucket}/${fileName}`

    const payloadHash = crypto.createHash("sha256").update("").digest("hex")
    const { headers: signedHeaders, url } = createSignature("HEAD", path, {}, {}, payloadHash)

    const response = await fetch(url, { method: "HEAD", headers: signedHeaders })
    return { exists: response.ok }
  } catch (error) {
    console.error("Yandex S3 check error:", error)
    return { exists: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Получает список файлов в бакете
 */
export async function listYandexS3Files(
  prefix = "",
  maxKeys = 1000,
): Promise<{
  success: boolean
  files?: Array<{ key: string; size: number; lastModified: Date }>
  error?: string
}> {
  try {
    const { bucket } = getCredentials()
    const path = `/${bucket}`
    const queryParams: Record<string, string> = { "max-keys": maxKeys.toString() }

    if (prefix) {
      queryParams.prefix = prefix
    }

    const payloadHash = crypto.createHash("sha256").update("").digest("hex")
    const { headers: signedHeaders, url } = createSignature("GET", path, queryParams, {}, payloadHash)

    const response = await fetch(url, { method: "GET", headers: signedHeaders })

    if (response.ok) {
      const xmlText = await response.text()

      const files: Array<{ key: string; size: number; lastModified: Date }> = []
      const keyMatches = xmlText.match(/<Key>(.*?)<\/Key>/g) || []
      const sizeMatches = xmlText.match(/<Size>(.*?)<\/Size>/g) || []
      const dateMatches = xmlText.match(/<LastModified>(.*?)<\/LastModified>/g) || []

      for (let i = 0; i < keyMatches.length; i++) {
        const key = keyMatches[i]?.replace(/<\/?Key>/g, "") || ""
        const size = Number.parseInt(sizeMatches[i]?.replace(/<\/?Size>/g, "") || "0")
        const dateStr = dateMatches[i]?.replace(/<\/?LastModified>/g, "") || ""
        files.push({ key, size, lastModified: new Date(dateStr) })
      }

      return { success: true, files }
    } else {
      const errorText = await response.text()
      return { success: false, error: `List failed: ${response.status} ${errorText}` }
    }
  } catch (error) {
    console.error("Yandex S3 list error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Создает подписанный URL для прямого доступа к файлу
 */
export function createSignedUrl(key: string, expiresIn = 3600): string {
  try {
    const { accessKeyId, bucket } = getCredentials()
    const fileName = key.startsWith("/") ? key.slice(1) : key
    const path = `/${bucket}/${fileName}`

    const now = new Date()
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "")
    const timeStamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z"

    const queryParams = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${accessKeyId}/${dateStamp}/${YC_REGION}/${YC_SERVICE}/aws4_request`,
      "X-Amz-Date": timeStamp,
      "X-Amz-Expires": expiresIn.toString(),
      "X-Amz-SignedHeaders": "host",
    }

    const payloadHash = crypto.createHash("sha256").update("").digest("hex")
    const { url } = createSignature("GET", path, queryParams, {}, payloadHash)
    return url
  } catch (error) {
    console.error("Error creating signed URL:", error)
    return ""
  }
}
