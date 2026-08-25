import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal-document"
import { PRIVACY_POLICY } from "@/content/legal"

export const metadata: Metadata = {
  title: "Политика конфиденциальности — ModeMorph",
  description: "Политика в отношении обработки персональных данных ModeMorph",
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Политика в отношении обработки персональных данных"
      text={PRIVACY_POLICY}
    />
  )
}
