// lib/api.ts
// Типизированные API методы для удобного использования

import { api, type ApiResponse } from './api-transport'

// Типы для API ответов
export interface UserProfile {
  user_id: string
  gender?: string
  height?: number
  weight?: number
  top_size?: string
  bottom_size?: string
  shoe_size?: string | number
  referral?: string
  full_name?: string
  avatar_url?: string
  is_admin?: boolean
  updated_at?: string
}

export interface OutfitItem {
  id: string
  name: string
  image_url: string
  color?: string
  shade?: string
  has_print?: string
  notes?: string
  user_id?: string
}

export interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
}

export interface UserLook {
  id: string
  name: string
  description?: string
  items: any[]
  expandedItems?: any[]
  created_at: string
}

export interface WardrobeItem {
  id: number
  item_name: string
  item_type?: string
  color?: string
  shade?: string
  material?: string
  style?: string
  has_print?: boolean
  has_details?: boolean
  image_url?: string
  notes?: string
  is_basic?: boolean
  is_hidden?: boolean
}

// API методы для пользователя
export const userApi = {
  // Получить профиль
  getProfile: (): Promise<ApiResponse<{ profile: UserProfile | null }>> =>
    api.get('/api/me/profile'),

  // Получить информацию о пользователе
  getMe: (): Promise<ApiResponse<{ user: { id: string }, profile: UserProfile | null }>> =>
    api.get('/api/me'),

  // Обновить профиль (миниапп)
  updateProfile: (profileData: Partial<UserProfile>): Promise<ApiResponse<{ success: boolean }>> =>
    api.post('/api/profile/miniapp-upsert', profileData),
}

// API методы для образов (outfits)
export const outfitsApi = {
  // Получить все образы пользователя
  getAll: (limit?: number): Promise<ApiResponse<{ outfits: any[] }>> =>
    api.get(`/api/outfits${limit ? `?limit=${limit}` : ''}`),

  // Получить конкретный образ
  getById: (id: string): Promise<ApiResponse<{ outfit: any }>> =>
    api.get(`/api/outfits/${id}`),

  // Создать новый образ
  create: (outfitData: {
    name: string
    description?: string
    season?: string
    occasion?: string
    items: any[]
    preview_image_url?: string
    gender?: string
  }): Promise<ApiResponse<{ outfit: any }>> =>
    api.post('/api/outfits', outfitData),

  // Обновить образ
  update: (id: string, outfitData: any): Promise<ApiResponse<{ success: boolean }>> =>
    api.put(`/api/outfits/${id}`, outfitData),

  // Удалить образ
  delete: (id: string): Promise<ApiResponse<{ success: boolean }>> =>
    api.delete(`/api/outfits/${id}`),

  // Лайкнуть/убрать лайк
  toggleLike: (outfitId: string, action: 'like' | 'unlike'): Promise<ApiResponse<{ likes: number, isLiked: boolean }>> =>
    api.post('/api/outfits/like', { outfitId, action }),

  // Сохранить как look
  saveAsLook: (outfitId: string, lookName?: string): Promise<ApiResponse<{ success: boolean, look: any }>> =>
    api.post('/api/outfits/save-as-look', { outfitId, lookName }),

  // Сохранить в looks
  saveToLooks: (outfitId: string): Promise<ApiResponse<{ success: boolean, look: any }>> =>
    api.post('/api/outfits/save-to-looks', { outfitId }),

  // Получить вдохновение
  getInspiration: (limit?: number, gender?: string): Promise<ApiResponse<{ outfits: OutfitSuggestion[], nextCursor: string | null }>> =>
    api.get(`/api/outfits/inspiration${limit ? `?limit=${limit}` : ''}${gender ? `${limit ? '&' : '?'}gender=${gender}` : ''}`),

  // Отметить просмотр
  trackView: (outfitId: string): Promise<ApiResponse<{ tracked: boolean }>> =>
    api.post('/api/outfits/track-view', { outfitId }),

  // Отметить сохранение
  trackSave: (outfitId: string): Promise<ApiResponse<{ tracked: boolean }>> =>
    api.post('/api/outfits/track-save', { outfitId }),
}

