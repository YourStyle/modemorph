// app/mini-registration/page.tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function MiniRegistrationPage() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    gender: "",
    height: "",
    weight: "",
    top_size: "",
    bottom_size: "",
    shoe_size: "",
    referral: "",
  })
  const router = useRouter()
  const supabase = createClient()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleNext = () => setStep(step + 1)

  const handleSubmit = async () => {
    // Сохраняем данные в таблицу user_profiles
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      alert("Не удалось получить пользователя")
      return
    }
    const { error } = await supabase
      .from("user_profiles")
      .update({
        gender: form.gender,
        height: form.height,
        weight: form.weight,
        top_size: form.top_size,
        bottom_size: form.bottom_size,
        shoe_size: form.shoe_size,
        referral: form.referral,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
    if (error) {
      alert("Ошибка сохранения профиля")
      return
    }
    // Возврат к приложению
    router.replace("/")
  }

  // Набросок многошаговой формы
  if (step === 1) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Шаг 1: Основные данные</h1>
        <div className="mt-4 space-y-3">
          <label>
            Пол:
            <select name="gender" value={form.gender} onChange={handleChange} className="w-full border rounded px-2 py-1">
              <option value="">Выберите</option>
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
            </select>
          </label>
          <label>
            Рост (см):
            <input name="height" value={form.height} onChange={handleChange} type="number"
                   className="w-full border rounded px-2 py-1" />
          </label>
          <label>
            Вес (кг):
            <input name="weight" value={form.weight} onChange={handleChange} type="number"
                   className="w-full border rounded px-2 py-1" />
          </label>
          <button onClick={handleNext} className="w-full bg-black text-white py-2 rounded">
            Далее
          </button>
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Шаг 2: Размеры одежды</h1>
        <div className="mt-4 space-y-3">
          <label>
            Размер верхней одежды:
            <input name="top_size" value={form.top_size} onChange={handleChange} type="text"
                   className="w-full border rounded px-2 py-1" />
          </label>
          <label>
            Размер нижней одежды:
            <input name="bottom_size" value={form.bottom_size} onChange={handleChange} type="text"
                   className="w-full border rounded px-2 py-1" />
          </label>
          <label>
            Размер обуви:
            <input name="shoe_size" value={form.shoe_size} onChange={handleChange} type="text"
                   className="w-full border rounded px-2 py-1" />
          </label>
          <button onClick={handleNext} className="w-full bg-black text-white py-2 rounded">
            Далее
          </button>
        </div>
      </div>
    )
  }

  // Последний шаг — источник (откуда узнал)
  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Шаг 3: Как вы узнали о нас?</h1>
      <div className="mt-4 space-y-3">
        <label>
          Источник:
          <input name="referral" value={form.referral} onChange={handleChange} type="text"
                 className="w-full border rounded px-2 py-1" />
        </label>
        <button onClick={handleSubmit} className="w-full bg-black text-white py-2 rounded">
          Сохранить
        </button>
      </div>
    </div>
  )
}
