"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Upload, Trash2, RefreshCw } from "lucide-react"

interface FileInfo {
  key: string
  size: number
  lastModified: Date
}

export function YandexS3Test() {
  const [isUploading, setIsUploading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [prefix, setPrefix] = useState("test")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadResult(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadResult({ success: false, message: "Please select a file first" })
      return
    }

    setIsUploading(true)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("prefix", prefix)

      console.log("Uploading file:", {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        prefix,
      })

      const response = await fetch("/api/upload-to-yandex", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      console.log("Upload response:", result)

      if (result.success) {
        setUploadResult({
          success: true,
          message: `File uploaded successfully! URL: ${result.url}`,
        })
        setSelectedFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
        // Обновляем список файлов
        await loadFiles()
      } else {
        setUploadResult({
          success: false,
          message: result.error || "Upload failed",
        })
      }
    } catch (error) {
      console.error("Upload error:", error)
      setUploadResult({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const loadFiles = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/yandex-s3/list")
      const result = await response.json()

      if (result.success) {
        setFiles(result.files || [])
      } else {
        console.error("Failed to load files:", result.error)
      }
    } catch (error) {
      console.error("Error loading files:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const deleteFile = async (key: string) => {
    try {
      const response = await fetch(`/api/yandex-s3/delete?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (result.success) {
        // Обновляем список файлов
        await loadFiles()
      } else {
        console.error("Failed to delete file:", result.error)
      }
    } catch (error) {
      console.error("Error deleting file:", error)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Yandex S3 Upload Test</CardTitle>
          <CardDescription>Test uploading files to Yandex Cloud Object Storage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prefix">Prefix (folder)</Label>
            <Input id="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="test" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Select File</Label>
            <Input id="file" type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" />
          </div>

          {selectedFile && (
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-sm">
                <strong>Selected:</strong> {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
              <p className="text-sm text-gray-600">Type: {selectedFile.type}</p>
            </div>
          )}

          <Button onClick={handleUpload} disabled={isUploading || !selectedFile} className="w-full">
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </>
            )}
          </Button>

          {uploadResult && (
            <Alert className={uploadResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <AlertDescription className={uploadResult.success ? "text-green-800" : "text-red-800"}>
                {uploadResult.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Files in Bucket</CardTitle>
            <CardDescription>Files stored in the Yandex S3 bucket</CardDescription>
          </div>
          <Button onClick={loadFiles} disabled={isLoading} variant="outline" size="sm">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No files found. Upload some files to see them here.</p>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div key={file.key} className="flex items-center justify-between p-3 border rounded-md">
                  <div className="flex-1">
                    <p className="font-medium">{file.key}</p>
                    <p className="text-sm text-gray-600">
                      {formatFileSize(file.size)} • {file.lastModified.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => window.open(`https://storage.yandexcloud.net/modemorphs3/${file.key}`, "_blank")}
                      variant="outline"
                      size="sm"
                    >
                      View
                    </Button>
                    <Button
                      onClick={() => deleteFile(file.key)}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
