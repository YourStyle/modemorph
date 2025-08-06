export interface OutfitData {
  id: number
  name: string
  description?: string
  season?: string
  occasion?: string
  preview_image_url: string
  likes: number
  views_count: number
  favorites_count: number
  created_at: string
  updated_at: string
  outfit_items?: {
    id: number
    position?: number
    wardrobe_items: {
      id: number
      item_name: string
      image_url?: string
      clothing_type?: string
      color?: string
      basic_wardrobe_items?: {
        name_ru: string
        name_en: string
      }
    }
  }[]
}

export interface CreateOutfitRequest {
  name: string
  description?: string
  season?: string
  occasion?: string
  preview_image_url: string
  item_ids: number[]
}

export interface UpdateOutfitRequest {
  name?: string
  description?: string
  season?: string
  occasion?: string
  preview_image_url?: string
  item_ids?: number[]
}

export async function createOutfit(data: CreateOutfitRequest): Promise<OutfitData> {
  const response = await fetch('/api/outfits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to create outfit')
  }

  const result = await response.json()
  return result.outfit
}

export async function updateOutfit(id: string | number, data: UpdateOutfitRequest): Promise<OutfitData> {
  const response = await fetch(`/api/outfits/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to update outfit')
  }

  const result = await response.json()
  return result.outfit
}

export async function getOutfitById(id: string | number): Promise<OutfitData> {
  const response = await fetch(`/api/outfits/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to get outfit')
  }

  const result = await response.json()
  return result.outfit
}

export async function getOutfits(): Promise<OutfitData[]> {
  const response = await fetch('/api/outfits', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to get outfits')
  }

  const result = await response.json()
  return result.outfits || []
}

export async function deleteOutfit(id: string | number): Promise<void> {
  const response = await fetch(`/api/outfits/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to delete outfit')
  }
}

export async function incrementViewCount(id: string | number): Promise<void> {
  try {
    const response = await fetch(`/api/outfits/${id}/view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to increment view count')
    }
  } catch (error) {
    console.error('Error incrementing view count:', error)
  }
}
