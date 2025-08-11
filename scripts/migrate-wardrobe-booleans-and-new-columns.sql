-- 1) Add new text columns if not exist
alter table if exists wardrobe_items
  add column if not exists item_name_en text,
  add column if not exists description text,
  add column if not exists description_en text;

alter table if exists wardrobe_user_items
  add column if not exists item_name_en text,
  add column if not exists description text,
  add column if not exists description_en text;

-- 2) Convert has_print and has_details to boolean with mapping
-- wardrobe_items
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'wardrobe_items' and column_name = 'has_print' and data_type <> 'boolean'
  ) then
    alter table wardrobe_items
      alter column has_print type boolean
      using (
        case
          when lower(trim(has_print::text)) in ('y','yes','true','1','да') then true
          when lower(trim(has_print::text)) in ('n','no','false','0','nan','нет','') then false
          else false
        end
      );
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_name = 'wardrobe_items' and column_name = 'has_details' and data_type <> 'boolean'
  ) then
    alter table wardrobe_items
      alter column has_details type boolean
      using (
        case
          when lower(trim(has_details::text)) in ('y','yes','true','1','да') then true
          when lower(trim(has_details::text)) in ('n','no','false','0','nan','нет','') then false
          else false
        end
      );
  end if;
end $$;

alter table if exists wardrobe_items
  alter column has_print set default false,
  alter column has_details set default false;

-- wardrobe_user_items
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'wardrobe_user_items' and column_name = 'has_print' and data_type <> 'boolean'
  ) then
    alter table wardrobe_user_items
      alter column has_print type boolean
      using (
        case
          when lower(trim(has_print::text)) in ('y','yes','true','1','да') then true
          when lower(trim(has_print::text)) in ('n','no','false','0','nan','нет','') then false
          else false
        end
      );
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_name = 'wardrobe_user_items' and column_name = 'has_details' and data_type <> 'boolean'
  ) then
    alter table wardrobe_user_items
      alter column has_details type boolean
      using (
        case
          when lower(trim(has_details::text)) in ('y','yes','true','1','да') then true
          when lower(trim(has_details::text)) in ('n','no','false','0','nan','нет','') then false
          else false
        end
      );
  end if;
end $$;

alter table if exists wardrobe_user_items
  alter column has_print set default false,
  alter column has_details set default false;
