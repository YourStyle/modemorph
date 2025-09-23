# API Transport Layer

Универсальный транспортный слой для всех API запросов с автоматической session-based авторизацией.

## Структура

```
lib/
├── api-transport.ts    # Базовый транспортный слой
├── api.ts             # Типизированные API методы
└── session-auth.ts    # Session-based авторизация

hooks/
└── use-api.ts         # React хуки для API

components/
└── api-example.tsx    # Примеры использования
```

## Основные возможности

✅ **Автоматическая авторизация** - все запросы автоматически включают Bearer токен
✅ **Обработка ошибок** - централизованная обработка 401 и других ошибок
✅ **Типизация** - полная типизация всех API методов
✅ **React хуки** - удобные хуки с состоянием загрузки
✅ **Загрузка файлов** - поддержка FormData
✅ **Логирование** - автоматическое логирование запросов
✅ **Очистка сессии** - автоматическая очистка при 401 ошибках

## Базовое использование

### Прямые вызовы API

```typescript
import { API } from '@/lib/api'

// Получить профиль пользователя
const response = await API.user.getProfile()
if (response.ok) {
  console.log(response.data.profile)
}

// Создать новый образ
const outfitResponse = await API.outfits.create({
  name: 'Летний образ',
  description: 'Легкий летний лук',
  items: [1, 2, 3],
  season: 'лето'
})

// Лайк образа
await API.outfits.toggleLike('123', 'like')

// Проверка лимитов
const limitsResponse = await API.limits.check('vton_used', 1, {
  pagePath: '/app',
  itemId: 123
})
```

### Использование с React хуками

```typescript
import { useUserProfile, useUserLooks, useOutfits } from '@/hooks/use-api'

function MyComponent() {
  const userProfile = useUserProfile()
  const userLooks = useUserLooks()
  const outfits = useOutfits()

  useEffect(() => {
    // Загружаем данные с обработкой ошибок
    userProfile.loadProfile({
      onSuccess: (data) => console.log('Profile loaded:', data),
      onError: (error) => showToast(error)
    })

    userLooks.loadLooks()
    outfits.getInspiration(20)
  }, [])

  if (userProfile.loading) return <Spinner />
  if (userProfile.error) return <Error error={userProfile.error} />

  return <div>{/* UI */}</div>
}
```

### Загрузка файлов

```typescript
import { useWardrobe } from '@/hooks/use-api'

function UploadComponent() {
  const wardrobe = useWardrobe()

  const handleUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    formData.append('item_name', 'Новая вещь')
    formData.append('color', 'синий')

    await wardrobe.addItem(formData, {
      onSuccess: () => showToast('Вещь добавлена!'),
      onError: (error) => showToast(error)
    })
  }

  return <FileUpload onUpload={handleUpload} />
}
```

## Доступные API методы

### User API
- `API.user.getProfile()` - получить профиль
- `API.user.getMe()` - получить информацию о пользователе
- `API.user.updateProfile(data)` - обновить профиль

### Outfits API
- `API.outfits.getAll(limit?)` - все образы
- `API.outfits.getById(id)` - конкретный образ
- `API.outfits.create(data)` - создать образ
- `API.outfits.update(id, data)` - обновить образ
- `API.outfits.delete(id)` - удалить образ
- `API.outfits.toggleLike(id, action)` - лайк/анлайк
- `API.outfits.getInspiration(limit?, gender?)` - вдохновение
- `API.outfits.saveAsLook(id, name?)` - сохранить как look
- `API.outfits.trackView(id)` - отметить просмотр

### Wardrobe API
- `API.wardrobe.getAll(search?)` - все вещи
- `API.wardrobe.getById(id)` - конкретная вещь
- `API.wardrobe.create(data)` - создать вещь
- `API.wardrobe.update(id, data)` - обновить вещь
- `API.wardrobe.delete(id)` - удалить вещь
- `API.wardrobe.add(formData)` - добавить с файлом
- `API.wardrobe.getCount()` - количество вещей
- `API.wardrobe.getBasic()` - базовые вещи
- `API.wardrobe.setAllVisibility(hide)` - видимость всех

### User Looks API
- `API.userLooks.getAll()` - все образы пользователя
- `API.userLooks.create(data)` - создать образ
- `API.userLooks.delete(id)` - удалить образ

### Limits API
- `API.limits.checkOrConsume(feature, count?, meta?)` - проверить/использовать
- `API.limits.check(feature, count?, meta?)` - только проверить

### Likes API
- `API.likes.getLiked()` - лайкнутые образы

## Обработка ошибок

Транспортный слой автоматически обрабатывает:

### 401 Unauthorized
- Автоматически очищает сессию
- Перезагружает страницу для повторной авторизации

### Сетевые ошибки
- Логирует ошибки в консоль
- Возвращает понятные сообщения об ошибках

### API ошибки
- Парсит JSON ошибки от сервера
- Возвращает сообщения об ошибках из ответа

## Логирование

Все запросы автоматически логируются:

```
[ApiTransport] POST /api/outfits { hasAuth: true, body: 'present' }
[ApiTransport] GET /api/user/profile { hasAuth: true, body: 'none' }
```

## Миграция с fetch

### Было:
```typescript
const response = await fetch('/api/user/profile', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
const data = await response.json()
```

### Стало:
```typescript
const response = await API.user.getProfile()
const data = response.data
```

## Конфигурация

### Отключение авторизации
Для публичных эндпоинтов:

```typescript
import { api } from '@/lib/api-transport'

const response = await api.get('/api/public/data', {
  skipAuth: true
})
```

### Кастомные заголовки
```typescript
const response = await api.post('/api/endpoint', data, {
  headers: {
    'Custom-Header': 'value'
  }
})
```

## Типы ответов

```typescript
interface ApiResponse<T = any> {
  data?: T
  error?: string
  status: number
  ok: boolean
}
```

Все методы возвращают `ApiResponse<T>` с типизированными данными.

## Лучшие практики

1. **Используйте типизированные методы** из `API.*` вместо прямых вызовов
2. **Используйте хуки** для компонентов с состоянием загрузки
3. **Обрабатывайте ошибки** через callbacks в хуках
4. **Не дублируйте логику** - используйте готовые хуки
5. **Логируйте важные операции** для отладки

Транспортный слой полностью заменяет необходимость в ручных fetch запросах и обеспечивает консистентную работу с API через всё приложение.