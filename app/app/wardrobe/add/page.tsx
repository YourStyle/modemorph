"use client"

import { ImageUploadForm } from "@/components/image-upload-form"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

export default function AddToWardrobePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="p-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold">Добавить в гардероб</h1>
        </div>
      </div>

      <div className="px-4 py-6">
        <ImageUploadForm />
      </div>
    </div>
  )
}
