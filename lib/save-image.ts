// Client-side image export with a ModeMorph watermark.
//
// Two entry points:
//   renderSinglePhoto(url)        -> watermarked copy of one image (try-on result)
//   renderLookGrid(urls, title)   -> composed grid of item photos (saved образ)
//
// Both return a PNG Blob. The caller shows it in an overlay so the user can
// long-press → "Save to Photos" (the only path that reliably works inside the
// Telegram in-app webview, where <a download> is silently ignored).

const BRAND_FROM = "#EC9DE2"
const BRAND_TO = "#89AEFF"
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Manrope', sans-serif"

/** Route remote images through the same-origin proxy so canvas isn't tainted. */
function proxied(url: string): string {
  if (!url) return url
  if (url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) return url
  return `/api/proxy-image?url=${encodeURIComponent(url)}`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = proxied(url)
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  // ponytail: inline polyfill — ctx.roundRect missing on older iOS Safari.
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Draws the logo mark + "ModeMorph" wordmark in the bottom-left corner. */
function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, onPhoto: boolean) {
  const pad = Math.round(w * 0.045)
  const fontSize = Math.max(22, Math.round(w * 0.05))
  const mark = Math.round(fontSize * 1.3)
  const mx = pad
  const my = h - pad - mark

  if (onPhoto) {
    // Scrim so the wordmark stays readable over any photo.
    const scrimH = mark + pad * 2.2
    const scrim = ctx.createLinearGradient(0, h - scrimH, 0, h)
    scrim.addColorStop(0, "rgba(0,0,0,0)")
    scrim.addColorStop(1, "rgba(0,0,0,0.45)")
    ctx.fillStyle = scrim
    ctx.fillRect(0, h - scrimH, w, scrimH)
  }

  // Gradient logo mark with a white "M".
  const grad = ctx.createLinearGradient(mx, my, mx + mark, my + mark)
  grad.addColorStop(0, BRAND_FROM)
  grad.addColorStop(1, BRAND_TO)
  roundRect(ctx, mx, my, mark, mark, mark * 0.28)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.fillStyle = "#ffffff"
  ctx.font = `800 ${Math.round(mark * 0.62)}px ${FONT}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("M", mx + mark / 2, my + mark / 2 + mark * 0.04)

  // Wordmark.
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.font = `700 ${fontSize}px ${FONT}`
  ctx.fillStyle = onPhoto ? "#ffffff" : "#292929"
  ctx.fillText("ModeMorph", mx + mark + pad * 0.5, my + mark / 2)
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))), "image/png")
  })
}

/** Watermarked copy of a single photo (e.g. a try-on result). */
export async function renderSinglePhoto(url: string): Promise<Blob> {
  const img = await loadImage(url)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  drawWatermark(ctx, canvas.width, canvas.height, true)
  return toBlob(canvas)
}

/** Composed grid of item photos for a saved образ. Skips missing/placeholder urls. */
export async function renderLookGrid(urls: string[], title: string): Promise<Blob> {
  const valid = urls.filter((u) => u && !u.endsWith("/placeholder.svg")).slice(0, 6)
  if (valid.length === 0) throw new Error("No item images to render")

  const W = 1080
  const P = 52
  const gap = 28
  const cols = valid.length === 1 ? 1 : valid.length <= 4 ? 2 : 3
  const rows = Math.ceil(valid.length / cols)
  const cell = Math.round((W - 2 * P - (cols - 1) * gap) / cols)

  const titleH = title ? 96 : P
  const footerH = 150
  const gridH = rows * cell + (rows - 1) * gap
  const H = titleH + gridH + footerH

  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!

  // Background.
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, W, H)

  // Title.
  if (title) {
    ctx.fillStyle = "#292929"
    ctx.font = `700 40px ${FONT}`
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(truncate(ctx, title, W - 2 * P), P, titleH - 30)
  }

  // Item cards.
  const images = await Promise.all(valid.map((u) => loadImage(u).catch(() => null)))
  images.forEach((img, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    const x = P + c * (cell + gap)
    const y = titleH + r * (cell + gap)
    roundRect(ctx, x, y, cell, cell, 24)
    ctx.fillStyle = "#f4f4f6"
    ctx.fill()
    if (!img) return
    // Contain the image within the cell with a little inset.
    const inset = cell * 0.08
    const boxW = cell - inset * 2
    const boxH = cell - inset * 2
    const scale = Math.min(boxW / img.width, boxH / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, x + (cell - dw) / 2, y + (cell - dh) / 2, dw, dh)
  })

  drawWatermark(ctx, W, H, false)
  return toBlob(canvas)
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1)
  return t + "…"
}

/**
 * Best-effort native share of the rendered blob. Returns true if the OS share
 * sheet opened. On Telegram/iOS this often isn't available — the caller falls
 * back to the long-press hint, which always works.
 */
export async function shareBlob(blob: Blob, fileName: string, title?: string): Promise<boolean> {
  const file = new File([blob], fileName, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: any) => boolean }
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title })
      return true
    } catch (e: any) {
      if (e?.name === "AbortError") return true // user cancelled — not an error
    }
  }
  return false
}
