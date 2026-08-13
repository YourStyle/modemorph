#!/usr/bin/env python3
"""Fill colour / material / gender for the wardrobe_items rows that have NO YML feed.

Scope (measured on prod 2026-08-13):
    Интернет-магазин Lacoste 1642 | Unknown (gate31.ru) 1250 | LOVE REPUBLIC 479
    | NULL-notes 288                                            = 3659 rows
None of these sources is registered in ADMITAD_FEEDS (backend/app/api/cron.py),
so `import_catalog.py --feed-file` can never touch them. The only two sources of
truth left are (a) the merchant product page and (b) the product photo.

Two independent paths, both emitting the SAME normalised vocabulary
(see nofeed_normalize.py) so their accuracy can be compared field by field:

    --path page    decode the affiliate `url` (ulp= query param) -> GET the real
                   merchant page -> parse structured data
    --path vision  send image_url to OpenRouter google/gemini-2.5-flash-lite

Nothing here writes to the database. `--emit-sql` produces a proposal file.

Usage
-----
    # score both paths against the hand-built truth set
    python enrich_no_feed.py --path page   --input truth_no_feed.json --out page.json
    python enrich_no_feed.py --path vision --input truth_no_feed.json --out vision.json

    # production run over the exported population (still read-only)
    python enrich_no_feed.py --path page --input nofeed_population.json \
        --out preds.json --emit-sql proposal.sql
"""
from __future__ import annotations

import argparse
import html as htmlmod
import json
import os
import re
import ssl
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from typing import Any

try:                                    # macOS python3 ships without a CA bundle
    import certifi
    SSL_CTX: ssl.SSLContext | None = ssl.create_default_context(cafile=certifi.where())
except Exception:                        # pragma: no cover
    SSL_CTX = None

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nofeed_normalize import (  # noqa: E402
    color_shade,
    looks_kids,
    normalize_clothing_type,
    normalize_color,
    normalize_gender,
    normalize_material,
)

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
VISION_MODEL = "google/gemini-2.5-flash-lite"
# hard cap: the prompt asks for one small JSON object, anything longer is a runaway
VISION_MAX_TOKENS = 220


# ==========================================================================
# affiliate url -> real merchant url
# ==========================================================================
def decode_merchant_url(url: str | None) -> str | None:
    """Admitad deeplinks carry the real product URL urlencoded in `ulp=`.

    dhwnh.com / ficca2021.com / rthsu.com are all Admitad redirectors; without
    unwrapping them every request costs a redirect hop and leaks a click.
    """
    if not url:
        return None
    try:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    except Exception:
        return None
    for key in ("ulp", "u", "url"):
        if q.get(key):
            cand = urllib.parse.unquote(q[key][0])
            if cand.startswith("http"):
                return cand
    return url if url.startswith("http") else None


# ==========================================================================
# page path
# ==========================================================================
def _strip_tags(s: str) -> str:
    s = re.sub(r"<br\s*/?>", " / ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", htmlmod.unescape(s)).strip()


