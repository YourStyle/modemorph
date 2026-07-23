import { AuthLayout } from "@/components/auth-layout"
import ModernLoginForm from "@/components/modern-login-form"
import { TelegramLoginButton } from "@/components/auth/telegram-login-button"
import { YandexLoginButton } from "@/components/auth/yandex-login-button"

export default function LoginPage() {
  return (
    <AuthLayout showBackButton>
      <div className="mt-4 space-y-3">
        <TelegramLoginButton />
        <YandexLoginButton />
      </div>
      <div className="my-6 flex items-center gap-3 text-xs text-gray-400">
        <div className="h-px flex-1 bg-gray-200" />
        <span>или по почте</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <ModernLoginForm />
    </AuthLayout>
  )
}
