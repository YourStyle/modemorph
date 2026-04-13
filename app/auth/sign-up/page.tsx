import { AuthLayout } from "@/components/auth-layout"
import ModernSignupForm from "@/components/modern-signup-form"

export default function SignUpPage() {
  return (
    <AuthLayout showBackButton>
      <ModernSignupForm />
    </AuthLayout>
  )
}
