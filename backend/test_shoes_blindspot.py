"""Обувь была слепым пятном сразу в трёх механизмах — этот тест держит все три.

Найдено на живых рекомендациях (пользователь male, +19°C, 17.08.2026):
мужчине приехали «Ботильоны с круглым мысом» и «Мюли на танкетке» (gender=NULL),
сандалии при +19 с дождём, а гэп-подсказка «нет обуви» не появилась при нуле
обуви в гардеробе.

Запуск:  python3 backend/test_shoes_blindspot.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.catalog_filters import gender_ok  # noqa: E402
from app.services.weather_rules import temp_ok  # noqa: E402


def test_temp_ranges_cover_shoes():
    """Раньше у обуви не было температурного окна вообще → temp_ok пропускал всё."""
    sandals = {"clothing_type": "sandals", "item_name": "Сандалии на липучках"}
    boots = {"clothing_type": "boots", "item_name": "Ботильоны с круглым мысом"}
    sneakers = {"clothing_type": "sneakers", "item_name": "Кроссовки"}

    # именно этот случай видел пользователь: сандалии в дождливые +19
    assert not temp_ok(sandals, 19), "сандалии не должны предлагаться при +19"
    assert temp_ok(sandals, 27), "при +27 сандалии уместны"

    assert not temp_ok(boots, 25), "ботильоны не должны предлагаться в жару"
    assert temp_ok(boots, 5), "при +5 ботильоны уместны"

    assert temp_ok(sneakers, 19), "кроссовки уместны почти всегда"

    # явные temp_min/temp_max из БД по-прежнему главнее вывода по типу
    assert temp_ok({"clothing_type": "sandals", "temp_min": 0, "temp_max": 40}, 19)


def test_female_footwear_does_not_leak_to_men():
    """У всей каталожной обуви в проде gender=NULL, спасало только имя — а обуви в нём не было."""
    for name in ("Ботильоны с круглым мысом", "Мюли на танкетке",
                 "Босоножки на шпильке", "Туфли-лодочки", "Балетки кожаные"):
        item = {"item_name": name, "gender": None}
        assert not gender_ok(item, "male"), f"мужчине не должны показываться: {name}"
        assert gender_ok(item, "female"), f"женщине должны показываться: {name}"

    # мужская и нейтральная обувь не задета
    for name in ("Кроссовки беговые", "Ботинки челси", "Мужские туфли оксфорды"):
        assert gender_ok({"item_name": name, "gender": None}, "male"), name

    # без известного пола пользователя фильтр не вмешивается
    assert gender_ok({"item_name": "Мюли на танкетке", "gender": None}, None)


def test_shoes_counted_as_gap():
    """Гардероб без обуви обязан давать гэп, даже когда остальные слоты закрыты."""
    from app.api.recommendations import _detect_gaps

    wardrobe = (
        [{"clothing_type": "shirt"}] * 3
        + [{"clothing_type": "t-shirt"}]
        + [{"clothing_type": "pants"}] * 3
        + [{"clothing_type": "jeans"}]
        + [{"clothing_type": "cardigan"}, {"clothing_type": "sweatshirt"}]
        + [{"clothing_type": "coat"}]
    )
    weather = {"temperature": 19}

    gaps = _detect_gaps(wardrobe, weather, "male")
    assert "shoes" in gaps, f"нет обуви — обязан быть гэп 'shoes', получили {gaps}"

    # с обувью гэпа быть не должно
    gaps2 = _detect_gaps(wardrobe + [{"clothing_type": "sneakers"}], weather, "male")
    assert "shoes" not in gaps2, f"обувь есть, гэпа быть не должно: {gaps2}"


if __name__ == "__main__":
    test_temp_ranges_cover_shoes()
    test_female_footwear_does_not_leak_to_men()
    test_shoes_counted_as_gap()
    print("OK — все три механизма держат обувь")
