"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Upload, Loader2, Check, AlertCircle } from "lucide-react"
import Image from "next/image"

interface ImageUploadFormProps {
  onSuccess?: () => void
}

interface AnalysisResult {
  item_name: string
  material: string
  shade: string
  style: string
  has_print: boolean
  has_details: boolean
  basic_item_id?: number
}

export function ImageUploadForm({ onSuccess }: ImageUploadFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
      setError(null)
      setAnalysisResult(null)
      setSuccess(false)
    }
  }

  const downloadAndUploadImage = async (imageUrl: string): Promise<string> => {
    try {
      // Download the image
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error("Failed to download image")
      }

      const blob = await response.blob()
      const file = new File([blob], "analyzed-image.jpg", { type: blob.type })

      // Upload to blob storage
      const formData = new FormData()
      formData.append("file", file)

      const uploadResponse = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image to storage")
      }

      const uploadResult = await uploadResponse.json()
      return uploadResult.url
    } catch (error) {
      console.error("Error downloading and uploading image:", error)
      throw error
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setError(null)

    try {
      // Step 1: Upload image
      const formData = new FormData()
      formData.append("file", selectedFile)

      const uploadResponse = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image")
      }

      const uploadResult = await uploadResponse.json()
      setUploading(false)
      setAnalyzing(true)

      // Step 2: Analyze image with AI
      const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL
      if (!aiApiUrl) {
        throw new Error("AI API URL not configured")
      }

      const analysisResponse = await fetch(`${aiApiUrl}/analyze-clothing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: uploadResult.url,
        }),
      })

      if (!analysisResponse.ok) {
        throw new Error("Failed to analyze image")
      }

      const analysis = await analysisResponse.json()
      setAnalyzing(false)
      setSaving(true)

      // Step 3: Process image URL if needed
      let finalImageUrl = uploadResult.url

      if (analysis.img_url && analysis.img_url !== uploadResult.url) {
        try {
          finalImageUrl = await downloadAndUploadImage(analysis.img_url)
        } catch (error) {
          console.error("Failed to process AI image, using original:", error)
          // Continue with original image if processing fails
        }
      }

      // Step 4: Save to wardrobe
      const saveResponse = await fetch("/api/wardrobe-user-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item_name: analysis.item_name,
          material: analysis.material,
          shade: analysis.shade,
          style: analysis.style,
          has_print: analysis.has_print || false,
          has_details: analysis.has_details || false,
          image_url: finalImageUrl,
          basic_item_id: analysis.basic_item_id || null,
        }),
      })

      if (!saveResponse.ok) {
        throw new Error("Failed to save item to wardrobe")
      }

      setAnalysisResult(analysis)
      setSuccess(true)
      setSaving(false)

      // Call success callback after a short delay
      setTimeout(() => {
        onSuccess?.()
      }, 2000)
    } catch (error) {
      console.error("Upload error:", error)
      setError(error instanceof Error ? error.message : "An error occurred")
      setUploading(false)
      setAnalyzing(false)
      setSaving(false)
    }
  }

  const resetForm = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setError(null)
    setAnalysisResult(null)
    setSuccess(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const isProcessing = uploading || analyzing || saving

  return (
    <div className="space-y-6">
      {!success && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="image-upload">Select Image</Label>
            <Input
              ref={fileInputRef}
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              disabled={isProcessing}
              className="mt-1"
            />
          </div>

          {previewUrl && (
            <Card>
              <CardContent className="p-4">
                <div className="relative w-full h-64">
                  <Image
                    src={previewUrl || "/placeholder.svg"}
                    alt="Preview"
                    fill
                    className="object-contain rounded-md"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleUpload} disabled={!selectedFile || isProcessing} className="flex-1">
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {analyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!isProcessing && <Upload className="mr-2 h-4 w-4" />}
              {uploading && "Uploading..."}
              {analyzing && "Analyzing..."}
              {saving && "Saving..."}
              {!isProcessing && "Upload & Analyze"}
            </Button>

            {selectedFile && !isProcessing && (
              <Button variant="outline" onClick={resetForm}>
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {success && analysisResult && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Check className="h-5 w-5 text-green-600" />
              <h3 className="text-lg font-semibold text-green-600">Item Added Successfully!</h3>
            </div>

            <div className="space-y-2">
              <p>
                <strong>Item:</strong> {analysisResult.item_name}
              </p>
              <p>
                <strong>Material:</strong> {analysisResult.material}
              </p>
              <p>
                <strong>Color:</strong> {analysisResult.shade}
              </p>
              <p>
                <strong>Style:</strong> {analysisResult.style}
              </p>
              {analysisResult.has_print && (
                <p>
                  <strong>Has Print:</strong> Yes
                </p>
              )}
              {analysisResult.has_details && (
                <p>
                  <strong>Has Details:</strong> Yes
                </p>
              )}
            </div>

            <Button onClick={resetForm} className="mt-4 w-full">
              Add Another Item
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