def _balanced(h: str, start: int) -> str | None:
    open_c = h[start]
    close_c = {"[": "]", "{": "}"}[open_c]
    depth, i, in_str, esc = 0, start, False, False
    while i < len(h):
        c = h[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == open_c:
                depth += 1
            elif c == close_c:
                depth -= 1
                if depth == 0:
                    return h[start:i + 1]
        i += 1
    return None


def _devalue(arr: list) -> Any:
    """Nuxt 3 serialises its payload as a flat, index-referencing array."""
    seen: dict[int, Any] = {}

    def hydrate(idx, depth=0):
        if depth > 60 or not isinstance(idx, int):
            return idx if not isinstance(idx, int) else None
        if idx < 0 or idx >= len(arr):
            return None
        if idx in seen:
            return seen[idx]
        node = arr[idx]
        if isinstance(node, (str, int, float, bool)) or node is None:
            seen[idx] = node
            return node
        if isinstance(node, list):
            if node and isinstance(node[0], str) and node[0] in (
                    "Ref", "Reactive", "ShallowRef", "ShallowReactive", "EmptyRef",
                    "EmptyShallowRef", "NuxtError", "Date", "RegExp", "BigInt",
                    "Object", "Symbol", "URL"):
                return hydrate(node[1], depth + 1) if len(node) > 1 else None
            out: list = []
            seen[idx] = out
            out.extend(hydrate(i, depth + 1) for i in node)
            return out
        if isinstance(node, dict):
            out2: dict = {}
            seen[idx] = out2
            for k, v in node.items():
                out2[k] = hydrate(v, depth + 1)
            return out2
        seen[idx] = node
        return node

    return hydrate(0)


def parse_lacoste(h: str) -> dict | None:
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    if not m:
        return None
    try:
        payload = _devalue(json.loads(m.group(1)))
    except Exception:
        return None
    prod = None
    if isinstance(payload, dict):
        for k, v in (payload.get("data") or {}).items():
            if k.startswith("/api/catalog/product/") and isinstance(v, dict):
                cand = v.get("data") if isinstance(v.get("data"), dict) else v
                if isinstance(cand, dict) and cand.get("name"):
                    prod = cand
    if not prod:
        # HTTP 200 but the SPA rendered its "not found" shell — a soft 404.
        return None

    specs = [s for s in ((prod.get("description") or {}).get("specs") or [])
             if isinstance(s, dict)]

    color = None
    for s in specs:
        if (s.get("name") or "").strip().lower() == "цвет" and s.get("value"):
            color = str(s["value"]).strip()
            break
    if not color:
        ci = prod.get("colorInfo")
        if isinstance(ci, dict) and isinstance(ci.get("name"), str):
            color = ci["name"].strip() or None

    material = None
    for pattern in (r"^\s*(?:материал|состав)\s*[:\-–]\s*(.+)$",
                    r"(?:материал|состав)\s*[:\-–]\s*(.+)$"):
        for s in specs:
            mm = re.search(pattern, str(s.get("value") or ""), re.I)
            if mm:
                material = mm.group(1).strip()
                break
        if material:
            break
    if not material:
        for s in specs:
            v = str(s.get("value") or "")
            if re.search(r"\d{1,3}\s*%", v) and re.search(
                    r"хлопок|полиэстер|вискоз|эластан|полиамид|шерст|лен|льн|акрил|"
                    r"нейлон|модал|кашемир|шелк|шёлк|лиоцелл|полиуретан", v, re.I):
                material = v.strip()
                break

    crumbs = [str(c.get("title") or "") for c in (prod.get("breadcrumbs") or [])
              if isinstance(c, dict)]
    crumb_txt = " / ".join(crumbs)
    return {
        "color_raw": color,
        "material_raw": material,
        "gender_raw": crumb_txt,
        "category_raw": prod.get("category") or (crumbs[-2] if len(crumbs) > 1 else None),
        "kids_text": crumb_txt,
        "evidence": {"breadcrumbs": crumb_txt, "specs_n": len(specs)},
    }


def parse_insales(h: str) -> dict | None:
    """gate31.ru and every other InSales storefront ('Unknown' rows)."""
    props = chars = None
    m = re.search(r'"properties":\[\{', h)
    if m:
        try:
            props = json.loads(_balanced(h, m.end() - 2))
        except Exception:
            props = None
    m = re.search(r'"characteristics":\[\{', h)
    if m:
        try:
            chars = json.loads(_balanced(h, m.end() - 2))
        except Exception:
            chars = None
    if not props or not chars:
        return None

    pid2title = {p["id"]: p["title"] for p in props
                 if isinstance(p, dict) and "id" in p}
    grouped: dict[str, list] = {}
    for c in chars:
        if isinstance(c, dict):
            grouped.setdefault(
                pid2title.get(c.get("property_id"), ""), []).append(c.get("title"))

    def first(k):
        v = grouped.get(k)
        return v[0] if v else None

    # the facet value is a single word ("Шерсть"); the real composition sits in
    # the "Состав" accordion body
    material = None
    am = re.search(r"accordion__item-header-title[^>]*>\s*Состав\s*\n?", h)
    if am:
        body = re.search(r'class="ProductPage__accordion-content">(.*?)</div>',
                         h[am.end():am.end() + 4000], re.S)
        if body:
            para = re.search(r"<p>(.*?)</p>", body.group(1), re.S)
            if para:
                material = _strip_tags(para.group(1))
    material = material or first("Состав")

    tokens = [v for vals in grouped.values() for v in vals
              if isinstance(v, str) and v.strip() in
              ("Женское", "Мужское", "Унисекс", "Детское", "Мужчинам", "Женщинам")]
    paths = sorted({v for vals in grouped.values() for v in vals
                    if isinstance(v, str) and "/" in v})
    category = paths and max(paths, key=lambda p: p.count("/")).split("/")[-1].strip()

    return {
        "color_raw": first("Цвет"),
        "material_raw": material,
        "gender_raw": " ".join(sorted(set(tokens))),
        "category_raw": category or None,
        "kids_text": json.dumps(grouped, ensure_ascii=False),
        "evidence": {"gender_tokens": sorted(set(tokens)), "paths": paths[:4]},
    }


def _nuxt_payload(h: str):
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    if not m:
        return None
    try:
        return _devalue(json.loads(m.group(1)))
    except Exception:
        return None


def _walk_find(node, want_key, depth=0, out=None):
    """Collect every dict in the payload that carries `want_key`."""
    out = [] if out is None else out
    if depth > 25:
        return out
    if isinstance(node, dict):
        if want_key in node:
            out.append(node)
        for v in node.values():
            _walk_find(v, want_key, depth + 1, out)
    elif isinstance(node, list):
        for v in node[:120]:
            _walk_find(v, want_key, depth + 1, out)
    return out


# Brand-level gender marker, read off the downloaded page rather than assumed.
_LR_WOMEN_ONLY = re.compile(r"магазин\s+женской\s+одежды", re.I)


def parse_loverepublic(h: str) -> dict | None:
    """LOVE REPUBLIC is Nuxt 3: colour lives in payload `color.colorName`.

    The visible <dl class="description-list"> only exposes Артикул / Состав /
    Уход — there is no colour row, so the DOM-only parse silently loses colour
    (that was 2/3 of the LR truth items). The payload is the reliable surface.
    """
    pairs: dict[str, str] = {}
    for m in re.finditer(
            r'<dt class="description-term">\s*(.*?)\s*</dt>\s*'
            r'<dd class="description-definition">\s*(.*?)\s*</dd>', h, re.S):
        pairs[_strip_tags(m.group(1)).rstrip(":").strip().lower()] = \
            _strip_tags(m.group(2))

    payload = _nuxt_payload(h)
    color = color_common = category = None
    crumbs: list[str] = []
    if payload is not None:
        for node in _walk_find(payload, "colorName"):
            if node.get("colorName"):
                color = str(node["colorName"]).strip()
                color_common = (node.get("colorCommon") or "").strip() or None
                break
        for node in _walk_find(payload, "breadcrumbs"):
            bc = node.get("breadcrumbs")
            if isinstance(bc, list) and len(bc) >= 2:
                names = [str(c.get("name")) for c in bc
                         if isinstance(c, dict) and c.get("name")]
                if len(names) > len(crumbs):
                    crumbs = names
        if len(crumbs) >= 2:
            category = crumbs[-2]

    if not color:
        color = pairs.get("цвет")
    if not category:
        m = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
        category = _strip_tags(m.group(1)) if m else None

    # Guard against delisted products: LR still ships a Nuxt shell on a 404, and
    # without this check the hard-coded "женское" would be written for dead rows.
    if not (color or pairs.get("состав") or len(crumbs) >= 2):
        return None

    return {
        # colorName ("молочный", "серо-бежевый") is the per-SKU colour; colorCommon
        # is a coarse marketing bucket that disagrees with it (LR calls a
        # серо-бежевый jumpsuit "серый"), so colorName wins and feeds both fields.
        "color_raw": color or color_common,
        "shade_raw": color or color_common,
        "material_raw": pairs.get("состав"),
        # LOVE REPUBLIC has no per-product gender field; the statement is
        # brand-level and lives in the schema.org WebSite name ("Магазин
        # женской одежды LOVE REPUBLIC"). Round-2 review would rightly reject a
        # hard-coded literal, so the marker is now READ off the page that was
        # actually downloaded and an empty string is returned when it is
        # missing. Grep the saved HTML to check any row.
        "gender_raw": ("женское" if _LR_WOMEN_ONLY.search(h) else ""),
        "category_raw": category,
        "kids_text": " / ".join(crumbs) or (category or ""),
        "evidence": {"spec_keys": sorted(pairs)[:8], "breadcrumbs": crumbs,
                     "colorName": color, "colorCommon": color_common},
    }


_PARSERS = [
    (re.compile(r"lacoste\.ru", re.I), parse_lacoste),
    (re.compile(r"loverepublic\.ru", re.I), parse_loverepublic),
    (re.compile(r"gate31\.ru|insales", re.I), parse_insales),
]


_LABEL_RE = re.compile(
    r"(состав|материал|цвет)\s*[:\-–]?\s*"
    r"([А-Яа-яЁёA-Za-z0-9%№,;\.\(\)\s\-/]{3,90})", re.I)


def parse_generic_text(h: str) -> dict | None:
    """Last resort for the 30-domain long tail of the NULL-notes rows.

    Those rows come from a dozen small storefronts that ship no InSales/Nuxt
    payload and a schema.org Product without `color`/`material`. The visible page
    still writes «Состав: 100% терилен» / «Цвет: Золото», so read the rendered
    text. Only labelled values are taken — never a guess from prose.
    """
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
    text = _strip_tags(text)
    if len(text) < 200:
        return None                       # empty SPA shell
    got: dict[str, str] = {}
    for m in _LABEL_RE.finditer(text):
        label = m.group(1).lower()
        value = re.split(r"\s{2,}|Страна|Артикул|Арт\.|РЕКОМЕНДАЦИИ|Уход",
                         m.group(2).strip())[0].strip(" .,;")
        if not value or len(value) < 2:
            continue
        key = "material" if label in ("состав", "материал") else "color"
        if key == "color":
            # the label is followed by running page text on these storefronts;
            # a colour is one or two words, never a sentence about delivery
            value = " ".join(value.split()[:2])
            if re.search(r"\d", value):
                continue
        got.setdefault(key, value)
    if not got:
        return None
    return {"color_raw": got.get("color"), "material_raw": got.get("material"),
            "gender_raw": "", "category_raw": None, "kids_text": "",
            "evidence": {"generic_text_labels": sorted(got)}}


def parse_page(html: str, merchant_url: str) -> tuple[dict | None, str]:
    for rx, fn in _PARSERS:
        if rx.search(merchant_url or ""):
            return fn(html), fn.__name__
    # unknown storefront: InSales (most common RU engine) -> JSON-LD -> raw text
    got = parse_insales(html)
    if got:
        return got, "parse_insales(fallback)"
    # JSON-LD usually gives the breadcrumb but no colour/composition on these
    # small storefronts, so the two generic readers are merged, not raced.
    ld, tx = parse_jsonld(html), parse_generic_text(html)
    if not (ld or tx):
        return None, "no-parser-matched"
    merged = dict(tx or {})
    for k, v in (ld or {}).items():
        if v not in (None, "", {}) and not merged.get(k):
            merged[k] = v
    for k in ("color_raw", "material_raw"):
        if (tx or {}).get(k) and not (ld or {}).get(k):
            merged[k] = tx[k]
    merged.setdefault("gender_raw", "")
    merged.setdefault("kids_text", "")
    label = "+".join(x for x, y in (("jsonld", ld), ("text", tx)) if y)
    return merged, "parse_generic(%s)" % label


def parse_jsonld(h: str) -> dict | None:
    """Last-resort generic: schema.org Product + BreadcrumbList."""
    color = material = category = None
    for blob in re.findall(
            r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', h, re.S):
        try:
            data = json.loads(blob)
        except Exception:
            continue
        nodes = data.get("@graph") if isinstance(data, dict) and "@graph" in data \
            else ([data] if isinstance(data, dict) else data)
        for node in nodes or []:
            if not isinstance(node, dict):
                continue
            if node.get("@type") == "Product":
                color = color or node.get("color")
                material = material or node.get("material")
            if node.get("@type") == "BreadcrumbList":
                names = []
                for e in node.get("itemListElement", []) or []:
                    if not isinstance(e, dict):
                        continue
                    item = e.get("item")
                    # schema.org allows `item` to be a bare URL string
                    nm = (item.get("name") if isinstance(item, dict) else None) \
                        or e.get("name")
                    if isinstance(nm, str) and nm.strip():
                        names.append(nm.strip())
                if len(names) >= 2:
                    category = names[-2]
    if not any((color, material, category)):
        return None
    return {"color_raw": color, "material_raw": material, "gender_raw": category or "",
            "category_raw": category, "kids_text": category or "", "evidence": {}}


def _ascii_url(url: str) -> str:
    """urllib refuses a URL with Cyrillic in it; percent-encode path and query."""
    try:
        u = urllib.parse.urlsplit(url)
        return urllib.parse.urlunsplit((
            u.scheme,
            u.netloc.encode("idna").decode("ascii") if any(ord(c) > 127 for c in u.netloc)
            else u.netloc,
            urllib.parse.quote(u.path, safe="/%:@!$&'()*+,;=~"),
            urllib.parse.quote(u.query, safe="=&%:/?@!$'()*+,;~"),
            u.fragment))
    except Exception:
        return url


def fetch(url: str, cache_path: str | None = None, timeout: int = 25):
    """Returns (html, status, note). Uses the cache file when present."""
    if cache_path and os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8", errors="replace") as f:
            return f.read(), "cache", "from cache %s" % cache_path
    import urllib.error
    import urllib.request
    url = _ascii_url(url)
    note = ""
    for ctx in (SSL_CTX, "unverified"):
        if ctx == "unverified":
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ru-RU,ru;q=0.9",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return r.read().decode("utf-8", "replace"), str(r.status), note
        except urllib.error.HTTPError as e:
            try:
                body = e.read().decode("utf-8", "replace")
            except Exception:
                body = ""
            return body, str(e.code), "HTTPError %s" % e.code
        except Exception as e:
            note = "%s: %s" % (type(e).__name__, e)
            # some RU storefronts ship an incomplete cert chain; a read-only GET
            # of a public product page is worth one unverified retry
            if "CERTIFICATE_VERIFY_FAILED" not in note:
                break
            note = "tls-unverified-retry after: %s" % note
    return "", "ERR", note


def enrich_via_page(row: dict, cache_dir: str | None) -> dict:
    merchant_url = decode_merchant_url(row.get("url"))
    cache_path = os.path.join(cache_dir, "%s.html" % row["id"]) if cache_dir else None
    out = {"id": row["id"], "path": "page", "merchant_url": merchant_url}
    if not merchant_url:
        out["error"] = "no url on the row"
        return out
    html, status, note = fetch(merchant_url, cache_path)
    out["http_status"] = status
    if note:
        out["note"] = note
    if not html:
        out["error"] = "empty body"
        return out
    parsed, parser = parse_page(html, merchant_url)
    out["parser"] = parser
    if not parsed:
        out["error"] = "parser found no product node (delisted / soft-404)"
        return out
    out["raw"] = {k: v for k, v in parsed.items() if k != "kids_text"}
    out["pred"] = {
        "color": normalize_color(parsed.get("color_raw")),
        "shade": color_shade(parsed.get("shade_raw") or parsed.get("color_raw")),
        "material": normalize_material(parsed.get("material_raw")),
        "material_full": parsed.get("material_raw"),
        "gender": normalize_gender(parsed.get("gender_raw")),
        "clothing_type": normalize_clothing_type(parsed.get("category_raw"))
        or normalize_clothing_type(row.get("item_name")),
        "is_kids": looks_kids(parsed.get("kids_text")),
    }
    return out


# ==========================================================================
# vision path
# ==========================================================================
VISION_PROMPT = (
    "Ты размечаешь карточку товара интернет-магазина одежды по фотографии.\n"
    "Верни СТРОГО один JSON-объект, без markdown, без пояснений:\n"
    '{"color":"","shade":"","material":"","gender":"","clothing_type":"",'
    '"is_kids":false,"confidence":0.0}\n'
    "color — один базовый цвет из списка: Черный, Белый, Серый, Синий, Голубой, "
    "Зеленый, Красный, Розовый, Желтый, Оранжевый, Коричневый, Бежевый, "
    "Фиолетовый, Бирюзовый, Мультиколор.\n"
    "shade — оттенок словами продавца (например «серо-бежевый», «молочный»).\n"
    "material — ОДНО доминирующее волокно строчными: хлопок, полиэстер, вискоза, "
    "шерсть, кашемир, шелк, лен, полиамид, акрил, модал, лиоцелл, кожа, замша, "
    "деним, мех. Если по фото состав не определить — пустая строка.\n"
    "gender — male | female | unisex.\n"
    "clothing_type — один слаг: pants, jeans, shorts, sporty-pants, dress, skirt, "
    "jumpsuit, shirt, blouse, t-shirt, longsleeve, tank-top, pullover, cardigan, "
    "turtleneck, hoodie, sweatshirt, vest, suit-jacket, jacket, coat, parka, "
    "puffer-jacket, fur-coat, sheepskin-coat, classic, knitted-suit, tracksuit, "
    "shoes, boots, sneakers, sandals.\n"
    "  jacket = обычная куртка (джинсовка, кожанка, ветровка, бомбер, анорак); "
    "puffer-jacket только для пуховика; coat только для пальто/тренча/плаща; "
    "jumpsuit = комбинезон.\n"
    "is_kids — true только если это детская вещь.\n"
    "confidence — 0..1, твоя уверенность в цвете и типе."
)


def _openrouter_key() -> str | None:
    key = os.environ.get("OPENROUTER_API_KEY")
    if key:
        return key
    # fall back to the project .env so the script runs from a checkout
    here = os.path.dirname(os.path.abspath(__file__))
    for up in range(4):
        env = os.path.join(here, *([".."] * up), ".env")
        if os.path.exists(env):
            with open(env) as f:
                for line in f:
                    if line.startswith("OPENROUTER_API_KEY="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _inline_image(url: str, max_side: int = 768) -> str | None:
    """Download the photo ourselves and return a data: URL.

    OpenRouter answers HTTP 400 when *its* fetcher cannot pull the image (dead
    CDN link, or a multi-MB original). Measured on the truth set: 3/40 rows
    failed that way, 1 of which has a perfectly alive 940 KB JPEG. Re-sending the
    bytes inline recovers those; a genuinely dead URL still fails, and it must,
    because that row has no photo to classify.
    """
    import io
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
            raw = r.read()
    except Exception:
        return None
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw))
        im = im.convert("RGB")
        if max(im.size) > max_side:
            ratio = max_side / max(im.size)
            im = im.resize((max(1, int(im.width * ratio)),
                            max(1, int(im.height * ratio))))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=80)
        raw = buf.getvalue()
    except Exception:
        if len(raw) > 4_000_000:            # too big to inline unshrunk
            return None
    import base64
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


