"""Standalone check for the per-item crop logic in misc.py's
_crop_item_bytes(). Verifies the r2 fix for the r1 bug where every
detected item shared one whole-scene remove-bg photo (5 items -> 5
identical portraits):
  1. Different bboxes -> different (non-identical) per-item crop bytes.
  2. Crops are smaller than the full image.
  3. Malformed/missing bbox safely falls back to None (caller uses the
     full photo for that one item, same as pre-r2 behavior).

Run: python3 backend/app/api/test_detect_clothing_crop.py

The crop function is duplicated here rather than imported from misc.py,
because importing misc.py pulls in the full app.* package chain
(fastapi/httpx/sqlalchemy/app.core.config) just to exercise pure
PIL crop math — those deps aren't needed for this check and may not be
installed everywhere this test is run. Only Pillow is required (already
a backend dependency, see requirements.txt). If _crop_item_bytes's
behavior in misc.py changes, update this copy to match.
"""
import io
import os

from PIL import Image

IMG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "test", "clothes1.jpg")


def _crop_item_bytes(full_img: Image.Image, bbox):
    """Copy of misc.py:_crop_item_bytes — keep in sync."""
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return None
    try:
        x_min, y_min, x_max, y_max = (float(v) for v in bbox)
    except (TypeError, ValueError):
        return None
    if not (0 <= x_min < x_max <= 1 and 0 <= y_min < y_max <= 1):
        return None

    w, h = full_img.size
    pad_x = (x_max - x_min) * 0.08
    pad_y = (y_max - y_min) * 0.08
    left = max(0, int((x_min - pad_x) * w))
    upper = max(0, int((y_min - pad_y) * h))
    right = min(w, int((x_max + pad_x) * w))
    lower = min(h, int((y_max + pad_y) * h))
    if right - left < 10 or lower - upper < 10:
        return None

    buf = io.BytesIO()
    full_img.crop((left, upper, right, lower)).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def main():
    img = Image.open(IMG_PATH).convert("RGB")
    print("full image size:", img.size)

    full_buf = io.BytesIO()
    img.save(full_buf, format="JPEG", quality=90)
    full_bytes = full_buf.getvalue()
    print("full-image JPEG bytes:", len(full_bytes))

    # Plausible non-overlapping bboxes for a 4-item photo (top, bottom,
    # shoes, bag), as detection would return them.
    mock_items = {
        "upper (jacket)": [0.20, 0.10, 0.85, 0.55],
        "lower (jeans)": [0.25, 0.50, 0.80, 0.85],
        "footwear": [0.30, 0.85, 0.70, 1.00],
        "accessory (bag)": [0.55, 0.30, 0.95, 0.60],
    }

    crops = {}
    for name, bbox in mock_items.items():
        b = _crop_item_bytes(img, bbox)
        assert b is not None, f"{name}: crop unexpectedly None"
        crops[name] = b
        print(f"{name}: bbox={bbox} -> crop {len(b)} bytes ({len(b) / len(full_bytes) * 100:.1f}% of full image)")

    byte_sets = list(crops.values())
    for i in range(len(byte_sets)):
        for j in range(i + 1, len(byte_sets)):
            assert byte_sets[i] != byte_sets[j], "two different-bbox items produced identical crop bytes"
    print("PASS: all per-item crops are distinct (no shared whole-scene photo)")

    for name, b in crops.items():
        assert len(b) < len(full_bytes), f"{name}: crop is not smaller than full image"
    print("PASS: every per-item crop is smaller than the full-image JPEG")

    r1_total = len(full_bytes) * len(mock_items)
    r2_total = sum(len(b) for b in crops.values())
    print(f"r1 (shared whole-image): {r1_total} bytes to remove-bg (serial)")
    print(f"r2 (per-item crop):      {r2_total} bytes to remove-bg (parallel)")
    print(f"bytes-to-remove-bg reduction vs r1: {(1 - r2_total / r1_total) * 100:.1f}%")

    assert _crop_item_bytes(img, None) is None
    assert _crop_item_bytes(img, [0.1, 0.1]) is None
    assert _crop_item_bytes(img, [0.5, 0.1, 0.1, 0.9]) is None
    assert _crop_item_bytes(img, [1.5, 0.1, 2.0, 0.9]) is None
    print("PASS: malformed/missing bbox correctly falls back to None")

    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    main()
