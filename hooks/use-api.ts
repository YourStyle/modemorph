// hooks/use-api.ts
// Хук для удобного использования API с состоянием загрузки

import { useState, useCallback } from 'react'
import { type ApiResponse } from '@/lib/api-transport'

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface UseApiOptions {
  onSuccess?: (data: any) => void
  onError?: (error: string) => void
}

export function useApi<T = any>() {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null
  })

  const execute = useCallback(async <R = T>(
    apiCall: () => Promise<ApiResponse<R>>,
    options?: UseApiOptions
  ): Promise<ApiResponse<R>> => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await apiCall()

      if (response.ok && response.data) {
        setState({
          data: response.data as T,
          loading: false,
          error: null
        })
        options?.onSuccess?.(response.data)
      } else {
        setState({
          data: null,
          loading: false,
          error: response.error || 'Unknown error'
        })
        options?.onError?.(response.error || 'Unknown error')
      }

      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error'
      setState({
        data: null,
        loading: false,
        error: errorMessage
      })
      options?.onError?.(errorMessage)

      return {
        error: errorMessage,
        status: 0,
        ok: false
      }
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null
    })
  }, [])

  return {
    ...state,
    execute,
    reset
  }
}

// Специализированные хуки для часто используемых операций
export function useUserProfile() {
  const api = useApi()

  const loadProfile = useCallback((options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.user.getProfile()
    }, options)
  }, [api])

  return {
    ...api,
    loadProfile
  }
}

export function useUserLooks() {
  const api = useApi()

  const loadLooks = useCallback((options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.userLooks.getAll()
    }, options)
  }, [api])

  const createLook = useCallback((lookData: any, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.userLooks.create(lookData)
    }, options)
  }, [api])

  const deleteLook = useCallback((id: string, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.userLooks.delete(id)
    }, options)
  }, [api])

  return {
    ...api,
    loadLooks,
    createLook,
    deleteLook
  }
}

export function useOutfits() {
  const api = useApi()

  const loadOutfits = useCallback((limit?: number, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.outfits.getAll(limit)
    }, options)
  }, [api])

  const createOutfit = useCallback((outfitData: any, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.outfits.create(outfitData)
    }, options)
  }, [api])

  const updateOutfit = useCallback((id: string, outfitData: any, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.outfits.update(id, outfitData)
    }, options)
  }, [api])

  const deleteOutfit = useCallback((id: string, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.outfits.delete(id)
    }, options)
  }, [api])

  const toggleLike = useCallback((outfitId: string, action: 'like' | 'unlike', options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.outfits.toggleLike(outfitId, action)
    }, options)
  }, [api])

  const getInspiration = useCallback((limit?: number, gender?: string, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.outfits.getInspiration(limit, gender)
    }, options)
  }, [api])

  return {
    ...api,
    loadOutfits,
    createOutfit,
    updateOutfit,
    deleteOutfit,
    toggleLike,
    getInspiration
  }
}

export function useWardrobe() {
  const api = useApi()

  const loadItems = useCallback((search?: string, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.wardrobe.getAll(search)
    }, options)
  }, [api])

  const createItem = useCallback((itemData: any, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.wardrobe.create(itemData)
    }, options)
  }, [api])

  const updateItem = useCallback((id: string, itemData: any, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.wardrobe.update(id, itemData)
    }, options)
  }, [api])

  const deleteItem = useCallback((id: string, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.wardrobe.delete(id)
    }, options)
  }, [api])

  const addItem = useCallback((formData: FormData, options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.wardrobe.add(formData)
    }, options)
  }, [api])

  const getCount = useCallback((options?: UseApiOptions) => {
    return api.execute(async () => {
      const { API } = await import('@/lib/api')
      return API.wardrobe.getCount()
    }, options)
  }, [api])

  return {
    ...api,
    loadItems,
    createItem,
    updateItem,
    deleteItem,
    addItem,
    getCount
  }
}