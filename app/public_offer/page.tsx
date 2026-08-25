import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal-document"
import { PUBLIC_OFFER } from "@/content/legal"

export const metadata: Metadata = {
  title: "Публичная оферта — ModeMorph",
  description: "Публичная оферта о заключении договора об оказании услуг ModeMorph",
}

export default function PublicOfferPage() {
  return <LegalDocument title="Публичная оферта" text={PUBLIC_OFFER} />
}
