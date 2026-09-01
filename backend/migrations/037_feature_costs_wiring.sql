-- Прайс из админки начинает применяться.
--
-- ЧТО БЫЛО СЛОМАНО. _get_feature_cost() ищет строку по ключу функции, которым
-- оперирует приложение: wardrobe_items_anlyzed, ai_requests, ideas_viewed,
-- outfits_saved, vton_used. В feature_costs лежали другие имена —
-- wardrobe_digitization, ai_assistant, ideas_viewing, outfit_creation,
-- ai_try_on. Пересечений ноль, поэтому запрос не находил ничего НИКОГДА, и
-- срабатывал fallback `return 1`. Год с лишним любая функция списывала ровно
-- один кредит, что бы ни было выставлено в разделе «Тарификация».
--
-- Хуже всего то, что это не падало. Экран показывал «оцифровка 5 кредитов»,
-- админ правил цену, значение сохранялось — и не значило ничего.
--
-- ЦЕНЫ. Себестоимость измерена 22.08 на 15 реальных фото:
--   оцифровка       2,90 ₽  — одна генерация выкладки сеткой 2×2 на lite
--   примерка       14,10 ₽  — ДВЕ генерации на дорогой модели: пасс 1 надевает
--                             одежду, пасс 2 возвращает лицо. Не одна.
--   идея/образ/стилист 0,04 ₽ — текст
--
-- При этом кредит стоит человеку от 5,00 ₽ (пак 200/999) до 15,80 ₽ (Мини 5/79).
-- Считаем по среднему паку 40/299 = 7,48 ₽ и проверяем по самому дешёвому.
--
--   оцифровка 3 кр  → 22,44 ₽ при 2,90 ₽  = маржа 87% (на дешёвом паке 81%)
--   примерка  6 кр  → 44,88 ₽ при 14,10 ₽ = маржа 69% (на дешёвом паке 53%)
--   стилист   1 кр  →  7,48 ₽ при 0,04 ₽  — цена здесь не про себестоимость,
--                     а про то, чтобы после 25 бесплатных запросов в месяц
--                     оставался ограничитель. Дешевле кредита не бывает.
--   идеи      0 кр  — бесплатно
--   образы    0 кр  — бесплатно
--
-- Почему примерка ровно вдвое дороже оцифровки: она и есть две генерации против
-- одной. Это единственная формулировка, которую можно честно сказать вслух и
-- пользователю, и себе. Пропорционально себестоимости вышло бы около 15 кредитов —
-- сознательно не берём столько: примерка это то, ради чего продукт открывают.

UPDATE feature_costs SET
    feature_name = 'wardrobe_items_anlyzed',
    display_name = 'Оцифровка фото',
    cost_credits = 3,
    cost_subscription_credits = 0,
    usage_increment = 1,
    description = 'Одно фото, до 4 вещей за раз. Себестоимость 2,90 ₽.',
    updated_at = NOW()
WHERE feature_name = 'wardrobe_digitization';

UPDATE feature_costs SET
    feature_name = 'vton_used',
    display_name = 'Примерка на аватаре',
    cost_credits = 6,
    cost_subscription_credits = 0,
    usage_increment = 1,
    description = 'Две генерации: одежда и лицо. Себестоимость 14,10 ₽ — вдвое дороже оцифровки, отсюда и цена.',
    updated_at = NOW()
WHERE feature_name = 'ai_try_on';

UPDATE feature_costs SET
    feature_name = 'ai_requests',
    display_name = 'ИИ-стилист',
    cost_credits = 1,
    cost_subscription_credits = 0,
    usage_increment = 1,
    description = 'Списывается только после 25 бесплатных запросов в месяц. Себестоимость 0,04 ₽.',
    updated_at = NOW()
WHERE feature_name = 'ai_assistant';

UPDATE feature_costs SET
    feature_name = 'ideas_viewed',
    display_name = 'Просмотр идей',
    cost_credits = 0,
    cost_subscription_credits = 0,
    usage_increment = 1,
    description = 'Бесплатно. Себестоимость 0,04 ₽ — брать за это деньги дороже, чем отдать.',
    updated_at = NOW()
WHERE feature_name = 'ideas_viewing';

UPDATE feature_costs SET
    feature_name = 'outfits_saved',
    display_name = 'Сохранение образа',
    cost_credits = 0,
    cost_subscription_credits = 0,
    usage_increment = 1,
    description = 'Бесплатно. Себестоимость 0,04 ₽.',
    updated_at = NOW()
WHERE feature_name = 'outfit_creation';

-- Две строки на один ключ означали бы, что цена выбирается случайно: запрос
-- берёт первую попавшуюся. Это ровно тот класс молчаливой поломки, который
-- мы здесь и чиним.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_costs_name ON feature_costs (feature_name);
