-- Creates the basic_wardrobe_items table if it doesn't exist
-- and seeds it with a small set of basic items.
-- Safe to run multiple times.

create table if not exists public.basic_wardrobe_items (
  id bigserial primary key,
  name_ru text not null,
  name_en text,
  description text,
  image_url text,
  created_at timestamptz not null default now()
);

-- Minimal seed data (insert only if not present)
insert into public.basic_wardrobe_items (name_ru, name_en, description, image_url)
select x.name_ru, x.name_en, x.description, x.image_url
from (values
  ('Базовая футболка', 'Basic T-Shirt', 'Однотонная базовая футболка', null),
  ('Классические джинсы', 'Classic Jeans', 'Прямые джинсы синего цвета', null),
  ('Белая рубашка', 'White Shirt', 'Базовая сорочка белого цвета', null),
  ('Черный пиджак', 'Black Blazer', 'Классический пиджак', null),
  ('Кроссовки', 'Sneakers', 'Универсальные кроссовки', null)
) as x(name_ru, name_en, description, image_url)
where not exists (
  select 1 from public.basic_wardrobe_items b where b.name_ru = x.name_ru
);