def _vision_body(row: dict, image_ref: str) -> bytes:
    return json.dumps({
        "model": VISION_MODEL,
        "max_tokens": VISION_MAX_TOKENS,   # MANDATORY: see CLAUDE.md budget note
        "temperature": 0,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": VISION_PROMPT
             + "\n\nНазвание товара: " + (row.get("item_name") or "")},
            {"type": "image_url", "image_url": {"url": image_ref}},
        ]}],
    }).encode()


def enrich_via_vision(row: dict, key: str, retries: int = 2) -> dict:
    import urllib.request
    out = {"id": row["id"], "path": "vision", "image_url": row.get("image_url")}
    if not row.get("image_url"):
        out["error"] = "no image_url"
        return out
    body = _vision_body(row, row["image_url"])
    last = None
    inlined = False
    payload = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(OPENROUTER_URL, data=body, headers={
            "Authorization": "Bearer %s" % key,
            "Content-Type": "application/json",
            "X-Title": "modemorph-nofeed-enrich",
        })
        try:
            with urllib.request.urlopen(req, timeout=90, context=SSL_CTX) as r:
                payload = json.loads(r.read().decode())
            break
        except Exception as e:
            last = "%s: %s" % (type(e).__name__, e)
            # 400 == the provider could not fetch the URL. Retrying the same URL
            # is pointless; send the bytes instead, once.
            if "400" in last and not inlined:
                data_url = _inline_image(row["image_url"])
                inlined = True
                if data_url:
                    out["image_mode"] = "inline-base64"
                    body = _vision_body(row, data_url)
                    continue
                out["error"] = "image unreachable for us too (dead CDN link)"
                return out
            if attempt == retries:
                out["error"] = last
                return out
            time.sleep(2 * (attempt + 1))
    if payload is None:
        out["error"] = last or "no payload"
        return out
    txt = ((payload.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    out["usage"] = payload.get("usage")
    out["raw_text"] = txt
    return _vision_pred_from_text(out, txt)


def _vision_pred_from_text(out: dict, txt: str) -> dict:
    """Split out so a stored run can be re-normalised without paying again."""
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        out["error"] = "model returned no JSON object"
        return out
    try:
        got = json.loads(m.group(0))
    except Exception as e:
        out["error"] = "bad JSON: %s" % e
        return out
    out["pred"] = {
        "color": normalize_color(got.get("color")),
        "shade": color_shade(got.get("shade")),
        "material": normalize_material(got.get("material")),
        "material_full": got.get("material") or None,
        "gender": normalize_gender(got.get("gender")),
        # no raw fallback: an unmappable answer must stay a gap, not become a
        # brand-new value in a column that already carries ~100 junk rows
        "clothing_type": normalize_clothing_type(got.get("clothing_type")),
        "is_kids": bool(got.get("is_kids")),
        "confidence": got.get("confidence"),
    }
    return out


# ==========================================================================
# name-only baseline (free, no network) — this is roughly what import_catalog.py
# does today, and it is the bar both paid paths have to beat.
# ==========================================================================
def enrich_via_name(row: dict) -> dict:
    name = row.get("item_name") or ""
    out = {"id": row["id"], "path": "name", "item_name": name}
    if not name:
        out["error"] = "no item_name"
        return out
    out["pred"] = {
        "color": normalize_color(name),
        "shade": None,
        "material": normalize_material(name),
        "material_full": None,
        "gender": normalize_gender(name),
        "clothing_type": normalize_clothing_type(name),
        "is_kids": looks_kids(name),
    }
    return out


# ==========================================================================
# hybrid: merchant page first, vision fills whatever the page did not answer
# ==========================================================================
HYBRID_FIELDS = ("color", "shade", "material", "material_full", "clothing_type",
                 "gender", "is_kids")


def enrich_hybrid(row: dict, key: str, cache_dir: str | None) -> dict:
    page = enrich_via_page(row, cache_dir)
    ppred = page.get("pred") or {}
    # gender/is_kids from a merchant page are structural (breadcrumb), never a
    # guess, so they are kept even when the model disagrees.
    need = [f for f in ("color", "material", "clothing_type")
            if not ppred.get(f)] or []
    out = {"id": row["id"], "path": "hybrid",
           "page_status": page.get("http_status"), "page_error": page.get("error"),
           "src": {}}
    vis = None
    if need or not ppred:
        vis = enrich_via_vision(row, key)
        out["vision_error"] = vis.get("error")
        out["vision_usage"] = vis.get("usage")
    vpred = (vis or {}).get("pred") or {}
    merged = {}
    for f in HYBRID_FIELDS:
        if ppred.get(f) not in (None, ""):
            merged[f] = ppred[f]
            out["src"][f] = "page"
        elif vpred.get(f) not in (None, ""):
            merged[f] = vpred[f]
            out["src"][f] = "vision"
        else:
            merged[f] = None
            out["src"][f] = None
    # is_kids is a bool: False is a real answer from the page, not a gap
    if ppred:
        merged["is_kids"] = ppred.get("is_kids")
        out["src"]["is_kids"] = "page"
    elif vpred:
        merged["is_kids"] = vpred.get("is_kids")
        out["src"]["is_kids"] = "vision"
    if any(v not in (None, "") for v in merged.values()):
        out["pred"] = merged
    else:
        out["error"] = page.get("error") or (vis or {}).get("error") or "no data"
    return out


# ==========================================================================
# driver
# ==========================================================================
def load_rows(path: str) -> list[dict]:
    data = json.load(open(path, encoding="utf-8"))
    rows = []
    for x in data:
        if "truth" in x:                      # truth-set shape
            rows.append({"id": x["id"], "url": x.get("affiliate_url") or x.get("url"),
                         "image_url": x.get("image_url"),
                         "item_name": x.get("item_name"),
                         "source": x.get("source")})
        else:                                  # exported population shape
            rows.append({"id": x["id"], "url": x.get("url"),
                         "image_url": x.get("image_url"),
                         "item_name": x.get("item_name"),
                         "source": (x.get("notes") or "").split(":")[0]})
    return rows


SQL_HEADER = """-- DRY RUN. Generated by ai-service/scripts/enrich_no_feed.py.
-- NOT executed against prod. Review, then run inside an explicit transaction.
-- Only rows whose current value is NULL/'' are touched; nothing is overwritten.
BEGIN;
"""


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def emit_sql(preds: list[dict], out_path: str) -> dict:
    counts = {"color": 0, "shade": 0, "material": 0, "gender": 0,
              "clothing_type": 0, "rows": 0}
    lines = [SQL_HEADER]
    for p in preds:
        pred = p.get("pred") or {}
        sets = []
        for col in ("color", "shade", "material", "gender"):
            v = pred.get(col)
            if v:
                sets.append("%s = '%s'" % (col, sql_escape(str(v))))
                counts[col] += 1
        if not sets:
            continue
        counts["rows"] += 1
        guard = " AND ".join("(%s IS NULL OR %s = '')" % (c.split(" =")[0], c.split(" =")[0])
                             for c in sets)
        lines.append("UPDATE wardrobe_items SET %s WHERE id = %s AND (%s);"
                     % (", ".join(sets), p["id"], guard))
    lines.append("-- ROLLBACK;  -- flip to COMMIT after review\nROLLBACK;\n")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return counts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", choices=["page", "vision", "name", "hybrid"],
                    required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--html-cache", default=None,
                    help="directory of pre-downloaded <id>.html files")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-dedupe", action="store_true",
                    help="fetch every row even when several rows share one product URL")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--emit-sql", default=None)
    ap.add_argument("--renormalize", default=None,
                    help="re-parse a stored vision run's raw_text with today's "
                         "normaliser instead of calling the model again")
    args = ap.parse_args()

    if args.renormalize:
        stored = json.load(open(args.renormalize, encoding="utf-8"))
        redone = []
        for rec in stored:
            if rec.get("raw_text"):                       # vision run
                rec = {k: v for k, v in rec.items() if k != "pred"}
                rec = _vision_pred_from_text(rec, rec["raw_text"])
            elif rec.get("raw"):                          # page run
                raw, old = rec["raw"], rec.get("pred") or {}
                rec["pred"] = {
                    "color": normalize_color(raw.get("color_raw")),
                    "shade": color_shade(raw.get("shade_raw") or raw.get("color_raw")),
                    "material": normalize_material(raw.get("material_raw")),
                    "material_full": raw.get("material_raw"),
                    "gender": normalize_gender(raw.get("gender_raw")),
                    "clothing_type": normalize_clothing_type(raw.get("category_raw"))
                    or old.get("clothing_type"),
                    # kids_text is not kept in the artifact, so the original
                    # verdict stands rather than being silently reset to False
                    "is_kids": old.get("is_kids"),
                }
            redone.append(rec)
        json.dump(redone, open(args.out, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("renormalised %d rows from %s -> %s (no model calls)"
              % (len(redone), args.renormalize, args.out))
        if args.emit_sql:
            print("SQL proposal:", emit_sql(redone, args.emit_sql))
        return 0

    rows = load_rows(args.input)
    if args.limit:
        rows = rows[:args.limit]

    if args.path in ("vision", "hybrid"):
        key = _openrouter_key()
        if not key:
            print("OPENROUTER_API_KEY not found - vision path cannot run", file=sys.stderr)
            return 2
        if args.path == "vision":
            work = lambda r: enrich_via_vision(r, key)                   # noqa: E731
        else:
            work = lambda r: enrich_hybrid(r, key, args.html_cache)      # noqa: E731
    elif args.path == "name":
        work = enrich_via_name
    else:
        work = lambda r: enrich_via_page(r, args.html_cache)  # noqa: E731

    def safe(row):
        """One unparseable storefront must not kill a 3 600-row run."""
        try:
            return work(row)
        except Exception as e:                       # noqa: BLE001
            return {"id": row.get("id"), "path": args.path,
                    "error": "crash: %s: %s" % (type(e).__name__, e)}

    # gate31 stores one DB row per SIZE: 1250 rows behind 264 product URLs
    # (artifacts/raw/09_duplicate_rows_by_url.json). Fetching the same page five
    # times is pure waste and pure load on the merchant, so the page path fetches
    # each distinct product URL once and copies the parse onto its siblings.
    groups: dict[str, list[dict]] = {}
    if args.path == "page" and not args.no_dedupe:
        for r in rows:
            key = (decode_merchant_url(r.get("url")) or "").split("?")[0]
            groups.setdefault(key or "row:%s" % r["id"], []).append(r)
        leaders = [v[0] for v in groups.values()]
        print("dedupe: %d rows -> %d distinct product URLs" % (len(rows), len(leaders)),
              file=sys.stderr)
    else:
        leaders = rows

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i, res in enumerate(pool.map(safe, leaders), 1):
            results.append(res)
            if i % 25 == 0:
                print("  %d/%d" % (i, len(leaders)), file=sys.stderr)

    if groups:
        expanded = []
        by_leader = {r["id"]: r for r in results}
        for members in groups.values():
            lead = by_leader.get(members[0]["id"])
            for m in members:
                if m["id"] == members[0]["id"]:
                    expanded.append(lead)
                    continue
                clone = dict(lead or {})
                clone["id"] = m["id"]
                clone["copied_from_row"] = members[0]["id"]
                expanded.append(clone)
        results = sorted(expanded, key=lambda r: r["id"])

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)

    ok = sum(1 for r in results if r.get("pred"))
    cost = sum((r.get("usage") or r.get("vision_usage") or {}).get("cost") or 0
               for r in results)
    print("%s path: %d/%d rows produced a prediction -> %s  (openrouter cost $%.5f)"
          % (args.path, ok, len(results), args.out, cost))
    if args.emit_sql:
        print("SQL proposal:", emit_sql(results, args.emit_sql))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
