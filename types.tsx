export interface Item {
  id: string
  name: string
  type: string
  color: string
  image_url?: string
  created_at: string
  updated_at: string
}

export interface WardrobeItem {
  id: string
  user_id: string
  item_name: string
  clothing_type: string
  color: string
  brand?: string
  size?: string
  material?: string
  season?: string
  image_url?: string
  notes?: string
  tags?: string[]
  is_favorite: boolean
  is_visible: boolean
  created_at: string
  updated_at: string
}

export interface BasicItem {
  id: string
  name: string
  name_ru: string
  name_en: string
  clothing_type: string
  color?: string
  material?: string
  season?: string
  tags?: string[]
  image_url?: string
  description?: string
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

export interface Outfit {
  id: string
  user_id: string
  name: string
  description?: string
  items: WardrobeItem[]
  image_url?: string
  tags?: string[]
  is_favorite: boolean
  created_at: string
  updated_at: string
  views_count?: number
  likes_count?: number
  favorites_count?: number
}

export interface User {
  id: string
  email: string
  name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Collection {
  id: string
  user_id: string
  name: string
  description?: string
  outfits: Outfit[]
  is_public: boolean
  created_at: string
  updated_at: string
}
