"""Прайс из админки должен доходить до списания.

Год с лишним не доходил. feature_costs хранила имена wardrobe_digitization,
ai_assistant, ideas_viewing, outfit_creation, ai_try_on; приложение спрашивало
цену по своим ключам — wardrobe_items_anlyzed, ai_requests, ideas_viewed,
outfits_saved, vton_used. Пересечений ноль, запрос не находил ничего, срабатывал
`return 1`, и каждая функция списывала один кредит. Экран цен при этом работал:
значение сохранялось, просто ничего не значило.

Такую поломку нельзя заметить по логам — ошибки нет, есть тихий дефолт. Поэтому
проверка на совпадение ключей и живёт в тестах, а не в голове.

Запуск:  python3 -m app.api.test_feature_costs     (из backend/)

ponytail: подставная db на совпадение подстрок в SQL, без сервера и без базы.
"""

import asyncio
import re
from pathlib import Path

from app.api.limits import ALLOWED_FEATURES, _get_feature_cost, _use_feature

_MIGRATION = (Path(__file__).resolve().parents[2] / "migrations" / "037_feature_costs_wiring.sql").read_text()


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class _FakeDB:
    """Отвечает по подстроке в SQL, а не по порядку вызовов: тест не должен
    падать от перестановки строк в _use_feature, только от смены поведения."""

    def __init__(self, cost_row, credits=99, limit_left=None):
        self.cost_row = cost_row
        self.credits = credits
        self.limit_left = limit_left
        self.sql = []

    async def execute(self, stmt, params=None):
        s = str(stmt)
        self.sql.append(s)
        if "user_subscriptions" in s:
            return _FakeResult(None)          # не подписчик
        if "UPDATE limits" in s:
            return _FakeResult(self.limit_left)  # бесплатный лимит исчерпан
        if "feature_costs" in s:
            return _FakeResult(self.cost_row)
        if "user_credits" in s:
            return _FakeResult((self.credits,))
        return _FakeResult(None)


def test_migration_keys_match_the_app():
    """Единственная проверка, которая ловит исходный баг."""
    renamed_to = set(re.findall(r"SET\s+feature_name = '([a-z_]+)'", _MIGRATION))
    assert renamed_to == ALLOWED_FEATURES, (
        f"таблица цен разошлась с приложением: лишние {renamed_to - ALLOWED_FEATURES}, "
        f"недостающие {ALLOWED_FEATURES - renamed_to}"
    )


def test_migration_leaves_no_old_key_behind():
    renamed_from = set(re.findall(r"WHERE feature_name = '([a-z_]+)';", _MIGRATION))
    assert len(renamed_from) == 5, f"переименовано {len(renamed_from)} строк из 5"
    assert not (renamed_from & ALLOWED_FEATURES), "старое имя совпало с ключом приложения"


def test_one_row_per_feature_is_enforced():
    """Две строки на один ключ = цена выбирается случайно, тем же молчанием."""
    assert "UNIQUE INDEX" in _MIGRATION and "feature_costs (feature_name)" in _MIGRATION


def test_active_row_is_charged():
    assert asyncio.run(_get_feature_cost(_FakeDB((6, True)), "vton_used")) == 6


def test_inactive_row_is_free():
    """Тумблер в админке должен что-то значить."""
    assert asyncio.run(_get_feature_cost(_FakeDB((6, False)), "vton_used")) == 0


def test_missing_row_falls_back_to_one_not_zero():
    """Сломанный конфиг должен стоить дёшево, но не быть бесплатным: ноль от
    опечатки в ключе раздал бы примерку даром и никто бы не заметил."""
    assert asyncio.run(_get_feature_cost(_FakeDB(None), "vton_used")) == 1


def test_zero_cost_never_touches_credits():
    """Идеи и образы бесплатны. Без явной ветки на ноль списание -0 проходит
    успешно и пишет в журнал транзакцию ни о чём — на каждый просмотр."""
    db = _FakeDB((0, True))
    ok, _ = asyncio.run(_use_feature(db, 1, "ideas_viewed", 1))
    assert ok, "бесплатная функция обязана срабатывать при нулевом балансе"
    assert not any("credit_transactions" in s for s in db.sql), "записана транзакция на ноль"
    assert not any("UPDATE user_credits" in s for s in db.sql), "тронут баланс при нулевой цене"


def test_priced_feature_still_charges():
    """Обратная сторона той же ветки: платное не должно стать бесплатным."""
    db = _FakeDB((6, True))
    ok, _ = asyncio.run(_use_feature(db, 1, "vton_used", 1))
    assert ok
    assert any("credit_transactions" in s for s in db.sql), "списание не попало в журнал"


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} checks passed — {len(ALLOWED_FEATURES)} тарифицируемых функций")
