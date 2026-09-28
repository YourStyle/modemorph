"""Источник перехода из start_param подписанного initData."""
from urllib.parse import urlencode

from app.api.auth import _attribution_param


def _raw(**kw):
    return urlencode({"auth_date": "1", "hash": "x", **kw})


def test_source_and_referral_are_taken():
    assert _attribution_param(_raw(start_param="src_fashionchannel")) == "src_fashionchannel"
    assert _attribution_param(_raw(start_param="ref_REF4GTNLQ")) == "ref_REF4GTNLQ"


def test_other_params_and_garbage_are_ignored():
    assert _attribution_param(_raw()) is None
    assert _attribution_param(_raw(start_param="bc12")) is None, "рассылки считает клиент"
    assert _attribution_param(_raw(start_param="src_")) is None
    assert _attribution_param(_raw(start_param="src_a b")) is None
    assert _attribution_param(_raw(start_param="src_" + "x" * 61)) is None
