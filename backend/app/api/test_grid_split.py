"""Guards the 2x2 grid slicing used by /api/detect-clothing.

Measured 2026-08-22: one grid call covers up to four garments for 1120 completion
tokens, against 3800 for three separate calls on the same photo — 3.4x cheaper,
and on that sample the footwear came out better inside the grid than alone.

The whole saving rests on cutting the returned square into the right quadrants in
the right order. Get the order wrong and every item silently gets someone else's
picture, which no exception would ever surface.

Run it:  python3 -m app.api.test_grid_split     (from backend/)

ponytail: plain asserts, no pytest — pytest is not installed and CI runs no tests.
"""

import base64
import io

from PIL import Image

from app.api.misc import _GRID_CELLS, _build_grid_prompt, _split_grid


def _grid_uri(colours, size=64):
    """A 2x2 grid whose quadrants are flat colours, in reading order."""
    img = Image.new("RGB", (size, size))
    half = size // 2
    for i, colour in enumerate(colours):
        box = ((i % 2) * half, (i // 2) * half)
        img.paste(Image.new("RGB", (half, half), colour), box)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _colour_of(data_uri):
    raw = base64.b64decode(data_uri.split(",", 1)[1])
    return Image.open(io.BytesIO(raw)).convert("RGB").getpixel((2, 2))


def test_quadrants_come_back_in_prompt_order():
    """Quadrant N must be the item named Nth in the prompt, or items get swapped."""
    colours = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]
    out = _split_grid(_grid_uri(colours), 4)
    assert len(out) == 4
    for i, (got, want) in enumerate(zip(out, colours)):
        assert _colour_of(got) == want, f"quadrant {i} ({_GRID_CELLS[i]}) is the wrong cell"


def test_fewer_than_four_items_takes_the_first_cells():
    out = _split_grid(_grid_uri([(255, 0, 0), (0, 255, 0), (0, 0, 255), (9, 9, 9)]), 3)
    assert len(out) == 3
    assert [_colour_of(u) for u in out] == [(255, 0, 0), (0, 255, 0), (0, 0, 255)]


def test_odd_sized_grid_does_not_crash():
    """Models do not promise even pixel dimensions."""
    assert len(_split_grid(_grid_uri([(1, 2, 3)] * 4, size=65), 4)) == 4


def test_garbage_degrades_to_no_picture():
    """The generation is already paid for; a slicing failure must not lose the item."""
    for bad in ("", None, "not-a-data-uri", "data:image/png;base64,%%%"):
        assert _split_grid(bad, 3) == [None, None, None]


def test_prompt_names_every_quadrant():
    """An unnamed quadrant gets filled with an invented garment."""
    prompt = _build_grid_prompt([{"clothing_item": "shirt", "description_en": "a shirt"}])
    for cell in _GRID_CELLS:
        assert cell in prompt, f"{cell} unnamed — the model will invent something for it"
    assert prompt.count("completely empty") == 3


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} checks passed")
