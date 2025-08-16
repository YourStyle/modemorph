-- Сначала удалить функцию с прежней сигнатурой
DROP FUNCTION IF EXISTS public.add_user_credits(INTEGER, TEXT, UUID, TEXT);

-- Убедиться, что есть уникальный индекс для upsert
CREATE UNIQUE INDEX IF NOT EXISTS user_credits_user_profile_id_key
  ON public.user_credits(user_profile_id);

-- Пересоздать функцию, сохранив имена параметров
CREATE FUNCTION public.add_user_credits(
    credits_to_add INTEGER,
    description TEXT,
    target_user_id UUID,
    transaction_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_profile_id INTEGER;          -- переименованная локальная переменная
    v_is_admin BOOLEAN := FALSE;
BEGIN
    -- Проверка, что вызывающий — админ
    SELECT COALESCE(is_admin, FALSE)
      INTO v_is_admin
      FROM public.user_profiles
     WHERE user_id = auth.uid();

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Access denied: Only admins can add credits to users';
    END IF;

    -- Получить profile_id целевого пользователя
    SELECT id
      INTO STRICT v_user_profile_id
      FROM public.user_profiles
     WHERE user_id = target_user_id;

    -- Upsert баланса (алиас uc устраняет неоднозначности)
    INSERT INTO public.user_credits AS uc
        (user_profile_id, credits_balance, total_earned, created_at, updated_at)
    VALUES
        (v_user_profile_id, credits_to_add, credits_to_add, NOW(), NOW())
    ON CONFLICT (user_profile_id) DO UPDATE
       SET credits_balance = uc.credits_balance + EXCLUDED.credits_balance,
           total_earned    = uc.total_earned    + EXCLUDED.total_earned,
           updated_at      = NOW();

    -- Лог транзакции
    INSERT INTO public.credit_transactions
        (user_profile_id, transaction_type, amount, description, feature_used, created_at)
    VALUES
        (v_user_profile_id, transaction_type, credits_to_add, description, 'admin_grant', NOW());

    RETURN TRUE;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to add credits: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.add_user_credits(INTEGER, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_user_credits(INTEGER, TEXT, UUID, TEXT) TO authenticated;

-- посмотреть текущее условие
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.credit_transactions'::regclass;

-- расширить список допустимых значений
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (transaction_type IN ('credit','debit','spend','earn','admin_grant'));
