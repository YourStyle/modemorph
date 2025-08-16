-- ✅ Рабочая версия без синтаксических ошибок и без рекурсии RLS
-- (основная ошибка у тебя из-за недопустимого синтаксиса `CREATE POLICY IF NOT EXISTS` —
--  в PostgreSQL так нельзя; используем DROP ... IF EXISTS + CREATE)

-- Включаем RLS на таблице (на всякий случай)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Чистим все возможные старые политики
DROP POLICY IF EXISTS "Users can view own profile"               ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile (non-admins only)" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all user profiles"        ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile"             ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile"             ON public.user_profiles;
DROP POLICY IF EXISTS "Select profiles (self or admin)"          ON public.user_profiles;
DROP POLICY IF EXISTS "Update profiles (self or admin)"          ON public.user_profiles;
DROP POLICY IF EXISTS "Insert profiles (self or admin)"          ON public.user_profiles;

-- Создаем helper-функцию для проверки админа без рекурсивного обращения к той же таблице в RLS
-- SECURITY DEFINER + владелец postgres позволит обойти RLS внутри функции
create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = auth.uid()
      and coalesce(up.is_admin, false) = true
  );
$$;

-- Ограничиваем доступ к функции
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO public;

-- Политика SELECT: видеть свою запись или все записи, если админ
CREATE POLICY "Select profiles (self or admin)"
ON public.user_profiles
FOR SELECT TO public
USING (
  auth.uid() = user_id
  OR public.is_current_user_admin()
);

-- Политика UPDATE: обновлять свою запись или любые, если админ
CREATE POLICY "Update profiles (self or admin)"
ON public.user_profiles
FOR UPDATE TO public
USING (
  auth.uid() = user_id
  OR public.is_current_user_admin()
)
WITH CHECK (
  auth.uid() = user_id
  OR public.is_current_user_admin()
);

-- Политика INSERT: вставлять можно свою запись, админ — от имени любого
CREATE POLICY "Insert profiles (self or admin)"
ON public.user_profiles
FOR INSERT TO public
WITH CHECK (
  auth.uid() = user_id
  OR public.is_current_user_admin()
);
