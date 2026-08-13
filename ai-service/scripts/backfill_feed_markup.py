#!/usr/bin/env python3
"""Backfill colour / shade / material / gender / is_kids on rows already in
``wardrobe_items`` from the partner YML feed they came from.

WHY
---
``import_catalog.py`` used to write ``material = ""`` as a hardcoded literal,
guess ``color`` from a substring of the product name and never read ``<param>``.
Prod state measured 2026-08-13 (22418 rows): colour filled on 470 (2%), material
on 236 (1%), gender on 12784 (57%) and wrong on a large share of those.
Fixing the importer only helps items imported from now on — this script repairs
the rows that are already there.

JOIN KEY
--------
``notes = 'SOURCE:SKU'`` <-> ``feed_params.offer_sku(offer)`` (``<model>`` else
offer id), which is exactly what the importer wrote. ``feed_params.build_offer_index``
drops SKUs that match more than one offer; on the 2moodstore and ElytS feeds
``<model>`` holds a size / a colour, so without that guard this script would
smear one offer's markup across hundreds of unrelated garments.

WRITE RULES (idempotent, never destructive)
-------------------------------------------
* ``color`` / ``shade`` / ``material`` — written only when the column is NULL or
  empty. An existing value is left alone even when the feed disagrees: we cannot
  tell a human-curated value from an importer guess, and a wrong overwrite is
  worse than a stale one.
* ``gender`` — filled when NULL/empty. In addition an existing ``'unisex'`` is
  upgraded to male/female when the feed's category tree is definite, because
  ``'unisex'`` is what the old paths emitted when they had no signal: on the
  45-item ground-truth sample 8 of the 8 pre-existing ``'unisex'`` values
  contradicted the merchant page, and 0 of the pre-existing male/female values
  did (test/gauntlet/ours/feed-backfill/gender_unisex_audit.json). ``male`` and
  ``female`` already in the DB are never touched.
* ``is_kids`` — set to true when the feed's category root is the merchant's kids
  section. The current values come from keyword matching over item_name
  (backend/migrations/010_remove_kids_items.sql), so the feed is the better
  source; clearing a true back to false is still opt-in (``--clear-kids-false-positives``)
  because a hidden kids item is cheap and un-hiding one is not.

Running it twice proposes nothing the second time; ``--self-check`` asserts that
by replanning against the post-change state in memory.

USAGE (dry run is the default; writing needs an explicit --apply)
  python3 backfill_feed_markup.py \
      --feed "ЦУМ=/tmp/cum.xml" --feed "SELA=/tmp/sela.xml" \
      --snapshot /path/db_feed_sources.csv \
      --out-dir /path/artifacts

  # read the current state straight from the DB instead of a CSV snapshot
  python3 backfill_feed_markup.py --feed "ЦУМ=/tmp/cum.xml" --from-db --out-dir ...
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from typing import Iterable, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from feed_params import build_markup_index  # noqa: E402

FIELDS = ("color", "shade", "material", "gender", "is_kids")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://modemorph:modemorph@localhost:5433/modemorph",
)

SNAPSHOT_SQL = (
    "SELECT id, notes, item_name, url, clothing_type, color, shade, material, "
    "style, gender, is_kids, is_hidden FROM wardrobe_items "
    "WHERE notes IS NOT NULL AND length(btrim(notes)) > 0 ORDER BY id"
)


# ---------------------------------------------------------------------------
# Reading the current state
# ---------------------------------------------------------------------------

_TRUE = {"t", "true", "1", "yes", "y"}


def _blank(value) -> bool:
    return value is None or str(value).strip() == ""


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in _TRUE


def load_snapshot_csv(path: str) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as fh:
        return [dict(row) for row in csv.DictReader(fh)]


async def load_snapshot_db(dsn: str) -> list[dict]:
    import asyncpg  # imported lazily: the CSV path needs no driver

    conn = await asyncpg.connect(dsn.replace("postgresql+asyncpg://", "postgresql://"))
    try:
        rows = await conn.fetch(SNAPSHOT_SQL)
    finally:
        await conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Feeds
# ---------------------------------------------------------------------------


class FeedMarkup:
    """All the markup one feed can prove, keyed by the SKU stored in notes."""

    def __init__(self, source: str, path: str):
        self.source = source
        self.path = path
        shop = ET.parse(path).getroot().find("shop")
        if shop is None:
            raise ValueError(f"{path}: no <shop> element")
        self.offers_total = len(shop.findall(".//offer"))
        self.markup, self.merged, self.ambiguous = build_markup_index(shop)

    def stats(self) -> dict:
        top = sorted(self.ambiguous.items(), key=lambda kv: -kv[1])[:5]
        return {
            "source": self.source,
            "feed_file": os.path.abspath(self.path),
            "offers": self.offers_total,
            "usable_skus": len(self.markup),
            "collisions_merged_identical_markup": len(self.merged),
            "ambiguous_skus_rejected": len(self.ambiguous),
            "offers_behind_ambiguous_skus": sum(self.ambiguous.values()),
            "worst_ambiguous_examples": [{"sku": k, "offers": v} for k, v in top],
            "with_color": sum(1 for m in self.markup.values() if m["color"]),
            "with_shade": sum(1 for m in self.markup.values() if m["shade"]),
            "with_material": sum(1 for m in self.markup.values() if m["material"]),
            "with_gender": sum(1 for m in self.markup.values() if m["gender"]),
            "kids": sum(1 for m in self.markup.values() if m["is_kids"]),
        }


def load_feeds(specs: Iterable[str]) -> dict[str, FeedMarkup]:
    feeds: dict[str, FeedMarkup] = {}
    for spec in specs:
        if "=" not in spec:
            raise SystemExit(f"--feed expects SOURCE=PATH, got {spec!r}")
        source, path = spec.split("=", 1)
        feeds[source.strip()] = FeedMarkup(source.strip(), path.strip())
    return feeds


# ---------------------------------------------------------------------------
# Planning
# ---------------------------------------------------------------------------


def plan_row(row: dict, markup: dict, clear_kids_fp: bool) -> dict[str, dict]:
    """-> {field: {"from":…, "to":…, "why":…}} for one wardrobe_items row."""
    changes: dict[str, dict] = {}

    for field in ("color", "shade", "material"):
        proposed = markup.get(field) or ""
        if proposed and _blank(row.get(field)):
            changes[field] = {
                "from": row.get(field),
                "to": proposed,
                "why": f"empty in db; feed {markup.get(field + '_source', 'param')}",
            }

    gender = markup.get("gender")
    if gender:
        current = (row.get("gender") or "").strip().lower()
        if not current:
            changes["gender"] = {"from": row.get("gender"), "to": gender, "why": "empty in db"}
        elif current == "unisex" and gender in ("male", "female"):
            changes["gender"] = {
                "from": row.get("gender"),
                "to": gender,
                "why": f"db 'unisex' is the no-signal default; feed {markup['gender_source']}",
            }

    current_kids = _as_bool(row.get("is_kids"))
    if markup.get("is_kids") and not current_kids:
        changes["is_kids"] = {"from": current_kids, "to": True, "why": "feed category root is kids"}
    elif clear_kids_fp and current_kids and not markup.get("is_kids"):
        changes["is_kids"] = {
            "from": current_kids,
            "to": False,
            "why": "keyword guess; feed category root is not kids",
        }

    return changes


def plan(rows: list[dict], feeds: dict[str, FeedMarkup], clear_kids_fp: bool) -> tuple[list[dict], dict]:
    proposals: list[dict] = []
    counters = Counter()
    per_source = defaultdict(Counter)
    ambiguous_hits = defaultdict(Counter)

    for row in rows:
        notes = (row.get("notes") or "").strip()
        if ":" not in notes:
            counters["rows_without_source_prefix"] += 1
            continue
        source, sku = notes.split(":", 1)
        feed = feeds.get(source)
        if feed is None:
            counters["rows_source_not_loaded"] += 1
            per_source[source]["no_feed_loaded"] += 1
            continue

        per_source[source]["rows"] += 1
        if sku in feed.ambiguous:
            counters["rows_blocked_ambiguous_sku"] += 1
            per_source[source]["blocked_ambiguous_sku"] += 1
            ambiguous_hits[source][sku] += 1
            continue

        markup = feed.markup.get(sku)
        if markup is None:
            counters["rows_sku_not_in_feed"] += 1
            per_source[source]["sku_not_in_feed"] += 1
            continue

        per_source[source]["matched"] += 1
        changes = plan_row(row, markup, clear_kids_fp)
        if not changes:
            counters["rows_matched_nothing_to_do"] += 1
            per_source[source]["nothing_to_do"] += 1
            continue

        counters["rows_with_changes"] += 1
        per_source[source]["with_changes"] += 1
        for field in changes:
            counters[f"field_{field}"] += 1
            per_source[source][f"field_{field}"] += 1

        proposals.append(
            {
                "id": int(row["id"]),
                "notes": notes,
                "source": source,
                "sku": sku,
                "item_name": row.get("item_name"),
                "changes": changes,
                "feed_sources": {
                    "color": markup.get("color_source"),
                    "material": markup.get("material_source"),
                    "gender": markup.get("gender_source"),
                },
                "category_chain": markup.get("category_chain"),
            }
        )

    stats = {
        "rows_considered": len(rows),
        "counters": dict(counters),
        "per_source": {s: dict(c) for s, c in sorted(per_source.items())},
        "ambiguous_sku_damage_avoided": {
            s: {"db_rows": sum(c.values()), "distinct_skus": len(c)}
            for s, c in sorted(ambiguous_hits.items())
        },
    }
    return proposals, stats


def apply_in_memory(rows: list[dict], proposals: list[dict]) -> list[dict]:
    """Return a copy of ``rows`` with the proposals applied — for the idempotency check."""
    by_id = {int(r["id"]): dict(r) for r in rows}
    for proposal in proposals:
        row = by_id[proposal["id"]]
        for field, change in proposal["changes"].items():
            row[field] = change["to"]
    return list(by_id.values())


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def sql_literal(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return "'" + str(value).replace("'", "''") + "'"


def write_artifacts(out_dir: str, proposals: list[dict], stats: dict, feeds: dict[str, FeedMarkup]) -> None:
    os.makedirs(out_dir, exist_ok=True)

    with open(os.path.join(out_dir, "proposal.json"), "w", encoding="utf-8") as fh:
        json.dump(
            {
                "generated_by": "ai-service/scripts/backfill_feed_markup.py --dry-run",
                "feeds": [f.stats() for f in feeds.values()],
                "stats": stats,
                "proposals": proposals,
            },
            fh,
            ensure_ascii=False,
            indent=1,
        )

    with open(os.path.join(out_dir, "proposal.sql"), "w", encoding="utf-8") as fh:
        fh.write("-- DRY RUN OUTPUT. Nothing here has been executed.\n")
        fh.write(f"-- {len(proposals)} UPDATE statements, one per wardrobe_items row.\n")
        fh.write("-- Guarded by the pre-image so a re-run cannot double-write.\n\n")
        for proposal in proposals:
            sets = ", ".join(f"{f} = {sql_literal(c['to'])}" for f, c in proposal["changes"].items())
            # A blank pre-image must match both NULL and '': the CSV snapshot cannot
            # tell them apart, and `x IS NOT DISTINCT FROM ''` would silently skip
            # every NULL row.
            guards = " AND ".join(
                f"({f} IS NULL OR {f}::text = '')"
                if c["from"] is None or str(c["from"]).strip() == ""
                else f"{f} IS NOT DISTINCT FROM {sql_literal(c['from'])}"
                for f, c in proposal["changes"].items()
            )
            fh.write(f"UPDATE wardrobe_items SET {sets} WHERE id = {proposal['id']} AND {guards};\n")

    with open(os.path.join(out_dir, "proposal.tsv"), "w", encoding="utf-8") as fh:
        fh.write("id\tsource\tsku\tfield\tfrom\tto\twhy\titem_name\n")
        for proposal in proposals:
            for field, change in proposal["changes"].items():
                fh.write(
                    f"{proposal['id']}\t{proposal['source']}\t{proposal['sku']}\t{field}\t"
                    f"{change['from']!r}\t{change['to']}\t{change['why']}\t"
                    f"{(proposal.get('item_name') or '')[:60]}\n"
                )


# ---------------------------------------------------------------------------
# Applying (never the default)
# ---------------------------------------------------------------------------


async def apply_to_db(dsn: str, proposals: list[dict]) -> dict:
    import asyncpg

    conn = await asyncpg.connect(dsn.replace("postgresql+asyncpg://", "postgresql://"))
    updated = skipped = 0
    try:
        for proposal in proposals:
            sets, guards, args = [], [], []
            for field, change in proposal["changes"].items():
                args.append(change["to"])
                sets.append(f"{field} = ${len(args)}")
                if change["from"] is None or str(change["from"]).strip() == "":
                    guards.append(f"({field} IS NULL OR {field}::text = '')")
                else:
                    args.append(change["from"])
                    guards.append(f"{field} IS NOT DISTINCT FROM ${len(args)}")
            args.append(proposal["id"])
            sql = (
                f"UPDATE wardrobe_items SET {', '.join(sets)}, updated_at = now() "
                f"WHERE id = ${len(args)} AND {' AND '.join(guards)}"
            )
            result = await conn.execute(sql, *args)
            if result.endswith(" 0"):
                skipped += 1
            else:
                updated += 1
    finally:
        await conn.close()
    return {"updated": updated, "skipped_precondition_changed": skipped}


# ---------------------------------------------------------------------------


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--feed", action="append", required=True, metavar="SOURCE=PATH")
    ap.add_argument("--snapshot", help="CSV of the current wardrobe_items state (see SNAPSHOT_SQL)")
    ap.add_argument("--from-db", action="store_true", help="read the current state from DATABASE_URL instead")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--clear-kids-false-positives", action="store_true")
    ap.add_argument("--self-check", action="store_true", help="assert a second pass proposes nothing")
    ap.add_argument("--apply", action="store_true", help="actually UPDATE; without it nothing is written to the DB")
    args = ap.parse_args()

    if not args.snapshot and not args.from_db:
        ap.error("give --snapshot CSV or --from-db")

    feeds = load_feeds(args.feed)
    for feed in feeds.values():
        stats = feed.stats()
        print(
            f"[feed] {stats['source']}: {stats['offers']} offers -> "
            f"{stats['usable_skus']} usable SKUs "
            f"({stats['collisions_merged_identical_markup']} collisions merged), "
            f"{stats['ambiguous_skus_rejected']} conflicting keys rejected "
            f"({stats['offers_behind_ambiguous_skus']} offers)"
        )

    rows = load_snapshot_csv(args.snapshot) if args.snapshot else await load_snapshot_db(DATABASE_URL)
    print(f"[db] {len(rows)} rows with a notes prefix")

    proposals, stats = plan(rows, feeds, args.clear_kids_false_positives)
    write_artifacts(args.out_dir, proposals, stats, feeds)

    print(json.dumps(stats, ensure_ascii=False, indent=1))
    print(f"[dry-run] {len(proposals)} rows would change -> {os.path.abspath(args.out_dir)}")

    if args.self_check:
        second, _ = plan(apply_in_memory(rows, proposals), feeds, args.clear_kids_false_positives)
        print(f"[self-check] second pass proposes {len(second)} changes (expected 0)")
        if second:
            raise SystemExit("NOT IDEMPOTENT: second pass still proposes changes")

    if args.apply:
        result = await apply_to_db(DATABASE_URL, proposals)
        print(f"[apply] {result}")


if __name__ == "__main__":
    asyncio.run(main())
