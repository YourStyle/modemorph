import crypto from "crypto"

// Конфигурация Yandex Cloud Object Storage
const YC_ACCESS_KEY_ID = process.env.YANDEX_ACCESS_KEY_ID || process.env.YC_ACCESS_KEY_ID
const YC_SECRET_ACCESS_KEY = process.env.YANDEX_SECRET_ACCESS_KEY || process.env.YC_SECRET_ACCESS_KEY
const YC_REGION = "ru-central1"
const YC_SERVICE = "s3"
const YC_HOST = "storage.yandexcloud.net"
const YC_BUCKET = process.env.YANDEX_BUCKET_NAME || "modemorphs3"

if (!YC_ACCESS_KEY_ID || !YC_SECRET_ACCESS_KEY) {
  throw new Error("Missing required Yandex Cloud credentials in environment variables")
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
  try {
    const now = new Date()
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "")
    const timeStamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z"

    // Создаем канонический URI (должен быть URL-encoded)
    const canonicalUri = encodeURI(path).replace(/%2F/g, "/")

    // Сортируем и кодируем query параметры
    const sortedQueryParams = Object.keys(queryParams)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
      .join("&")

    // Добавляем обязательные заголовки
    const requestHeaders: Record<string, string> = {
      host: YC_HOST,
      "x-amz-date": timeStamp,
      "x-amz-content-sha256": payloadHash,
      ...headers,
    }

    // Сортируем заголовки и создаем канонические заголовки
    const sortedHeaderKeys = Object.keys(requestHeaders).sort()
    const canonicalHeaders =
      sortedHeaderKeys.map((key) => `${key.toLowerCase()}:${requestHeaders[key].toString().trim()}`).join("\n") + "\n"

    const signedHeaders = sortedHeaderKeys.map((key) => key.toLowerCase()).join(";")

    // Создаем канонический запрос
    const canonicalRequest = [
      method.toUpperCase(),
      canonicalUri,
      sortedQueryParams,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n")

    console.log("Canonical request:", canonicalRequest)

    // Создаем строку для подписи
    const credentialScope = `${dateStamp}/${YC_REGION}/${YC_SERVICE}/aws4_request`
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      timeStamp,
      credentialScope,
      crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n")

    console.log("String to sign:", stringToSign)

    // Создаем ключ для подписи
    const kDate = crypto.createHmac("sha256", `AWS4${YC_SECRET_ACCESS_KEY}`).update(dateStamp).digest()
    const kRegion = crypto.createHmac("sha256", kDate).update(YC_REGION).digest()
    const kService = crypto.createHmac("sha256", kRegion).update(YC_SERVICE).digest()
    const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest()

    // Создаем подпись
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")

    // Создаем заголовок авторизации
    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${YC_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    const finalHeaders = {
      ...requestHeaders,
      Authorization: authorizationHeader,
    }

    const url = `https://${YC_HOST}${canonicalUri}${sortedQueryParams ? "?" + sortedQueryParams : ""}`

    console.log("Authorization header:", authorizationHeader)
    console.log("Final URL:", url)

    return { headers: finalHeaders, url }
  } catch (error) {
    console.error("Error creating signature:", error)
    throw error
  }
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
    console.log("uploadToYandexS3 called with:", {
      dataType: fileData.constructor.name,
      dataLength: fileData.byteLength || (fileData as Buffer).length,
      key,
      contentType,
    })

    // Конвертируем данные в Buffer
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
    const path = `/${YC_BUCKET}/${fileName}`

    // Создаем хеш содержимого
    const payloadHash = crypto.createHash("sha256").update(fileBuffer).digest("hex")

    const headers = {
      "content-type": contentType || "application/octet-stream",
      "content-length": fileBuffer.length.toString(),
    }

    console.log("Creating signature for:", {
      method: "PUT",
      path,
      headers,
      payloadHash,
      fileSize: fileBuffer.length,
    })

    const { headers: signedHeaders, url } = createSignature("PUT", path, {}, headers, payloadHash)

    console.log("Making request to:", url)
    console.log("Request headers:", signedHeaders)

    const response = await fetch(url, {
      method: "PUT",
      headers: signedHeaders,
      body: fileBuffer,
    })

    console.log("Response status:", response.status)
    console.log("Response headers:", Object.fromEntries(response.headers.entries()))

    if (response.ok) {
      const publicUrl = `https://${YC_HOST}/${YC_BUCKET}/${fileName}`
      console.log("Upload successful, public URL:", publicUrl)
      return {
        success: true,
        url: publicUrl,
      }
    } else {
      const errorText = await response.text()
      console.error("Yandex S3 upload error:", response.status, errorText)
      return {
        success: false,
        error: `Upload failed: ${response.status} ${errorText}`,
      }
    }
  } catch (error) {
    console.error("Yandex S3 upload error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Получает файл из Yandex Cloud Object Storage
 */
export async function getFromYandexS3(key: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
  try {
    const fileName = key.startsWith("/") ? key.slice(1) : key
    const path = `/${YC_BUCKET}/${fileName}`

    // Для GET запроса используем пустой хеш
    const payloadHash = crypto.createHash("sha256").update("").digest("hex")

    const { headers: signedHeaders, url } = createSignature("GET", path, {}, {}, payloadHash)

    const response = await fetch(url, {
      method: "GET",
      headers: signedHeaders,
    })

    if (response.ok) {
      const data = Buffer.from(await response.arrayBuffer())
      return {
        success: true,
        data,
      }
    } else {
      const errorText = await response.text()
      return {
        success: false,
        error: `Get failed: ${response.status} ${errorText}`,
      }
    }
  } catch (error) {
    console.error("Yandex S3 get error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Удаляет файл из Yandex Cloud Object Storage
 */
export async function deleteFromYandexS3(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    const fileName = key.startsWith("/") ? key.slice(1) : key
    const path = `/${YC_BUCKET}/${fileName}`

    // Для DELETE запроса используем пустой хеш
    const payloadHash = crypto.createHash("sha256").update("").digest("hex")

    const { headers: signedHeaders, url } = createSignature("DELETE", path, {}, {}, payloadHash)

    const response = await fetch(url, {
      method: "DELETE",
      headers: signedHeaders,
    })

    if (response.ok || response.status === 404) {
      return { success: true }
    } else {
      const errorText = await response.text()
      return {
        success: false,
        error: `Delete failed: ${response.status} ${errorText}`,
      }
    }
  } catch (error) {
    console.error("Yandex S3 delete error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Проверяет существование файла в Yandex Cloud Object Storage
 */
export async function checkFileExistsInYandexS3(key: string): Promise<{ exists: boolean; error?: string }> {
  try {
    const fileName = key.startsWith("/") ? key.slice(1) : key
    const path = `/${YC_BUCKET}/${fileName}`

    // Для HEAD запроса используем пустой хеш
    const payloadHash = crypto.createHash("sha256").update("").digest("hex")

    const { headers: signedHeaders, url } = createSignature("HEAD", path, {}, {}, payloadHash)

    const response = await fetch(url, {
      method: "HEAD",
      headers: signedHeaders,
    })

    return {
      exists: response.ok,
    }
  } catch (error) {
    console.error("Yandex S3 check error:", error)
    return {
      exists: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
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
    const path = `/${YC_BUCKET}`
    const queryParams: Record<string, string> = {
      "max-keys": maxKeys.toString(),
    }

    if (prefix) {
      queryParams.prefix = prefix
    }

    // Для GET запроса используем пустой хеш
    const payloadHash = crypto.createHash("sha256").update("").digest("hex")

    const { headers: signedHeaders, url } = createSignature("GET", path, queryParams, {}, payloadHash)

    const response = await fetch(url, {
      method: "GET",
      headers: signedHeaders,
    })

    if (response.ok) {
      const xmlText = await response.text()

      // Простой парсинг XML (в продакшене лучше использовать специальную библиотеку)
      const files: Array<{ key: string; size: number; lastModified: Date }> = []
      const keyMatches = xmlText.match(/<Key>(.*?)<\/Key>/g) || []
      const sizeMatches = xmlText.match(/<Size>(.*?)<\/Size>/g) || []
      const dateMatches = xmlText.match(/<LastModified>(.*?)<\/LastModified>/g) || []

      for (let i = 0; i < keyMatches.length; i++) {
        const key = keyMatches[i]?.replace(/<\/?Key>/g, "") || ""
        const size = Number.parseInt(sizeMatches[i]?.replace(/<\/?Size>/g, "") || "0")
        const dateStr = dateMatches[i]?.replace(/<\/?LastModified>/g, "") || ""

        files.push({
          key,
          size,
          lastModified: new Date(dateStr),
        })
      }

      return {
        success: true,
        files,
      }
    } else {
      const errorText = await response.text()
      return {
        success: false,
        error: `List failed: ${response.status} ${errorText}`,
      }
    }
  } catch (error) {
    console.error("Yandex S3 list error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Создает подписанный URL для прямого доступа к файлу
 */
export function createSignedUrl(key: string, expiresIn = 3600): string {
  try {
    const fileName = key.startsWith("/") ? key.slice(1) : key
    const path = `/${YC_BUCKET}/${fileName}`

    const now = new Date()
    const expires = new Date(now.getTime() + expiresIn * 1000)
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "")
    const timeStamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z"

    const queryParams = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${YC_ACCESS_KEY_ID}/${dateStamp}/${YC_REGION}/${YC_SERVICE}/aws4_request`,
      "X-Amz-Date": timeStamp,
      "X-Amz-Expires": expiresIn.toString(),
      "X-Amz-SignedHeaders": "host",
    }

    // Для подписанного URL используем пустой хеш
    const payloadHash = crypto.createHash("sha256").update("").digest("hex")

    const { url } = createSignature("GET", path, queryParams, {}, payloadHash)
    return url
  } catch (error) {
    console.error("Error creating signed URL:", error)
    return ""
  }
}
