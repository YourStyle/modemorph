import { Outfit, Item } from './types'

export async function getOutfitById(id: string): Promise<Outfit | null> {
  try {
    const response = await fetch(`/api/outfits/${id}`)
    if (!response.ok) {
      throw new Error('Failed to fetch outfit')
    }
    const data = await response.json()
    return data.outfit
  } catch (error) {
    console.error('Error fetching outfit:', error)
    return null
  }
}

export async function updateOutfit(id: string, outfitData: any): Promise<Outfit | null> {
  try {
    const response = await fetch(`/api/outfits/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(outfitData),
    })
    
    if (!response.ok) {
      throw new Error('Failed to update outfit')
    }
    
    const data = await response.json()
    return data.outfit
  } catch (error) {
    console.error('Error updating outfit:', error)
    return null
  }
}
