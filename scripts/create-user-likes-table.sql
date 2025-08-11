-- Track user likes for outfits
create table if not exists public.user_likes (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_id bigint not null references public.outfits(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_likes_user_outfit_unique unique (user_id, outfit_id)
);

create index if not exists idx_user_likes_user_id on public.user_likes (user_id);
create index if not exists idx_user_likes_outfit_id on public.user_likes (outfit_id);

alter table public.user_likes enable row level security;

-- Authenticated users can read likes (needed to compute counts)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_likes' and policyname='Allow select for authenticated'
  ) then
    create policy "Allow select for authenticated"
      on public.user_likes for select
      to authenticated
      using (true);
  end if;
end$$;

-- Only the owner can insert their like
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_likes' and policyname='Allow insert own like'
  ) then
    create policy "Allow insert own like"
      on public.user_likes for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end$$;

-- Only the owner can delete their like
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='user_likes' and policyname='Allow delete own like'
  ) then
    create policy "Allow delete own like"
      on public.user_likes for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end$$;
