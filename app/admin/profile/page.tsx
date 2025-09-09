import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getUser } from "@/lib/get-user"
import { cookies } from "next/headers"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { User, Mail, Calendar, Shield, LogOut } from "lucide-react"
import { signOut } from "@/lib/actions"

export default async function ProfilePage() {
  const supabase = createClient()
  const user = await getUser(cookies().toString())

  if (!user) {
    redirect("/auth/login")
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  }

  const getUserInitials = (email: string | undefined) => {
    if (!email) return "U"
    return email.charAt(0).toUpperCase()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="max-w-2xl mx-auto">
          {/* Заголовок */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Профиль администратора</h1>
              <p className="text-gray-600">Информация о вашем аккаунте</p>
            </div>
            <form action={signOut}>
              <Button variant="outline" className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                Выйти
              </Button>
            </form>
          </div>

          {/* Основная информация */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <User className="h-5 w-5" />
                Основная информация
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-6">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-blue-600 text-white text-2xl">
                    {getUserInitials(user.email)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Email:</span>
                    <span className="font-medium">{user.email}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Дата регистрации:</span>
                    <span className="font-medium">{formatDate(user.created_at)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Статус:</span>
                    <Badge variant="default" className="bg-red-600">
                      Администратор
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Email:</span>
                    <Badge variant={user.email_confirmed_at ? "default" : "secondary"}>
                      {user.email_confirmed_at ? "Подтвержден" : "Не подтвержден"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Дополнительная информация */}
          <Card>
            <CardHeader>
              <CardTitle>Детали аккаунта</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">ID пользователя</div>
                  <div className="font-mono text-xs break-all">{user.id}</div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Последний вход</div>
                  <div className="font-medium">
                    {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "Неизвестно"}
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Провайдер</div>
                  <div className="font-medium capitalize">{user.app_metadata?.provider || "Email"}</div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Роль</div>
                  <div className="font-medium">Администратор</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
