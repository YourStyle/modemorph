"""Ни один обработчик не должен звать `db`, не попросив его у FastAPI.

`detect_clothing` полгода звал `await record_usage_event(db, ...)`, не объявив
`db: AsyncSession = Depends(get_db)`. Это NameError на КАЖДОЙ оцифровке, но
падало оно после `/api/check-limits`, то есть уже после списания: человек
платил и получал 500. Юнит-тестов на эндпоинт нет (моки OpenRouter + S3), CI
питон вообще не гоняет — поймать было нечем.

Проверка статическая: ast, без импорта модуля и без pytest.
Запуск: python3 backend/app/api/test_db_dependency.py
"""

import ast
from pathlib import Path

API_DIR = Path(__file__).resolve().parent


def _bound_names(node: ast.AST) -> set[str]:
    """Всё, что внутри функции связывается: аргументы, присваивания, with/for."""
    names = set()
    for n in ast.walk(node):
        if isinstance(n, ast.arg):
            names.add(n.arg)
        elif isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            names.add(n.id)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            names.add(n.name)
    return names


def undeclared_db_users(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    broken = []
    for fn in tree.body:
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        loads_db = any(
            isinstance(n, ast.Name) and n.id == "db" and isinstance(n.ctx, ast.Load)
            for n in ast.walk(fn)
        )
        if loads_db and "db" not in _bound_names(fn):
            broken.append(f"{path.name}:{fn.lineno} {fn.name}")
    return broken


def test_no_handler_uses_an_undeclared_db():
    broken = [
        hit
        for path in sorted(API_DIR.glob("*.py"))
        if not path.name.startswith("test_")
        for hit in undeclared_db_users(path)
    ]
    assert not broken, "db без Depends(get_db) — 500 на каждом запросе: " + ", ".join(broken)


if __name__ == "__main__":
    test_no_handler_uses_an_undeclared_db()
    print("ok")
