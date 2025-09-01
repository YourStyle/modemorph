export async function startRoboPayment(
  amount: number,
  description?: string,
  meta?: Record<string, any> // ← что нужно сделать после оплаты
) {
  const r = await fetch("/api/payments/robokassa/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, description, meta })
  })
  const data = await r.json()
  if (!data?.success) throw new Error(data?.error || "Не удалось создать платёж")
  window.location.href = data.redirectUrl
  return data.paymentId as string
}
