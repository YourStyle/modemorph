#!/usr/bin/env python3
"""Pilot probe: does our catalogue actually contain these aesthetics?

Asks /clip/search/text for every phrase behind every "country circle" and dumps
the hits into one HTML contact sheet you can eyeball in a browser. Answers the
only question that gates the whole vibe-circles feature: if "japandi" returns
random beige tees, the circle would lie to the user and no amount of UI fixes it.

Run on the box (the FAISS index and the model live there):
    python3 probe_vibes.py > /tmp/vibes.html

Pure-function self-check (no network, no model):
    python3 probe_vibes.py --self-check
"""

import json
import os
import sys
import urllib.request

AI = os.environ.get("AI_SERVICE_URL", "http://modemorph-ai:8000")

# ponytail: hardcoded, not a config file — this is a throwaway probe. If the
# circles ship, the real list moves into the seeding script next to the INSERT.
VIBES = {
    "Япония": ["japandi minimal outfit", "oversized muted layering", "earth tone linen"],
    "Франция": ["parisian chic outfit", "breton stripe top", "tailored blazer casual"],
    "Италия": ["old money quiet luxury", "sprezzatura tailoring", "knit polo trousers"],
    "Америка": ["preppy college outfit", "workwear denim", "varsity streetwear"],
    "Корея": ["korean soft minimal", "cropped proportions pastel"],
    "Скандинавия": ["scandi minimal monochrome", "neutral oversized coat"],
}

K = 12


def search(phrase: str) -> list[dict]:
    body = json.dumps({"query_text": phrase, "k": K}).encode()
    req = urllib.request.Request(
        f"{AI}/clip/search/text", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("results", [])


def render(sheet: dict[str, list[tuple[str, list[dict]]]]) -> str:
    """Pure formatter: {vibe: [(phrase, results)]} -> HTML. Unit-checkable."""
    out = ["<meta charset=utf-8><style>",
           "body{background:#111;color:#eee;font:13px system-ui}",
           "img{width:110px;height:145px;object-fit:cover;background:#222}",
           "h2{margin:24px 0 4px}p{color:#888;margin:8px 0 2px}",
           "</style>"]
    for vibe, probes in sheet.items():
        out.append(f"<h2>{vibe}</h2>")
        for phrase, results in probes:
            out.append(f"<p>{phrase} — {len(results)} hits</p><div>")
            for it in results:
                url = it.get("image_url") or ""
                # FAISS meta calls it `name`, not `item_name` (routes.py index meta).
                name = (it.get("name") or "").replace('"', "'")
                score = it.get("score")
                title = f"{name} | {score}"
                out.append(f'<img src="{url}" title="{title}" loading=lazy>')
            out.append("</div>")
    return "\n".join(out)


def main() -> None:
    sheet = {}
    for vibe, phrases in VIBES.items():
        probes = []
        for p in phrases:
            try:
                probes.append((p, search(p)))
            except Exception as e:                       # probe must not die mid-run
                print(f"[warn] {vibe}/{p}: {e}", file=sys.stderr)
                probes.append((p, []))
        sheet[vibe] = probes
        got = sum(len(r) for _, r in probes)
        print(f"[probe] {vibe}: {got} hits", file=sys.stderr)
    print(render(sheet))


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        html = render({"Япония": [("japandi minimal outfit", [
            {"image_url": "http://x/a.jpg", "name": 'Рубашка "лён"', "score": 0.31},
        ])]})
        assert "Япония" in html and "1 hits" in html, html
        assert "http://x/a.jpg" in html, html
        assert '"лён"' not in html and "'лён'" in html, "quotes must not break the attr"
        assert render({}) == render({}), "render is pure"
        assert "<img" not in render({"X": [("empty", [])]}), "no results -> no imgs"
        print("probe_vibes self-check OK")
    else:
        main()
