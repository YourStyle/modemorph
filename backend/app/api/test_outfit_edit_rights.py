"""Кто может править и удалять образ.

Две стороны, и обе ломались по-своему (жалоба из админки 24.08):

  * Проверка «только владелец» на PUT и DELETE делала курируемые образы витрины
    нередактируемыми вообще ни для кого: все 61 принадлежат синтетическому
    пользователю 00000000-0000-0000-0000-000000000000, у которого нет ни
    профиля, ни возможности войти. Админка отвечала «Outfit not found» на
    собственный образ.

  * При этом в самом DELETE условие по владельцу оставалось и после проверки
    прав, так что даже пропущенный админ удалял ноль строк — запрос отрабатывал
    «успешно», образ оставался, интерфейс рапортовал об удалении.

Открывать админу доступ нельзя было и просто так: чужой образ обычного
пользователя должен оставаться недоступным.

Запуск:  python3 -m app.api.test_outfit_edit_rights   (из backend/)
"""

import asyncio

from fastapi import HTTPException

from app.api.outfits import _require_can_edit

CURATED_OWNER = "00000000-0000-0000-0000-000000000000"


class _FakeResult:
    def __init__(self, hit): self._hit = hit
    def first(self): return (1,) if self._hit else None


class _FakeDb:
    """Отдаёт строку, если условия запроса совпадают с владельцем образа."""

    def __init__(self, owner, exists=True):
        self.owner, self.exists = owner, exists
        self.queries = []

    async def execute(self, stmt, binds=None):
        sql = " ".join(str(stmt).split())
        self.queries.append(sql)
        if not self.exists:
            return _FakeResult(False)
        if "user_id = :uid" in sql:
            return _FakeResult((binds or {}).get("uid") == self.owner)
        return _FakeResult(True)


def _check(owner, user, exists=True):
    db = _FakeDb(owner, exists)
    asyncio.run(_require_can_edit(db, 1, user))
    return db


def _denied(owner, user, exists=True):
    try:
        _check(owner, user, exists)
    except HTTPException as e:
        return e.status_code
    return None


def test_owner_can_edit_their_own():
    _check(owner="user-a", user={"id": "user-a", "is_admin": False})


def test_stranger_cannot_touch_someone_elses():
    assert _denied(owner="user-a", user={"id": "user-b", "is_admin": False}) == 404


def test_admin_can_edit_the_curated_showcase():
    """Главный случай: у образа витрины нет живого владельца."""
    _check(owner=CURATED_OWNER, user={"id": "admin-1", "is_admin": True})


def test_admin_never_matches_the_owner_check_on_curated():
    """Без исключения для админа этот же образ был бы недоступен."""
    assert _denied(owner=CURATED_OWNER, user={"id": "admin-1", "is_admin": False}) == 404


def test_missing_outfit_is_404_even_for_admin():
    assert _denied(owner=CURATED_OWNER, user={"id": "admin-1", "is_admin": True}, exists=False) == 404


def test_admin_path_does_not_filter_by_owner():
    """Иначе админ «успешно» удалил бы ноль строк."""
    db = _check(owner=CURATED_OWNER, user={"id": "admin-1", "is_admin": True})
    assert not any("user_id = :uid" in q for q in db.queries), (
        "у админа проверка всё ещё сужается по владельцу — удаление станет тихим no-op"
    )


def test_delete_statement_itself_is_not_owner_scoped():
    """Право проверено заранее; повтор условия в DELETE и давал тихий no-op."""
    from pathlib import Path
    src = (Path(__file__).resolve().parent / "outfits.py").read_text()
    tail = src[src.index('@router.delete("/{outfit_id}")'):]
    body = tail[: tail.index("@router.", 10)]
    assert "DELETE FROM outfits WHERE id = :oid AND user_id" not in body, (
        "DELETE снова сужен по владельцу — админ удалит ноль строк и не узнает"
    )


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} проверок пройдено")
