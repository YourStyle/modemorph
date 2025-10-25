import { api } from "@/lib/api-client"

export async function startRoboPayment(
  amount: number,
  description?: string,
  meta?: Record<string, any> // ← что нужно сделать после оплаты
) {
  const data = await api.post("/api/payments/robokassa/create", {
    amount,
    description,
    meta
  })
  if (!data?.success) throw new Error(data?.error || "Не удалось создать платёж")
  window.location.href = data.redirectUrl
  return data.paymentId as string
}
