// Уровень 2 liquid glass (test/gauntlet/design/LIQUID_GLASS.md): карта смещения
// для общего SVG-фильтра #mm-glass, объявленного в app/layout.tsx.
//
// R-канал = смещение по X, G-канал = смещение по Y, 128 = отсутствие смещения.
// По статье backdrop-filter не подгоняет размер фильтра под элемент, поэтому карта
// генерируется под фиксированный «типовой» прямоугольник хрома (таб-бар/шапка —
// во весь борт экрана, высота — бар с safe-area). Свечение сильнее у верхней грани
// и по бокам, к центру и книзу гаснет — это тот же rim-light принцип, что и в
// box-shadow уровня 1 (ярче сверху, слабее снизу), только выраженный смещением
// пикселей, а не тенью. Для шапки (короче бара) карта просто обрезается сверху —
// там как раз сосредоточен блик, так что кроп не портит эффект.
//
// Только Chromium читает url() в backdrop-filter — см. LIQUID_GLASS.md. Сборка через
// маленькую функцию, а не рантайм-ResizeObserver: одна общая карта на всё приложение,
// без пересчётов на ресайз.
export function buildLiquidGlassDisplacementMap(width = 400, height = 96): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="dx" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgb(158,128,128)" />
        <stop offset="16%" stop-color="rgb(128,128,128)" />
        <stop offset="84%" stop-color="rgb(128,128,128)" />
        <stop offset="100%" stop-color="rgb(100,128,128)" />
      </linearGradient>
      <linearGradient id="dy" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgb(128,156,128)" />
        <stop offset="30%" stop-color="rgb(128,128,128)" />
        <stop offset="100%" stop-color="rgb(128,128,128)" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="rgb(128,128,128)" />
    <rect width="100%" height="100%" fill="url(#dx)" opacity="0.85" />
    <rect width="100%" height="100%" fill="url(#dy)" opacity="0.85" />
  </svg>`

    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Фиксированный размер карты — под ширину экрана хрома и высоту таб-бара с safe-area.
export const LIQUID_GLASS_MAP_WIDTH = 400
export const LIQUID_GLASS_MAP_HEIGHT = 96
export const LIQUID_GLASS_DISPLACEMENT_MAP = buildLiquidGlassDisplacementMap(
    LIQUID_GLASS_MAP_WIDTH,
    LIQUID_GLASS_MAP_HEIGHT,
)
