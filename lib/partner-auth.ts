// lib/partner-auth.ts — types only (server logic moved to FastAPI backend)

export interface PartnerProfile {
  id: number
  user_id: string
  company_name: string
  contact_name: string
  website: string | null
  description: string | null
  status: "pending" | "approved" | "rejected" | "suspended"
  rejected_reason: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}
