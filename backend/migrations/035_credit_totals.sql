-- user_credits.total_earned / total_spent / updated_at перестают быть мёртвыми.
--
-- Колонки существуют с самого начала и не писались НИКОГДА: 59 профилей из 66
-- держат в обоих счётчиках ноль, при том что транзакций накоплено 277. Любой
-- отчёт «сколько человек купил и потратил» возвращал нули — и это худший вид
-- пустоты, потому что ноль выглядит как ответ.
--
-- updated_at тоже стоял: у пользователя с покупкой в 13:12 и списаниями до 13:26
-- там значилось 12:52 — время создания строки. По этому полю нельзя было понять,
-- когда счёт последний раз двигался.
--
-- Сделано триггером на credit_transactions, а не правкой пяти мест в коде.
-- Проверено: все пять путей, меняющих баланс (payments, limits, misc, две ветки
-- admin), уже пишут транзакцию — значит одна точка покрывает всё, и шестой путь,
-- который кто-нибудь добавит завтра, попадёт в счётчики сам.
--
-- Знак суммы, а НЕ transaction_type: типов уже три ('spend', 'credit',
-- 'admin_grant'), и завязка на строку означает, что четвёртый молча перестанет
-- считаться. Знак у денег есть всегда.
--
-- Баланс триггер не трогает: его ведёт приложение, и дублирование дало бы
-- двойное начисление.

CREATE OR REPLACE FUNCTION public.bump_credit_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE user_credits
       SET total_earned = total_earned + GREATEST(NEW.amount, 0),
           total_spent  = total_spent  + GREATEST(-NEW.amount, 0),
           updated_at   = NOW()
     WHERE user_profile_id = NEW.user_profile_id;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bump_credit_totals ON credit_transactions;
CREATE TRIGGER trg_bump_credit_totals
    AFTER INSERT ON credit_transactions
    FOR EACH ROW EXECUTE FUNCTION public.bump_credit_totals();

-- Пересчёт задним числом по всей истории транзакций.
--
-- Только счётчики. Баланс НЕ трогаем: у двух профилей он разошёлся с суммой
-- транзакций (16: баланс 109 против 181, то есть −72; 1190: +1), и это следы
-- изменений, сделанных мимо журнала. Подогнать баланс под транзакции значило бы
-- переписать людям счёт по догадке; расхождение видно запросом и разбирается
-- отдельно, руками.
UPDATE user_credits c
   SET total_earned = t.earned,
       total_spent  = t.spent
  FROM (
      SELECT user_profile_id,
             COALESCE(sum(GREATEST(amount, 0)), 0)  AS earned,
             COALESCE(sum(GREATEST(-amount, 0)), 0) AS spent
        FROM credit_transactions
       GROUP BY user_profile_id
  ) t
 WHERE c.user_profile_id = t.user_profile_id;
