/**
 * Maps color names (Russian & English) → hex values for CSS rendering.
 * AI detection returns Russian color names; this map normalises them for display.
 */

const COLOR_MAP: Record<string, string> = {
  // ── Russian ──
  белый: "#FFFFFF",
  чёрный: "#000000",
  черный: "#000000",
  серый: "#808080",
  красный: "#DC2626",
  синий: "#2563EB",
  голубой: "#60A5FA",
  зелёный: "#16A34A",
  зеленый: "#16A34A",
  жёлтый: "#EAB308",
  желтый: "#EAB308",
  оранжевый: "#EA580C",
  розовый: "#EC4899",
  фиолетовый: "#9333EA",
  сиреневый: "#A78BFA",
  лиловый: "#C084FC",
  бежевый: "#D2B48C",
  коричневый: "#92400E",
  бордовый: "#881337",
  бургунди: "#800020",
  марсала: "#986868",
  хаки: "#78866B",
  оливковый: "#6B7F3B",
  мятный: "#A7F3D0",
  бирюзовый: "#06B6D4",
  лавандовый: "#C4B5FD",
  персиковый: "#FDBA74",
  коралловый: "#F87171",
  горчичный: "#CA8A04",
  терракотовый: "#C2410C",
  песочный: "#E2C08D",
  молочный: "#FEFCE8",
  кремовый: "#FFFDD0",
  "слоновая кость": "#FFFFF0",
  "слоновой кости": "#FFFFF0",
  золотой: "#D4A017",
  серебряный: "#C0C0C0",
  серебристый: "#C0C0C0",
  тёмно_синий: "#1E3A5F",
  "тёмно-синий": "#1E3A5F",
  "темно-синий": "#1E3A5F",
  "тёмно-зелёный": "#14532D",
  "темно-зеленый": "#14532D",
  "тёмно-серый": "#4B5563",
  "темно-серый": "#4B5563",
  "светло-серый": "#D1D5DB",
  "светло-голубой": "#BAE6FD",
  "светло-розовый": "#FBCFE8",
  "светло-зелёный": "#BBF7D0",
  "светло-зеленый": "#BBF7D0",
  "ярко-красный": "#EF4444",
  "тёмно-красный": "#991B1B",
  "темно-красный": "#991B1B",
  "тёмно-коричневый": "#78350F",
  "темно-коричневый": "#78350F",
  индиго: "#4338CA",
  пудровый: "#E8C4C4",
  графитовый: "#4A4A4A",
  стальной: "#71797E",
  джинсовый: "#4681BF",
  мультиколор: "#FF69B4",
  // ── English ──
  white: "#FFFFFF",
  black: "#000000",
  gray: "#808080",
  grey: "#808080",
  red: "#DC2626",
  blue: "#2563EB",
  green: "#16A34A",
  yellow: "#EAB308",
  orange: "#EA580C",
  pink: "#EC4899",
  purple: "#9333EA",
  violet: "#9333EA",
  brown: "#92400E",
  beige: "#D2B48C",
  navy: "#1E3A5F",
  burgundy: "#881337",
  khaki: "#78866B",
  olive: "#6B7F3B",
  mint: "#A7F3D0",
  turquoise: "#06B6D4",
  teal: "#0D9488",
  lavender: "#C4B5FD",
  coral: "#F87171",
  peach: "#FDBA74",
  cream: "#FFFDD0",
  ivory: "#FFFFF0",
  gold: "#D4A017",
  silver: "#C0C0C0",
  maroon: "#800000",
  indigo: "#4338CA",
  charcoal: "#4A4A4A",
  "light blue": "#BAE6FD",
  "dark blue": "#1E3A5F",
  "light green": "#BBF7D0",
  "dark green": "#14532D",
  "light grey": "#D1D5DB",
  "dark grey": "#4B5563",
  "light pink": "#FBCFE8",
  multicolor: "#FF69B4",
  "off-white": "#FAF9F6",
  "dark brown": "#5C3317",
  "light gray": "#D1D5DB",
  "light grey": "#D1D5DB",
  ecru: "#C2B280",
  camel: "#C19A6B",
  "navy blue": "#000080",
  fuchsia: "#FF00FF",
  taupe: "#483C32",
  "charcoal gray": "#36454F",
  "charcoal grey": "#36454F",
  "dark navy": "#000033",
  "light beige": "#EDE8D5",
  tan: "#D2B48C",
  "dark gray": "#4B5563",
  "dark grey": "#4B5563",
  "dark red": "#8B0000",
  "olive green": "#556B2F",
  "emerald green": "#50C878",
  lime: "#00FF00",
  "pale yellow": "#FFFFCC",
  "pastel pink": "#FFD1DC",
  "mint green": "#98FB98",
  "pale blue": "#ADD8E6",
  "pale pink": "#FFD5D5",
  plum: "#8E4585",
  "royal blue": "#4169E1",
  rust: "#B7410E",
  "sage green": "#9CAF88",
  terracotta: "#E2725B",
  champagne: "#F7E7CE",
  chocolate: "#7B3F00",
  cognac: "#9F381D",
  "dusty pink": "#D4A5A5",
  eggshell: "#F0EAD6",
  mauve: "#E0B0FF",
  "midnight blue": "#191970",
  "blush pink": "#FE828C",
  "cornflower blue": "#6495ED",
  // Russian extras
  шоколадный: "#7B3F00",
  "пастельно-розовый": "#FFD1DC",
  бежевая: "#D2B48C",
  золотистый: "#DAA520",
  "мятно-зелёный": "#98FB98",
  многоцветный: "#FF69B4",
  "молочно-белый": "#FEFCE8",
  вишнёвый: "#911938",
  антрацитовый: "#293133",
  антрацит: "#293133",
  "светло-бежевый": "#EDE8D5",
  "светло-коричневый": "#C4A882",
  "светло-хаки": "#BDB76B",
  "нежно-голубой": "#BAE6FD",
  "нежно-белый": "#FAFAFA",
  "оливково-зеленый": "#556B2F",
  "тёмно-бирюзовый": "#008080",
  "тёплый белый": "#FDF5E6",
  черная: "#000000",
  черные: "#000000",
  коричневыe: "#92400E",
}

