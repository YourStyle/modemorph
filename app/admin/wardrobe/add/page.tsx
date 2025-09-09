import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getUser } from "@/lib/get-user"
import { cookies } from "next/headers"
import { AddWardrobeItemForm } from "@/components/add-wardrobe-item-form"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default async function AddWardrobeItemPage() {
  // Проверяем авторизацию
  const supabase = createClient()
  const user = await getUser(cookies().toString())

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Навигация */}
          <div className="mb-6">
            <Link href="/admin/wardrobe">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад к гардеробу
              </Button>
            </Link>
          </div>

          {/* Заголовок */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Добавить новую вещь</h1>
            <p className="text-gray-600">Заполните форму, чтобы добавить новую вещь в свой гардероб</p>
          </div>

          {/* Форма добавления */}
          <AddWardrobeItemForm />
        </div>
      </div>
    </div>
  )
}
