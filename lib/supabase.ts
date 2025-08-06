import { createClient } from './supabase/client'

// Экспорт для совместимости
export const supabase = createClient()

// Реэкспорт функции создания клиента
export { createClient } from './supabase/client'