// API методы для гардероба
export const wardrobeApi = {
  // Получить все вещи
  getAll: (search?: string): Promise<ApiResponse<{ items: WardrobeItem[] }>> =>
    api.get(`/api/wardrobe${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  // Получить конкретную вещь
  getById: (id: string): Promise<ApiResponse<{ item: WardrobeItem }>> =>
    api.get(`/api/wardrobe/${id}`),

  // Создать новую вещь
  create: (itemData: Partial<WardrobeItem>): Promise<ApiResponse<{ item: WardrobeItem }>> =>
    api.post('/api/wardrobe', itemData),

  // Обновить вещь
  update: (id: string, itemData: Partial<WardrobeItem>): Promise<ApiResponse<{ item: WardrobeItem }>> =>
    api.put(`/api/wardrobe/${id}`, itemData),

  // Удалить вещь
  delete: (id: string): Promise<ApiResponse<{ success: boolean }>> =>
    api.delete(`/api/wardrobe/${id}`),

  // Изменить видимость
  toggleVisibility: (id: string, isHidden: boolean): Promise<ApiResponse<{ success: boolean }>> =>
    api.patch(`/api/wardrobe/${id}`, { is_hidden: isHidden }),

  // Добавить вещь (с файлом)
  add: (formData: FormData): Promise<ApiResponse<{ success: boolean, item: WardrobeItem }>> =>
    api.upload('/api/wardrobe/add', formData),

  // Получить количество вещей
  getCount: (): Promise<ApiResponse<{ count: number }>> =>
    api.get('/api/wardrobe/count'),

  // Получить базовые вещи
  getBasic: (): Promise<ApiResponse<{ items: WardrobeItem[], needsMigration: boolean }>> =>
    api.get('/api/wardrobe/basic'),

  // Получить типы
  getTypes: (): Promise<ApiResponse<{ types: string[] }>> =>
    api.get('/api/wardrobe/types'),

  // Изменить видимость всех вещей
  setAllVisibility: (hideAll: boolean): Promise<ApiResponse<{ success: boolean, message: string }>> =>
    api.post('/api/wardrobe/visibility', { hideAll }),

  // Выполнить миграцию
  migrate: (): Promise<ApiResponse<{ success: boolean, message: string }>> =>
    api.post('/api/wardrobe/migrate'),
}

// API методы для пользовательских образов (looks)
export const userLooksApi = {
  // Получить все looks
  getAll: (): Promise<ApiResponse<UserLook[]>> =>
    api.get('/api/user-looks'),

  // Создать новый look
  create: (lookData: {
    name: string
    description?: string
    items: any[]
  }): Promise<ApiResponse<UserLook>> =>
    api.post('/api/user-looks', lookData),

  // Удалить look
  delete: (id: string): Promise<ApiResponse<{ success: boolean }>> =>
    api.delete(`/api/user-looks/${id}`),
}

// API методы для лайков
export const likesApi = {
  // Получить лайкнутые образы
  getLiked: (): Promise<ApiResponse<{ liked: string[] }>> =>
    api.get('/api/user-likes'),
}

// API методы для лимитов и функций
export const limitsApi = {
  // Проверить/использовать функцию
  checkOrConsume: (
    featureType: string,
    count?: number,
    meta?: any
  ): Promise<ApiResponse<{ success: boolean, canUse: boolean, remaining: number, code?: string }>> =>
    api.post('/api/check-limits', { featureType, count, meta }),

  // Только проверить возможность использования
  check: (
    feature: string,
    count?: number,
    meta?: any
  ): Promise<ApiResponse<{ success: boolean, canUse: boolean, remaining: number }>> =>
    api.post('/api/check-limits', { feature, count, meta }),
}

// API методы для пользовательских вещей
export const userItemsApi = {
  // Получить все пользовательские вещи
  getAll: (): Promise<ApiResponse<any[]>> =>
    api.get('/api/wardrobe-user-items'),

  // Получить конкретную вещь
  getById: (id: string): Promise<ApiResponse<any>> =>
    api.get(`/api/wardrobe-user-items/${id}`),
}

// Группируем все API в один объект для удобства
export const API = {
  user: userApi,
  outfits: outfitsApi,
  wardrobe: wardrobeApi,
  userLooks: userLooksApi,
  likes: likesApi,
  limits: limitsApi,
  userItems: userItemsApi,
}

// Экспортируем основной транспорт для прямого использования
export { api } from './api-transport'