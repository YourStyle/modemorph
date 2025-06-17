import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerActionClient } from "@supabase/auth-helpers-nextjs"

export async function POST(request: Request) {
  try {
    const cookieStore = cookies()
    const supabase = createServerActionClient({ cookies: () => cookieStore })

    // Получаем текущего пользователя
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // SQL для добавления новых колонок
    const migrationSQL = `
      -- Добавляем новые поля в таблицу wardrobe_items
      ALTER TABLE wardrobe_items 
      ADD COLUMN IF NOT EXISTS is_basic BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS basic_item_id BIGINT,
      ADD COLUMN IF NOT EXISTS notes TEXT;

      -- Добавляем внешний ключ для связи с базовыми вещами
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_basic_item'
        ) THEN
          ALTER TABLE wardrobe_items
          ADD CONSTRAINT fk_basic_item
          FOREIGN KEY (basic_item_id) 
          REFERENCES wardrobe_items(id)
          ON DELETE SET NULL;
        END IF;
      END
      $$;

      -- Создаем индексы для быстрого поиска базовых вещей
      CREATE INDEX IF NOT EXISTS idx_wardrobe_items_is_basic ON wardrobe_items(is_basic);
      CREATE INDEX IF NOT EXISTS idx_wardrobe_items_basic_item_id ON wardrobe_items(basic_item_id);
    `

    // Выполняем миграцию
    const { error } = await supabase.rpc("exec_sql", { sql: migrationSQL })

    if (error) {
      console.error("Error executing migration:", error)
      return NextResponse.json({ error: `Failed to execute migration: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Migration completed successfully" })
  } catch (error) {
    console.error("Unexpected error in migration API:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
