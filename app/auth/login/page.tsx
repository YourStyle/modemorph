import { AuthLayout } from "@/components/auth-layout"
import ModernLoginForm from "@/components/modern-login-form"
import { TelegramLoginButton } from "@/components/auth/telegram-login-button"

export default function LoginPage() {
  return (
    <AuthLayout showBackButton>
      <div className="mt-4">
        <TelegramLoginButton />
      </div>
      <ModernLoginForm />
    </AuthLayout>
  )
}
