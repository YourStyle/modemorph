"""Замок на образы для бесплатных и судья образов."""
import asyncio

from app.api import recommendations as rec


def _sec(n, source="user_only"):
    return {"title": f"s{n}", "source": source,
            "suggestions": [{"id": f"o{n}", "title": "t", "items": [{"id": 1, "name": "брюки", "image_url": "u"}]}]}


def test_free_sees_first_sections_rest_locked_without_items():
    secs = [_sec(0), {"title": "gap", "source": "wardrobe_gap", "suggestions": [{"items": []}]}] + [_sec(i) for i in range(1, 9)]
    out = rec._lock_for_free(secs, paid=False)
    opened = [s for s in out if not s.get("locked") and s["source"] != "wardrobe_gap"]
    locked = [s for s in out if s.get("locked")]
    assert len(opened) == rec._FREE_OPEN_SECTIONS
    assert len(locked) == 9 - rec._FREE_OPEN_SECTIONS
    assert locked[0]["suggestions"][0]["items"] == [{"image_url": "u"}], "у закрытых не должно быть вещей — только картинки"
    assert any(s["source"] == "wardrobe_gap" for s in out), "витрина дыр гардероба не закрывается"


def test_paid_gets_everything_open():
    secs = [_sec(i) for i in range(10)]
    assert rec._lock_for_free(secs, paid=True) == secs


def test_judge_failure_keeps_outfits(monkeypatch):
    monkeypatch.setattr(rec, "OPENROUTER_URL", "http://127.0.0.1:9/")
    secs = [_sec(0), _sec(1)]
    assert asyncio.run(rec._judge_outfits("k", secs)) == secs
