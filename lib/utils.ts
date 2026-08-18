import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tailwind-merge разрешает конфликты классов, зная стандартные группы Tailwind.
// Наша типографическая шкала (text-display/h1/h2/body/caption/micro, объявлена
// в tailwind.config.ts) в этот список не входит, поэтому по умолчанию merge
// принимал, например, text-caption за ЦВЕТ текста — та же группа, что text-ink.
// При конфликте остаётся последний класс, и там, где цвет написан раньше
// размера, цвет молча выбрасывался: текст красился унаследованным.
//
// Так пропала надпись на кнопке «Управление» в профиле — белый text-signal-ink
// выбрасывался классом text-caption, и оставался тёмный текст на чёрной кнопке.
// В проекте 275 мест сочетают наш размер с цветом, в 18 из них порядок был
// «цвет, потом размер», то есть мина лежала в каждом.
//
// Регистрируем шкалу в группе font-size: размеры и цвета перестают
// конфликтовать, и порядок классов больше ничего не решает.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "body", "caption", "micro"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
