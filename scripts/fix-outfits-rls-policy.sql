-- Добавляем политику для просмотра всех образов на странице вдохновения
-- Это позволит пользователям видеть образы других пользователей для вдохновения

-- Создаем новую политику для SELECT, которая позвол����т видеть все образы
CREATE POLICY "Users can view all outfits for inspiration" ON "public"."outfits"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

-- Также нужно добавить политику для outfit_items, чтобы можно было получать вещи из образов
CREATE POLICY "Users can view all outfit items for inspiration" ON "public"."outfit_items"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

-- Проверяем, что политики созданы
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('outfits', 'outfit_items')
ORDER BY tablename, policyname;
