export interface Item {
  id: string
  name: string
  image_url: string
  clothing_type: string
  color: string
  material?: string
  brand?: string
  price?: number
  tags?: string[]
  user_id: string
  created_at: string
  updated_at: string
  is_hidden?: boolean
}

export interface WardrobeItem {
  id: string
  item_name: string
  image_url: string
  clothing_type: string
  color: string
  material?: string
  brand?: string
  price?: number
  tags?: string[]
  user_id: string
  created_at: string
  updated_at: string
  is_hidden?: boolean
}

export interface BasicItem {
  id: string
  name: string
  clothing_type: string
  image_url?: string
  description?: string
  created_at: string
  updated_at: string
}

export interface ClothingType {
  id: string
  name: string
  category: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Outfit {
  id: string
  name: string
  description?: string
  preview_image?: string
  items: string[]
  user_id: string
  created_at: string
  updated_at: string
  views?: number
  likes?: number
  is_favorite?: boolean
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
  name: string
  description?: string
  image_url?: string
  user_id: string
  created_at: string
  updated_at: string
  outfits?: Outfit[]
}

export interface CreateOutfitData {
  name: string
  description?: string
  preview_image?: string
  items: string[]
}

export interface UpdateOutfitData {
  name?: string
  description?: string
  preview_image?: string
  items?: string[]
}
