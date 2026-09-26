"""Error digest grouping and formatting (api/errors.py) — pure, no DB."""
from datetime import datetime, timedelta, timezone

from app.api.errors import DIGEST_GROUPS, format_digest, group_errors

T = datetime(2026, 9, 26, 9, 0, tzinfo=timezone.utc)


def row(loc, msg, user=None, minutes=0, source="backend"):
    return {"source": source, "location": loc, "message": msg, "detail": None, "status": 500,
            "user_id": user, "occurred_at": T + timedelta(minutes=minutes)}


def test_group_errors_merges_ids_and_numbers():
    rows = [
        row("GET /api/looks/123?x=1", "KeyError: 17", "u1"),
        row("GET /api/looks/456", "KeyError: 42", "u2", minutes=5),
        row("GET /api/looks/789", "KeyError: 42", "u2", minutes=9),
        row("POST /api/me/profile-session [tma]", "401 after token refresh", "u3", source="client"),
    ]
    groups = group_errors(rows)
    assert len(groups) == 2
    top = groups[0]  # two distinct users beat one
    assert top["location"] == "GET /api/looks/:id" and top["count"] == 3 and top["users"] == {"u1", "u2"}
    assert top["first"] == T and top["last"] == T + timedelta(minutes=9)
    # uuid segments collapse too
    g = group_errors([row("GET /api/x/0b6e1c7a-1111-2222-3333-444455556666", "boom")])
    assert g[0]["location"] == "GET /api/x/:id"


def test_format_digest():
    groups = group_errors([row("GET /api/a", "<b>boom</b>", "u1"),
                           row("GET /api/b", "other", source="client")])
    msg = format_digest(groups, {0: "проверь <кэш>"})
    assert "12:00–12:00 МСК" in msg                      # UTC 09:00 shown in Moscow time
    assert "&lt;b&gt;boom&lt;/b&gt;" in msg and "проверь &lt;кэш&gt;" in msg   # HTML-escaped
    assert "(сервер)" in msg and "(браузер)" in msg
    many = group_errors([row(f"GET /api/p{i}", f"e{chr(97 + i)}") for i in range(DIGEST_GROUPS + 3)])
    msg = format_digest(many, {})
    assert "…и ещё 3 видов ошибок, 3 шт." in msg and len(msg) <= 4000
