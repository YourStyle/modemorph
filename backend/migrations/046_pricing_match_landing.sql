-- Привести цены в приложении к тем, что обещает лендинг modemorph.site.
--
-- Расхождение было не в нашу пользу: лендинг звал за 599 и 5 990, а на кассе
-- человек видел 699 и 6 990. Неделя совпадала.
--
-- Плюс разовое предложение после исчерпания бесплатных лимитов. На лендинге это
-- 199 / 449 / 4 999 — числа психологические, в единый процент они не ложатся:
--   299 → 199  это −33,4%
--   599 → 449  это −25,0%
--  5990 → 4999 это −16,5%
-- Механика скидок умеет только целый percent_off, поэтому цена предложения
-- хранится здесь абсолютным числом. Колонка, а не константа в коде: прайс
-- правится из админки, и цена акции обязана правиться оттуда же — иначе первое
-- же изменение цены разойдётся с предложением и никто этого не заметит.

ALTER TABLE subscription_pricing
    ADD COLUMN IF NOT EXISTS offer_price_rub INT;

COMMENT ON COLUMN subscription_pricing.offer_price_rub IS
    'Цена разового предложения после бесплатного лимита. NULL — предложение считается от percent_off скидки.';

UPDATE subscription_pricing SET price_rub = 299,  offer_price_rub = 199  WHERE plan_type = 'weekly';
UPDATE subscription_pricing SET price_rub = 599,  offer_price_rub = 449  WHERE plan_type = 'monthly';
UPDATE subscription_pricing SET price_rub = 5990, offer_price_rub = 4999 WHERE plan_type = 'yearly';

-- Проверка, а не надежда: если UPDATE не нашёл строку (переименовали plan_type),
-- миграция обязана упасть здесь, а не оставить прод с ценами вразнобой.
DO $$
DECLARE wrong INT;
BEGIN
    SELECT count(*) INTO wrong FROM subscription_pricing
    WHERE (plan_type, price_rub, offer_price_rub) NOT IN (
        ('weekly', 299, 199), ('monthly', 599, 449), ('yearly', 5990, 4999)
    );
    IF wrong > 0 THEN
        RAISE EXCEPTION 'Цены не сошлись с лендингом: % строк вне ожидаемого набора', wrong;
    END IF;
END $$;