/** Russian display names for common hex values (reverse lookup). */
const HEX_TO_RUSSIAN: Record<string, string> = {
  "#FFFFFF": "Белый",
  "#000000": "Чёрный",
  "#808080": "Серый",
  "#DC2626": "Красный",
  "#2563EB": "Синий",
  "#60A5FA": "Голубой",
  "#16A34A": "Зелёный",
  "#EAB308": "Жёлтый",
  "#EA580C": "Оранжевый",
  "#EC4899": "Розовый",
  "#9333EA": "Фиолетовый",
  "#D2B48C": "Бежевый",
  "#92400E": "Коричневый",
  "#881337": "Бордовый",
  "#78866B": "Хаки",
  "#06B6D4": "Бирюзовый",
  "#C4B5FD": "Лавандовый",
  "#FDBA74": "Персиковый",
  "#F87171": "Коралловый",
  "#1E3A5F": "Тёмно-синий",
  "#4338CA": "Индиго",
  "#C0C0C0": "Серебристый",
  "#D4A017": "Золотой",
  "#FFFDD0": "Кремовый",
  "#4A4A4A": "Графитовый",
  "#4681BF": "Джинсовый",
}

/**
 * Resolve a color value (name or hex) to a hex string for CSS.
 * Returns null if unrecognised.
 */
export function colorToHex(color: string | undefined | null): string | null {
  if (!color) return null
  const trimmed = color.trim()
  // Already hex
  if (/^#[0-9A-Fa-f]{3,8}$/.test(trimmed)) return trimmed
  // Try lookup (case-insensitive)
  const key = trimmed.toLowerCase()
  return COLOR_MAP[key] ?? null
}

/**
 * Get a Russian display label for a color value.
 * If the value is a known hex, returns the Russian name.
 * If it's a Russian name already, returns it capitalised.
 * Falls back to the original value.
 */
export function colorDisplayName(color: string | undefined | null): string {
  if (!color) return ""
  const trimmed = color.trim()
  // If hex → try reverse lookup
  if (/^#[0-9A-Fa-f]{3,8}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase()
    return HEX_TO_RUSSIAN[upper] ?? upper
  }
  // If it's a known color name, capitalise first letter
  const lower = trimmed.toLowerCase()
  if (COLOR_MAP[lower]) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
  }
  // Unknown — return as-is
  return trimmed
}
