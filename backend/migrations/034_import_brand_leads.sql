-- Перенос пайплайна из xlsx «Бренды_mode morph» (19 брендов, снимок 22.08.2026).
--
-- Даты Excel — это порядковые номера от 30.12.1899; переведены в DATE при
-- переносе, иначе «46244» так и осталось бы числом, по которому не отфильтровать.
--
-- Колонка «Показатели» НЕ переносится: она пустая у всех девятнадцати, и она и
-- есть та величина, ради которой всё это переезжает — её считает запрос по
-- каталогу и показам, а не человек руками.
--
-- ON CONFLICT DO NOTHING по имени: миграция повторяемая и не затрёт правки,
-- сделанные аналитиком после переноса.

INSERT INTO brand_leads
  (name, segment, styles, contact, phone, contact_person, status, last_touch_at,
   offer_type, notes, test_start, test_end, test_status, test_notes)
VALUES
  ('Befree', 'Масс-маркет', 'Кэжуал', 'suppliers.befree@melonfashion.com', NULL, NULL, 'Жду ответ', DATE '2026-08-10', NULL, NULL, NULL, NULL, NULL, NULL),
  ('Zolla', 'Масс-маркет', 'Кэжуал', 'tender@zolla.com', NULL, NULL, 'Не начинали', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('All we need', 'Средний', 'Кэжуал, Минимализм, Классический', 'pr@allweneed.ru', NULL, NULL, 'Жду ответ', DATE '2026-08-11', 'Собрать комплект', 'Напомнила о себе 10.08 Позвонила 11.08', NULL, NULL, NULL, NULL),
  ('SHU', 'Средний', 'Минимализм, Кэжуал', 'wholesale@shuclothes.ru', NULL, NULL, 'Жду ответ', DATE '2026-08-11', 'Собрать комплект', 'Напомнила о себе 10.08 Написала на другую почту 11.08', NULL, NULL, NULL, NULL),
  ('Hiss', 'Премиум', 'Кэжуал, Минимализм', 'hiss@hiss.store', '8 800 600 54 02', NULL, 'Не начинали', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('M/\XEL', 'Средний', 'Кэжуал', 'maxel.limited', NULL, NULL, 'Не начинали', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Eve&Esther', 'Премиум', 'Кэжуал', 'info@eveesther.ru', NULL, NULL, 'Не начинали', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('KAKAÓ', 'Средний', 'Романтический, Минимализм', 'kirasvitkova (тг)', NULL, 'Кира', 'Отказались', DATE '2026-08-11', 'Собрать комплект', NULL, NULL, NULL, NULL, NULL),
  ('2NOVYH', 'Средний', 'Кэжуал', '2novyh', NULL, NULL, 'Не начинали', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Lime', 'Средний', 'Кэжуал', 'partners@lime-zaim.ru', NULL, NULL, 'Не начинали', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('Nume', 'Средний', 'Классический, Кантри, Романтический', 'nume.brand', NULL, NULL, 'Не начинали', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('2MOOD', 'Средний', 'Кэжуал, Бохо', '2moodstore / pr@2mood.com', NULL, NULL, 'Жду ответ', DATE '2026-08-03', 'Virtual try-on', 'Поставили письмо в приоритет и скоро ответят', NULL, NULL, NULL, NULL),
  ('MEOW’ONE', 'Средний', 'Авангард', 'PR.meowone \ office@meowone.ru', NULL, NULL, 'Жду ответ', DATE '2026-08-05', 'Собрать комплект', 'Позвонила, скоро просмотрят.', NULL, NULL, NULL, NULL),
  ('Masterpiece', 'Премиум', 'Романтический, Бохо, Минимализм', 'pr@masterpeace.ru', '8 916 794-62-60', NULL, 'Жду ответ', DATE '2026-08-10', NULL, NULL, NULL, NULL, NULL, NULL),
  ('AMRO', 'Средний', 'Романтический, Минимализм', 'Amro.office@yandex.ru', '8 (916) 973-68-39', NULL, 'Жду ответ', DATE '2026-08-10', 'Virtual try-on', NULL, NULL, NULL, NULL, NULL),
  ('ARLIGENT', 'Средний', 'Кэжуал, Авангард, Спортивный', 'ecom@arligent.com', '8 925 095 58 68', NULL, 'Жду ответ', DATE '2026-08-10', 'Virtual try-on', NULL, NULL, NULL, NULL, NULL),
  ('Sodamoda (платформа)', 'Средний', NULL, 'info@sodamoda.ru', NULL, NULL, 'Жду ответ', DATE '2026-08-10', NULL, NULL, NULL, NULL, NULL, NULL),
  ('Toomatch', 'Премиум', NULL, 'shop@toomatch.store', '8 999 499 11 26', NULL, 'Жду ответ', DATE '2026-08-11', NULL, NULL, NULL, NULL, NULL, NULL),
  ('Levitskiy brend', 'Средний', 'Авангард', NULL, NULL, NULL, 'Не начинали', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- Связь с каталогом там, где бренд у нас уже есть. Названия в таблице и в фиде
-- различаются («2MOOD» против «2moodstore»), поэтому сопоставление явное.
UPDATE brand_leads SET catalog_brand = '2MOOD' WHERE lower(name) = '2mood';
