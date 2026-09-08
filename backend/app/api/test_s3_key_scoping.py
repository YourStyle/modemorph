"""Ключи S3 несут владельца, а бесхозных ручек list/delete нет.

Аудит 2026-09-08. Обе ручки требовали аутентификации, но не проверяли владение:
`GET /yandex-s3/list` звал list_objects_v2 без Prefix (любой залогиненный
пользователь перечислял до 100 объектов общего бакета), а `DELETE
/yandex-s3/delete` сверял префиксы ("upload-", "avatars/", "users/<свой-id>/"),
из которых первые два — ровно то пространство имён, где лежали файлы всех.
Ключ для удаления брался из первой ручки.

Ручки удалены (единственный вызывающий — компонент, который нигде не подключён),
а ключи новых объектов теперь начинаются с users/<uid>/. Этот тест держит оба
факта: если кто-то вернёт плоский ключ или бесхозную ручку, он покраснеет.

Запуск:  python3 -m app.api.test_s3_key_scoping     (из backend/)

ponytail: plain asserts, без pytest — pytest не установлен.
"""

from app.api import upload
from app.api.upload import _user_key

UID = "11111111-2222-3333-4444-555555555555"
OTHER = "99999999-8888-7777-6666-555555555555"


def test_key_carries_the_owner():
    assert _user_key(UID, "", "abc123", "jpg") == f"users/{UID}/abc123.jpg"
    assert _user_key(UID, "avatars", "abc123", "png") == f"users/{UID}/avatars/abc123.png"


def test_folder_cannot_escape_the_user_prefix():
    """`folder` — параметр запроса, его целиком выбирает вызывающий.

    Без санитайза `folder="users/<чужой-uuid>"` записал бы объект под чужой
    префикс и подделал бы признак владения.
    """
    for hostile in (f"users/{OTHER}", "../..", "a/b", "avatars/../..", "/", "."):
        key = _user_key(UID, hostile, "abc123", "jpg")
        assert key.startswith(f"users/{UID}/"), (hostile, key)
        assert OTHER not in key, (hostile, key)
        # ровно один сегмент после uid — папка не протащила свои слэши
        assert key.count("/") == 2, (hostile, key)


def test_extension_cannot_smuggle_a_path():
    key = _user_key(UID, "", "abc123", "jpg/../../evil")
    assert key.startswith(f"users/{UID}/")
    assert key.count("/") == 2, key


def test_unowned_bucket_routes_are_gone():
    """list/delete не должны вернуться без проверки владения по БД."""
    paths = {getattr(r, "path", "") for r in upload.router.routes}
    assert "/yandex-s3/list" not in paths, "list вернулся — нужен Prefix по пользователю"
    assert "/yandex-s3/delete" not in paths, (
        "delete вернулся — владение надо резолвить из БД: у 1141 вещи и 12 аватаров "
        "плоские легаси-ключи, по которым владельца не узнать"
    )
    assert not hasattr(upload, "list_s3")
    assert not hasattr(upload, "delete_s3")


if __name__ == "__main__":
    import sys

    passed = failed = 0
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            try:
                _fn()
                passed += 1
                print("ok  ", _name)
            except AssertionError as exc:
                failed += 1
                print("FAIL", _name, exc)
    print(f"\n{passed} проверки пройдены, {failed} провалено")
    sys.exit(1 if failed else 0)
