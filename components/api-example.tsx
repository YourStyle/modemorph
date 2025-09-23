// components/api-example.tsx
// Пример использования нового API транспортного слоя

"use client"

import { useEffect } from 'react'
import { API } from '@/lib/api'
import { useApi, useUserProfile, useUserLooks, useOutfits, useWardrobe } from '@/hooks/use-api'

export function ApiExample() {
  // Простое использование с базовым хуком
  const { data, loading, error, execute } = useApi()

  // Специализированные хуки
  const userProfile = useUserProfile()
  const userLooks = useUserLooks()
  const outfits = useOutfits()
  const wardrobe = useWardrobe()

  useEffect(() => {
    // Пример загрузки данных
    const loadData = async () => {
      // Загружаем профиль
      await userProfile.loadProfile({
        onSuccess: (data) => console.log('Profile loaded:', data),
        onError: (error) => console.error('Profile error:', error)
      })

      // Загружаем образы пользователя
      await userLooks.loadLooks()

      // Загружаем рекомендации
      await outfits.getInspiration(20)

      // Загружаем количество вещей в гардеробе
      await wardrobe.getCount()
    }

    loadData()
  }, [])

  // Примеры использования API напрямую
  const handleDirectApiCalls = async () => {
    // Прямой вызов API
    const profileResponse = await API.user.getProfile()
    if (profileResponse.ok) {
      console.log('Profile:', profileResponse.data)
    }

    // Создание нового образа
    const outfitResponse = await API.outfits.create({
      name: 'Новый образ',
      description: 'Описание образа',
      items: [1, 2, 3],
      season: 'весна'
    })

    if (outfitResponse.ok) {
      console.log('Outfit created:', outfitResponse.data)
    }

    // Лайк образа
    const likeResponse = await API.outfits.toggleLike('123', 'like')
    if (likeResponse.ok) {
      console.log('Liked:', likeResponse.data)
    }

    // Проверка лимитов
    const limitsResponse = await API.limits.check('vton_used', 1, {
      pagePath: '/app',
      itemId: 123
    })

    if (limitsResponse.ok) {
      console.log('Can use feature:', limitsResponse.data.canUse)
    }
  }

  // Пример загрузки файла
  const handleFileUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    formData.append('item_name', 'Новая вещь')
    formData.append('color', 'синий')

    const response = await wardrobe.addItem(formData, {
      onSuccess: (data) => console.log('Item added:', data),
      onError: (error) => console.error('Upload failed:', error)
    })

    return response
  }

  // Пример обработки ошибок
  const handleApiWithErrorHandling = async () => {
    const response = await execute(async () => {
      return API.user.getProfile()
    }, {
      onSuccess: (data) => {
        console.log('Success:', data)
      },
      onError: (error) => {
        // Автоматическая обработка ошибок
        console.error('Error:', error)
        // Можно показать toast, обновить UI и т.д.
      }
    })

    // Дополнительная обработка если нужна
    if (!response.ok) {
      // Дополнительная логика
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">API Transport Examples</h2>

      <div className="space-y-2">
        <h3 className="font-semibold">User Profile:</h3>
        <p>Loading: {userProfile.loading ? 'Yes' : 'No'}</p>
        <p>Error: {userProfile.error || 'None'}</p>
        <p>Data: {userProfile.data ? 'Loaded' : 'None'}</p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">User Looks:</h3>
        <p>Loading: {userLooks.loading ? 'Yes' : 'No'}</p>
        <p>Count: {Array.isArray(userLooks.data) ? userLooks.data.length : 0}</p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Wardrobe:</h3>
        <p>Loading: {wardrobe.loading ? 'Yes' : 'No'}</p>
        <p>Error: {wardrobe.error || 'None'}</p>
      </div>

      <button
        onClick={handleDirectApiCalls}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        Test Direct API Calls
      </button>

      <button
        onClick={handleApiWithErrorHandling}
        className="px-4 py-2 bg-green-500 text-white rounded"
      >
        Test Error Handling
      </button>
    </div>
  )
}

// Пример интеграции в существующий компонент
export function ApiIntegrationExample() {
  const { data: userItems, loading, execute } = useApi()

  const loadUserItems = async () => {
    await execute(async () => {
      return API.userItems.getAll()
    })
  }

  useEffect(() => {
    loadUserItems()
  }, [])

  if (loading) {
    return <div>Loading user items...</div>
  }

  return (
    <div>
      <h3>User Items ({Array.isArray(userItems) ? userItems.length : 0})</h3>
      {/* Рендер данных */}
    </div>
  )
}