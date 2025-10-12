# Настройка системы аналитики

Система аналитики готова! Осталось только создать таблицу для событий в Supabase.

## Шаг 1: Создание таблицы user_events

Откройте Supabase SQL Editor и выполните SQL из файла `docs/USER_EVENTS_TABLE.md`:

```sql
-- Создаем таблицу для трекинга событий
CREATE TABLE IF NOT EXISTS user_events (
  id BIGSERIAL PRIMARY KEY,
  user_profile_id BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Создаем индексы для быстрых запросов
CREATE INDEX idx_user_events_user_profile_id ON user_events(user_profile_id);
CREATE INDEX idx_user_events_event_type ON user_events(event_type);
CREATE INDEX idx_user_events_created_at ON user_events(created_at DESC);
CREATE INDEX idx_user_events_user_event_created ON user_events(user_profile_id, event_type, created_at DESC);

-- Включаем RLS
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

-- Политики доступа
CREATE POLICY "Пользователи могут создавать свои события"
  ON user_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = user_events.user_profile_id
      AND user_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Админы могут читать все события"
  ON user_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );
```

## Шаг 2: Проверка

После создания таблицы проверьте, что всё работает:

```sql
-- Должно вернуть пустую таблицу (нет событий пока)
SELECT * FROM user_events LIMIT 1;
```

## Что уже реализовано

### 1. Таблица событий (user_events)
✅ SQL схема готова в `docs/USER_EVENTS_TABLE.md`

### 2. Хук useAnalytics
✅ Файл: `hooks/use-analytics.ts`
- `trackEvent(eventType, eventData)` - трекать любое событие
- `trackOnce(eventType, eventData)` - трекать только первое событие (для milestone)

### 3. Автоматический трекинг событий

**Onboarding:**
- ✅ `first_item_added` - при добавлении первой вещи в гардероб
- ✅ `wardrobe_30_percent` / `50_percent` / `100_percent` - прогресс гардероба

**Outfit Events:**
- ✅ `outfit_saved` - при сохранении образа
- ✅ `first_outfit_generated` - первый созданный образ

**Engagement:**
- ✅ `ai_assistant_used` - использование AI ассистента

### 4. API Endpoint
✅ `/api/admin/analytics` - возвращает все метрики

### 5. Админ панель
✅ `/admin/analytics` - страница с графиками и метриками

Включает:
- **Онбординг**: первая вещь, прогресс гардероба
- **Aha-момент**: первый образ, клики по рекомендациям
- **Доставка ценности**: сохранённые образы, repeat task rate
- **Retention**: D1/D7/D30 метрики
- **Монетизация**: конверсия в premium
- **Воронка конверсии**: от регистрации до повторного использования
- **Временные графики**: динамика событий за 30 дней

## Доступные типы событий

### Onboarding
- `onboarding_started`
- `first_item_added` ✅ Трекается автоматически
- `onboarding_complete`
- `profile_photo_uploaded`
- `wardrobe_30_percent` ✅ Трекается автоматически
- `wardrobe_50_percent` ✅ Трекается автоматически
- `wardrobe_100_percent` ✅ Трекается автоматически

### Outfit & Value
- `first_outfit_generated` ✅ Трекается автоматически
- `outfit_saved` ✅ Трекается автоматически
- `outfit_shared`
- `first_tryon_opened`
- `recommendation_clicked`

### Engagement
- `session_started`
- `session_task_completed`
- `ai_assistant_used` ✅ Трекается автоматически
- `wardrobe_viewed`
- `inspiration_viewed`

### Monetization
- `paywall_shown`
- `conversion_to_premium`
- `premium_feature_used`

### Retention
- `daily_return`
- `weekly_return`
- `repeat_task`

## Как добавить трекинг в другие места

```typescript
import { useAnalytics } from "@/hooks/use-analytics"

function MyComponent() {
  const { trackEvent, trackOnce } = useAnalytics()

  const handleAction = async () => {
    // Трекать каждое событие
    await trackEvent("recommendation_clicked", {
      recommendation_id: 123,
      source: "homepage"
    })

    // Трекать только один раз (для milestone событий)
    await trackOnce("first_tryon_opened", {
      outfit_id: 456
    })
  }

  return <button onClick={handleAction}>Action</button>
}
```

## Liquid Glass эффект

✅ Применён к нижнему меню (`components/bottom-navigation.tsx`)
- Использует библиотеку `liquid-glass-react`
- Настроены параметры: displacement, blur, saturation, aberration

## Что дальше?

1. Создайте таблицу `user_events` в Supabase (см. выше)
2. Откройте `/admin/analytics` и посмотрите на аналитику
3. Добавьте дополнительный трекинг там, где нужно (используя хук `useAnalytics`)

Система готова к использованию! 🚀
