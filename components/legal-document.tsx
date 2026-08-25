import Link from "next/link"
import { ArrowLeft } from "lucide-react"

// ponytail: текст — просто строки с \n. Заголовок раздела = строка вида «1. Название»
// (пункты «1.1. …» не подходят, т.к. после точки идёт цифра). Markdown-парсер тут не нужен.
const isHeading = (line: string) => /^\d+\.?\s*[А-ЯЁ]/.test(line)

export function LegalDocument({ title, text }: { title: string; text: string }) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-caption text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          На главную
        </Link>

        <h1 className="mt-4 text-display text-ink">{title}</h1>

        <div className="mt-6">
          {text.split("\n").map((line, i) =>
            isHeading(line) ? (
              <h2 key={i} className="mb-2 mt-6 text-body font-medium text-ink">
                {line}
              </h2>
            ) : (
              <p key={i} className="mb-2 text-caption leading-relaxed text-ink-2">
                {line}
              </p>
            ),
          )}
        </div>
      </div>
    </main>
  )
}
