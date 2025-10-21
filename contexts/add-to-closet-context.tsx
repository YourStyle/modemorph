"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"

interface AddToClosetContextType {
  registerOpenHandler: (handler: () => void) => void
  unregisterOpenHandler: () => void
  openSheet: () => void
}

const AddToClosetContext = createContext<AddToClosetContextType | undefined>(undefined)

export function AddToClosetProvider({ children }: { children: ReactNode }) {
  const [openHandler, setOpenHandler] = useState<(() => void) | null>(null)

  const registerOpenHandler = useCallback((handler: () => void) => {
    setOpenHandler(() => handler)
  }, [])

  const unregisterOpenHandler = useCallback(() => {
    setOpenHandler(null)
  }, [])

  const openSheet = useCallback(() => {
    if (openHandler) {
      openHandler()
    }
  }, [openHandler])

  return (
    <AddToClosetContext.Provider
      value={{
        registerOpenHandler,
        unregisterOpenHandler,
        openSheet,
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
