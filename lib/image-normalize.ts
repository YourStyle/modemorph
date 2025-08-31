"use client"
import heic2any from "heic2any"

type NormalizeOpts = {
  maxWidth?: number
  output?: "image/jpeg" | "image/png"
  quality?: number // 0..1
}

const isHeicHeif = (file: File) =>
  /image\/hei(c|f)/i.test(file.type) || /\.(hei(c|f))$/i.test(file.name)

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/**
 * Конвертирует HEIC/HEIF → JPEG (по умолчанию) и уменьшает ширину до maxWidth=2048.
 * Для остальных форматов просто уменьшает ширину, если нужно.
 * Возвращает НОВЫЙ File (без мутирования исходного).
 */
export async function normalizeImageFile(
  file: File,
  opts: NormalizeOpts = { maxWidth: 2048, output: "image/jpeg", quality: 0.9 }
): Promise<File> {
  const maxWidth = opts.maxWidth ?? 2048
  const output = opts.output ?? "image/jpeg"
  const quality = opts.quality ?? 0.9

  let workingBlob: Blob = file

  // 1) HEIC/HEIF → JPEG/PNG
  if (isHeicHeif(file)) {
    const converted = (await heic2any({
      blob: file,
      toType: output,
      quality,
    })) as Blob
    workingBlob = converted
  }

  // 2) Даунскейл по ширине (если нужно)
  const img = await blobToImage(workingBlob)
  const { naturalWidth: w, naturalHeight: h } = img

  const scale = w > maxWidth ? maxWidth / w : 1
  const targetW = Math.round(w * scale)
  const targetH = Math.round(h * scale)

  // Если даунскейл не нужен и это уже нужный тип — просто вернём File
  if (scale === 1 && workingBlob.type === output) {
    return new File([workingBlob], renameExt(file.name, output), { type: output })
  }

  // Ресайз через canvas
  const canvas = document.createElement("canvas")
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas not supported")
  ctx.drawImage(img, 0, 0, targetW, targetH)

  const resizedBlob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), output, quality)
  )

  return new File([resizedBlob], renameExt(file.name, output), { type: output })
}

function renameExt(name: string, mime: string) {
  const ext = mime === "image/png" ? "png" : "jpg"
  return name.replace(/\.(heic|heif|jpeg|jpg|png|webp)$/i, "") + `.${ext}`
}
