# User Events Tracking Table

## Создание таблицы user_events

Эта таблица будет хранить все события пользователей для аналитики.

### SQL для создания таблицы

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

-- Политики доступа (только админы могут читать все события)
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

## Типы событий (event_type)

### Onboarding Events
- `onboarding_started` - пользователь начал онбординг
- `first_item_added` - загружена первая вещь в гардероб
- `onboarding_complete` - онбординг завершен (X вещей загружено)
- `profile_photo_uploaded` - загружено фото профиля
- `wardrobe_30_percent` - заполнено 30% гардероба
- `wardrobe_50_percent` - заполнено 50% гардероба
- `wardrobe_100_percent` - заполнено 100% гардероба

### Outfit & Value Events
- `first_outfit_generated` - первый образ создан ассистентом
- `outfit_saved` - образ сохранен
- `outfit_shared` - образ отправлен/поделился
- `first_tryon_opened` - первая виртуальная примерка
- `recommendation_clicked` - клик по рекомендации

### Engagement Events
- `session_started` - начало сессии
- `session_task_completed` - успешное завершение задачи в сессии
- `ai_assistant_used` - использован AI ассистент
- `wardrobe_viewed` - просмотр гардероба
- `inspiration_viewed` - просмотр идей

### Monetization Events
- `paywall_shown` - показан paywall
- `conversion_to_premium` - куплена подписка
- `premium_feature_used` - использована премиум функция

### Retention Events
- `daily_return` - возврат пользователя (DAU)
- `weekly_return` - возврат пользователя (WAU)
- `repeat_task` - повторное выполнение задачи

## Формат event_data (JSONB)

Примеры данных для разных типов событий:

```json
// first_item_added
{
  "item_id": 123,
  "item_type": "shirt",
  "source": "upload"
}

// outfit_saved
{
  "outfit_id": 456,
  "items_count": 4,
  "source": "ai_assistant"
}

// premium_feature_used
{
  "feature_name": "capsule_generation",
  "subscription_type": "pro"
}

// session_task_completed
{
  "task_type": "outfit_creation",
  "duration_seconds": 120
}

// wardrobe_X_percent
{
  "percentage": 30,
  "items_count": 15,
  "target_count": 50
}
```

## Инструкция по созданию

1. Откройте Supabase SQL Editor
2. Скопируйте SQL код выше
3. Выполните запрос
4. Проверьте что таблица создана: `SELECT * FROM user_events LIMIT 1;`
