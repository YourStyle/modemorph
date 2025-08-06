export interface Item {
  id: string
  name: string
  image_url?: string
  clothing_type?: string
  color?: string
  is_basic?: boolean
  brand?: string
  size?: string
  material?: string
  season?: string
  tags?: string[]
  created_at: string
  updated_at: string
  user_id?: string
}

export interface WardrobeItem {
  id: string
  item_name: string
  item_type: string
  color: string
  image_url: string
  is_visible: boolean
  user_id: string
  created_at: string
  updated_at: string
}

export interface Outfit {
  id: string
  name: string
  description?: string
  preview_image_url?: string
  likes?: number
  favorites_count?: number
  views_count?: number
  season?: string
  occasion?: string
  tags?: string[]
  items?: Item[]
  outfit_items?: OutfitItem[]
  created_at: string
  updated_at: string
  user_id?: string
}

export interface OutfitItem {
  id: string
  outfit_id: string
  wardrobe_item_id: string
  position: number
  wardrobe_items: Item
}

export interface CreateOutfitRequest {
  name: string
  description?: string
  preview_image_url?: string
  season?: string
  occasion?: string
  items: Array<{
    wardrobe_item_id: string
    position: number
  }>
}

export interface UpdateOutfitRequest extends Partial<CreateOutfitRequest> {
  id: string
}

export interface BasicItem {
  id: string
  name: string
  type: string
  image_url: string
  created_at: string
  updated_at: string
}

export interface ClothingType {
  id: string
  name: string
  category: string
  created_at: string
  updated_at: string
}
