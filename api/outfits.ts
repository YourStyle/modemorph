export interface Outfit {
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

export async function getOutfits(): Promise<Outfit[]> {
  try {
    const response = await fetch('/api/outfits', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch outfits')
    }

    const data = await response.json()
    return data.outfits || []
  } catch (error) {
    console.error('Error fetching outfits:', error)
    throw error
  }
}

export async function getOutfitById(id: string): Promise<Outfit> {
  try {
    const response = await fetch(`/api/outfits/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch outfit')
    }

    const data = await response.json()
    return data.outfit
  } catch (error) {
    console.error('Error fetching outfit:', error)
    throw error
  }
}

export async function createOutfit(outfitData: {
  name: string
  description?: string
  season?: string
  occasion?: string
  preview_image_url: string
  item_ids: number[]
}): Promise<Outfit> {
  try {
    const response = await fetch('/api/outfits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(outfitData),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to create outfit')
    }

    const data = await response.json()
    return data.outfit
  } catch (error) {
    console.error('Error creating outfit:', error)
    throw error
  }
}

export async function updateOutfit(id: string | number, outfitData: {
  name?: string
  description?: string
  season?: string
  occasion?: string
  preview_image_url?: string
  item_ids?: number[]
}): Promise<Outfit> {
  try {
    const response = await fetch(`/api/outfits/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(outfitData),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to update outfit')
    }

    const data = await response.json()
    return data.outfit
  } catch (error) {
    console.error('Error updating outfit:', error)
    throw error
  }
}

export async function deleteOutfit(id: string | number): Promise<void> {
  try {
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
  } catch (error) {
    console.error('Error deleting outfit:', error)
    throw error
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
