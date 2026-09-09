import { api } from "@/lib/api-client"

export async function startRoboPayment(
  amount: number,
  description?: string,
  meta?: Record<string, any> // что сделать после оплаты: {action:"subscribe",type}
) {
  // Backend is authoritative on the price — it resolves it from `meta`
  // (subscription_pricing) and returns the Robokassa URL.
  const data = await api.post("/api/payments/robokassa/create", {
    amount,
    description,
    meta,
  })
  if (!data?.url) throw new Error(data?.error || "Не удалось создать платёж")
  window.location.href = data.url
  return data.invoice_id as number
}
