"""Детектор «модель вернула исходное фото» не должен браковать настоящую примерку."""
import base64
import io

from PIL import Image, ImageDraw

from app.api.misc import _data_uri_md5, _data_uri_phash, _phash_hamming, _vton_is_echo


def _figure(torso: str, legs: str, *, quality: int = 95, scale: float = 1.0) -> str:
    """Студийное фото: светлый фон, та же поза, меняется только цвет одежды."""
    img = Image.new("RGB", (300, 600), (240, 240, 238))
    d = ImageDraw.Draw(img)
    d.ellipse((125, 40, 175, 100), fill=(220, 190, 170))      # голова
    d.rectangle((105, 110, 195, 300), fill=torso)              # верх
    d.rectangle((110, 300, 190, 540), fill=legs)               # низ
    if scale != 1.0:
        img = img.resize((int(300 * scale), int(600 * scale)))
    b = io.BytesIO()
    img.save(b, "JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def _check(avatar: str, generated: str) -> bool:
    return _vton_is_echo(avatar, _data_uri_md5(avatar), _data_uri_phash(avatar), generated)[0]


def test_reencoded_avatar_is_an_echo():
    avatar = _figure((250, 250, 250), (200, 180, 150))
    assert _check(avatar, avatar)
    assert _check(avatar, _figure((250, 250, 250), (200, 180, 150), quality=60, scale=0.9))


def test_changed_outfit_same_pose_is_not_an_echo():
    # Цвета одинаковой яркости, разного оттенка: ч/б dHash их не различает (как
    # удачные примерки 28.09.2026 с dist 3–6), различает только цвет.
    avatar = _figure((200, 60, 60), (60, 60, 200))              # красный верх, синий низ
    tried_on = _figure((40, 140, 40), (130, 70, 20))            # зелёный верх, рыжий низ
    dist = _phash_hamming(_data_uri_phash(avatar), _data_uri_phash(tried_on))
    assert dist is not None and dist <= 6, f"пример должен обманывать dHash, dist={dist}"
    assert not _check(avatar, tried_on), "удачная примерка отбракована как повтор аватара"
