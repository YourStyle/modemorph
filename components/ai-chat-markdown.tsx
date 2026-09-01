"use client"

import React from "react"

/**
 * Лёгкий рендер ответа ассистента.
 *
 * Модель отвечает markdown-ом, а выводили мы его как обычный текст — на экране
 * были сырые звёздочки: «**Вещи, которые сложно сочетать:**». Полноценный
 * markdown-парсер сюда не нужен и запрещён контрактом (никаких новых
 * зависимостей), поэтому поддерживаем ровно то, что модели разрешено
 * использовать промптом: абзацы, **жирный**, списки «- » и «1. ».
 *
 * Всё остальное показываем как есть — это безопаснее, чем угадывать.
 */

// Внутренние идентификаторы вещей не должны попадать в текст: промпт это
// запрещает, но модель может сорваться, а «Серые леггинсы (ID: 1590)» читателю
// не говорит ничего. Подчищаем на выходе — дешевле, чем надеяться на модель.
const ID_NOISE = /\s*[([]\s*(?:ID|id|Id)\s*[:=]?\s*\d+\s*[)\]]/g

function stripIds(text: string): string {
  return text.replace(ID_NOISE, "")
}

/** **жирный** → <strong>. Остальное остаётся текстом. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  parts.forEach((part, i) => {
    if (!part) return
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      out.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>,
      )
    } else {
      out.push(<React.Fragment key={`${keyPrefix}-t${i}`}>{part}</React.Fragment>)
    }
  })
  return out
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd()
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const last = blocks[blocks.length - 1]

    if (bullet) {
      if (last?.kind === "ul") last.items.push(bullet[1])
      else blocks.push({ kind: "ul", items: [bullet[1]] })
    } else if (numbered) {
      if (last?.kind === "ol") last.items.push(numbered[1])
      else blocks.push({ kind: "ol", items: [numbered[1]] })
    } else if (!line.trim()) {
      // Пустая строка закрывает текущий блок — дальше начнётся новый абзац.
      if (last) blocks.push({ kind: "p", lines: [] })
    } else {
      if (last?.kind === "p") last.lines.push(line)
      else blocks.push({ kind: "p", lines: [line] })
    }
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : b.items.length > 0))
}

export function AiChatMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = React.useMemo(() => parseBlocks(stripIds(text)), [text])

  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        if (block.kind === "ul") {
          return (
            <ul key={bi} className="my-2 list-disc space-y-1 pl-5 marker:text-ink-3">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInline(item, `${bi}-${ii}`)}</li>
              ))}
            </ul>
          )
        }
        if (block.kind === "ol") {
          return (
            <ol key={bi} className="my-2 list-decimal space-y-1 pl-5 marker:text-ink-3">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInline(item, `${bi}-${ii}`)}</li>
              ))}
            </ol>
          )
        }
        return (
          <p key={bi} className="mb-2 last:mb-0">
            {block.lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line, `${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
