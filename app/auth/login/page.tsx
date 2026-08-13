import { AuthLayout } from "@/components/auth-layout"
import ModernLoginForm from "@/components/modern-login-form"
import { TelegramLoginButton } from "@/components/auth/telegram-login-button"
import { YandexLoginButton } from "@/components/auth/yandex-login-button"

export default function LoginPage() {
  return (
    <AuthLayout showBackButton>
      <div className="text-center min-[500px]:text-left">
        <h1 className="text-display text-ink">Добро пожаловать</h1>
        <p className="mt-1 text-body text-ink-2">Войдите — и продолжите собирать гардероб</p>
      </div>

      <div className="mt-6 space-y-3">
        <div>
          <p className="mb-2 text-micro text-ink-3">Быстрый вход</p>
          <TelegramLoginButton />
        </div>
        <YandexLoginButton />
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-caption text-ink-3">или по почте</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <ModernLoginForm />
    </AuthLayout>
  )
}
