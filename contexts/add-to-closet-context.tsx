"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"

interface UploadedPhoto {
  file: File
  preview: string
  id: string
}

interface AddToClosetContextType {
  isOpen: boolean
  initialPhotos: UploadedPhoto[]
  openSheet: (photos?: UploadedPhoto[]) => void
  closeSheet: () => void
  onAnalysisSuccess: ((payload: any) => void) | null
  setOnAnalysisSuccess: (callback: ((payload: any) => void) | null) => void
}

const AddToClosetContext = createContext<AddToClosetContextType | undefined>(undefined)

export function AddToClosetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialPhotos, setInitialPhotos] = useState<UploadedPhoto[]>([])
  const [onAnalysisSuccess, setOnAnalysisSuccess] = useState<((payload: any) => void) | null>(null)

  const openSheet = useCallback((photos?: UploadedPhoto[]) => {
    console.log("[AddToClosetContext] openSheet called with photos:", photos)
    setInitialPhotos(photos || [])
    setIsOpen(true)
  }, [])

  const closeSheet = useCallback(() => {
    console.log("[AddToClosetContext] closeSheet called")
    setIsOpen(false)
    setInitialPhotos([])
  }, [])

  return (
    <AddToClosetContext.Provider
      value={{
        isOpen,
        initialPhotos,
        openSheet,
        closeSheet,
        onAnalysisSuccess,
        setOnAnalysisSuccess,
      }}
    >
      {children}
    </AddToClosetContext.Provider>
  )
}

export function useAddToCloset() {
  const context = useContext(AddToClosetContext)
  if (!context) {
    throw new Error("useAddToCloset must be used within AddToClosetProvider")
  }
  return context
}
