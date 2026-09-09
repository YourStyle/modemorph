"use client"

import { Toaster as SonnerToaster } from "sonner"

/**
 * Тосты sonner.
 *
 * До этого `<Toaster />` от sonner не был смонтирован НИГДЕ, хотя `toast` из
 * "sonner" зовётся из 18 файлов — вся страница образов, шторки, сохранение
 * картинки. Каждый такой вызов был тихим no-op: пользователь не видел ни
 * подтверждений, ни ошибок. В layout.tsx стоял только radix-Toaster, а он
 * слушает совсем другое хранилище (hooks/use-toast).
 *
 * Геометрия и материал — те же, что у radix-тостов (components/ui/toast.tsx):
 * сверху по центру, отступ из --toast-top, стекло уровня 1.
 *
 * Почему не `unstyled: true`: он снимает не только внешний вид, но и раскладку
 * самого sonner (позиционирование, ширину, transform стопки) — тост схлопывался
 * в 63px и уезжал за верхний край. Поэтому структура остаётся его, а вид
 * задаётся его же CSS-переменными плюс классом со стеклом.
 */
export function SonnerProvider() {
  return (
    <SonnerToaster
      position="top-center"
      // Именно объектом, а не строкой: скалярный offset sonner применяет ко
      // ВСЕМ четырём сторонам, поэтому левый и правый отступ тоже становились
      // 156px и тост схлопывался в 63px ширины.
      offset={{ top: "var(--toast-top)", left: "1rem", right: "1rem" }}
      mobileOffset={{ top: "var(--toast-top)", left: "1rem", right: "1rem" }}
      gap={8}
      duration={3500}
      style={
        {
          // Переменные самого sonner — так его дефолтные стили красятся
          // в наш холст, не ломая раскладку.
          "--normal-bg": "hsl(var(--canvas) / 0.62)",
          "--normal-text": "hsl(var(--ink))",
          "--normal-border": "transparent",
          "--border-radius": "22px",
          "--error-bg": "hsl(var(--destructive) / 0.16)",
          "--error-text": "hsl(var(--ink))",
          "--error-border": "transparent",
          "--success-bg": "hsl(var(--canvas) / 0.62)",
          "--success-text": "hsl(var(--ink))",
          "--success-border": "transparent",
          "--width": "calc(100vw - 2rem)",
        } as React.CSSProperties
      }
      toastOptions={{
        // mm-glass-toast — только материал (размытие и блик по грани),
        // определён в app/globals.css рядом с остальными стеклянными утилитами.
        className: "mm-glass-toast",
      }}
    />
  )
}
