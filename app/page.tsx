import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AnimatedLanding } from "@/components/animated-landing"

export default async function HomePage() {
  // If Supabase is not configured, show setup message directly
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Подключите Supabase</h1>
          <p className="text-gray-600">Для начала работы необходимо настроить подключение к Supabase</p>
        </div>
      </div>
    )
  }

  const supabase = createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  // Если пользователь авторизован, проверяем его роль и перенаправляем
  if (user) {
    try {
      const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("user_id", user.id).single()

      if (profile?.is_admin) {
        redirect("/admin")
      } else {
        redirect("/app")
      }
    } catch (error) {
      // Если профиля нет, создаем его как админа и перенаправляем
      await supabase.from("user_profiles").insert({
        user_id: user.id,
        is_admin: true,
      })
      redirect("/admin")
    }
  }

  // Показываем анимированный лендинг для неавторизованных пользователей
  return <AnimatedLanding />
}
