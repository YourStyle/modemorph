#!/usr/bin/env python3
"""Turn no-feed predictions into a reviewable DRY-RUN proposal. Writes no DB.

Input
    --population  rows exported from prod (id + every column we might touch)
    --page        output of `enrich_no_feed.py --path page`
    --vision      output of `enrich_no_feed.py --path vision`   (optional)

Merge rule (measured on test/gauntlet/truth/truth_no_feed.json, 28 labelled items):
    gender, is_kids   page only            page 28/28 vs vision 26/26 but the page
                                           value is structural (breadcrumb), the
                                           model's is a guess from a photo
    colour            page, else vision    page 28/28, vision 24/26
    material          page, else vision    page 28/28, vision 5/9 and it only
                                           answers at all on 9/28 -> vision material
                                           is proposed ONLY when the page is gone,
                                           and it is flagged low_confidence
    clothing_type     page, else vision    page 28/28, vision 13/26

Three tiers, because they carry different risk:
    A   fill    — column is NULL or ''            (nothing can be lost)
    BG  replace gender='unisex' that the merchant page contradicts. Emitted
                LIVE by default; --no-tier-b-gender comments it out.
    BV  replace some other unusable value (hex '#808080' colour, English
                'Satin' material). Still gated behind --allow-tier-b.
Every B row keeps its old value in the review file and the SQL guard pins the
exact old value, so a row edited since the export is skipped rather than
clobbered.

Why BG is live and BV is not
----------------------------
Round-1 review named the commented-out gender tier as the single largest
remaining gap and asked for the "maybe 'unisex' was deliberate" worry to be
settled with facts.  It was settled, and every number has an artifact under
test/gauntlet/ours/no-feed-items/r2/artifacts/:

  * no_human_edit.json — all 973 target rows were inserted in ONE minute
    (2026-04-13 12:13Z) and none has an updated_at outside that insert and the
    2026-08-13 gate31 dedupe.  The only human writer of this column in the repo
    is backend/app/api/wardrobe.py::update_wardrobe_item, which always sets
    `updated_at = NOW()`, and there is no trigger on the table.  Nobody ever
    opened these rows.
  * unisex_conflict.json — where the merchant states a sex, the db's own
    male/female is contradicted 0 times out of 1602, while 'unisex' is
    contradicted 973 times out of 1015.  'unisex' is the only broken value.
  * leak_measurement.json — run through the real production filter
    (backend/app/services/catalog_filters.py::gender_ok), 'unisex' is shown to
    BOTH sexes: 974 garments (446 of them visible) are eligible for the wrong
    audience today, 0 after this tier.  Leaving 'unisex' in place is not the
    conservative option, it is the leaking one.

BV stays gated because its two cases are cosmetic (a hex code renders as grey,
an English fibre name is unreadable) and nothing downstream mis-serves a user
because of them.

Outputs (all under --outdir):
    proposal.sql            BEGIN ... ROLLBACK, one guarded UPDATE per row
    proposal_rows.jsonl     one line per proposed change, with source + provenance
    proposal_summary.json   counts per tier / field / source / path
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nofeed_normalize import PROD_SLUGS, normalize_color, normalize_material  # noqa: E402

FIELDS = ("color", "shade", "material", "gender", "clothing_type")

# Per-field source order, decided by measurement, not by taste. Numbers are
# precision against the merchant page, artifacts/score_vs_page_*.json:
#
#   field          page   name             vision          db today
#   color          ref    0.40  (dropped)  0.83            0.00  (all hex)
#   material       ref    0.77 @18% ans.   0.61 @34% ans.  0.41
#   gender         ref    1.00 @50% ans.   0.97            0.63
#   clothing_type  ref    0.69             0.62            0.85  <- db wins
#
# so: name is trusted for gender/material/type, never for colour; vision is the
# last resort everywhere; clothing_type is only ever used to fill a hole,
# because the value already in the column is measurably better than both
# fallbacks (see ALLOW_REPLACE).
SOURCE_ORDER = {
    "color": ("page", "vision"),
    "shade": ("page",),
    "material": ("page", "name", "vision"),
    "gender": ("page", "name", "vision"),
    "clothing_type": ("page", "name", "vision"),
}
# which paths are trusted enough to overwrite a value that is already there
ALLOW_REPLACE = {
    "color": ("page", "vision"),      # anything beats a hex code
    "shade": ("page",),
    "material": ("page",),
    "gender": ("page", "name"),       # 1.00 and 1.00; vision's 0.97 is not enough
    "clothing_type": (),              # never: db 0.85 > name 0.69 > vision 0.62
}
LOW_CONFIDENCE = {("material", "vision"), ("color", "vision")}

# Normalisation is canonical (clothing_taxonomy.CANONICAL_TYPES); the column is
# not. `longsleeve` has 346 rows in prod spelled `lonsleeve` and 0 spelled
# correctly, so writing the canonical slug would open a second spelling of one
# category — exactly the "new junk value" this proposal is supposed to avoid.
# Write what the column already holds; renaming the 346 rows is a migration.
DB_SPELLING = {"longsleeve": "lonsleeve"}


def is_unusable(field: str, value: str | None) -> str | None:
    """Return why the current value cannot stay, or None if it is fine."""
    if value is None or value == "":
        return None
    v = str(value).strip()
    if field == "color":
        if v.startswith("#"):
            return "hex code, not a colour name"
        if normalize_color(v) is None:
            return "not in the colour vocabulary"
        return None
    if field == "material":
        if normalize_material(v) is None:
            return "not a fibre we recognise (e.g. English marketing word)"
        return None
    if field == "clothing_type":
        return None if v in PROD_SLUGS else "not in the prod clothing_type enum"
    return None


def merge(preds: dict[str, dict]) -> tuple[dict, dict]:
    """preds = {'page': rec, 'name': rec, 'vision': rec} -> (value, path)."""
    out, src = {}, {}
    for f in FIELDS:
        for path in SOURCE_ORDER[f]:
            v = ((preds.get(path) or {}).get("pred") or {}).get(f)
            if v not in (None, ""):
                out[f], src[f] = v, path
                break
    return out, src


def sql_str(s) -> str:
    return "'%s'" % str(s).replace("'", "''")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--population", required=True)
    ap.add_argument("--page", required=True)
    ap.add_argument("--name", default=None)
    ap.add_argument("--vision", default=None, action="append",
                    help="may be given more than once (live sample + dead rows)")
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--allow-tier-b", action="store_true",
                    help="also emit tier BV (hex colour / unknown fibre replacement)")
    ap.add_argument("--no-tier-b-gender", action="store_true",
                    help="comment out tier BG instead of emitting it live")
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    pop = json.load(open(args.population, encoding="utf-8"))
    page = {p["id"]: p for p in json.load(open(args.page, encoding="utf-8"))}
    name = {}
    if args.name and os.path.exists(args.name):
        name = {p["id"]: p for p in json.load(open(args.name, encoding="utf-8"))}
        for rec in name.values():          # measured 0.40 precision -> never used
            if rec.get("pred"):
                rec["pred"]["color"] = None
    vision = {}
    for vf in (args.vision or []):
        if os.path.exists(vf):
            vision.update({p["id"]: p for p in json.load(open(vf, encoding="utf-8"))})

    counts = defaultdict(int)
    per_source = defaultdict(lambda: defaultdict(int))
    rows_out, sql_a, sql_bg, sql_b = [], [], [], []

    for row in pop:
        rid = row["id"]
        source = (row.get("notes") or "(null-notes)").split(":")[0] or "(null-notes)"
        merged, src = merge({"page": page.get(rid), "name": name.get(rid),
                             "vision": vision.get(rid)})
        if not merged:
            counts["rows_no_prediction"] += 1
            per_source[source]["rows_no_prediction"] += 1
            continue
        counts["rows_with_prediction"] += 1
        per_source[source]["rows_with_prediction"] += 1

        sets = {"A": [], "BG": [], "BV": []}
        changes = []
        for f in FIELDS:
            new = merged.get(f)
            if new in (None, ""):
                continue
            new = DB_SPELLING.get(new, new)
            cur = row.get(f)
            if str(cur or "") == str(new):
                continue
            if cur in (None, ""):
                tier, reason = "A", None
            else:
                reason = is_unusable(f, cur)
                tier = "BV"
                if not reason and f == "gender" and cur == "unisex" and new != "unisex":
                    reason = ("'unisex' is the no-signal default (r2/artifacts/"
                              "no_human_edit.json: never hand-edited); the %s path "
                              "reads a real gender off the merchant card" % src[f])
                    tier = "BG"
                if not reason and f == "material" and src[f] == "page" \
                        and normalize_material(cur) != new:
                    reason = "current fibre disagrees with the merchant page"
                if not reason:
                    counts["skipped_value_already_set"] += 1
                    continue
                if src[f] not in ALLOW_REPLACE[f]:
                    counts["skipped_replace_%s_from_%s_not_trusted" % (f, src[f])] += 1
                    continue
            entry = {"field": f, "old": cur, "new": new, "tier": tier,
                     "path": src[f], "reason": reason}
            if (f, src[f]) in LOW_CONFIDENCE:
                entry["low_confidence"] = True
            changes.append(entry)
            counts["tier_%s_%s" % (tier, f)] += 1
            per_source[source]["tier_%s_%s" % (tier, f)] += 1
            frag = "%s = %s" % (f, sql_str(new))
            sets[tier].append((frag, f, cur))

        if not changes:
            continue
        rows_out.append({"id": rid, "source": source,
                         "item_name": row.get("item_name"),
                         "is_hidden": row.get("is_hidden"),
                         "merchant_url": (page.get(rid) or {}).get("merchant_url"),
                         "changes": changes})
        if sets["A"]:
            guard = " AND ".join("(%s IS NULL OR %s = '')" % (f, f)
                                 for _, f, _ in sets["A"])
            sql_a.append("UPDATE wardrobe_items SET %s WHERE id = %d AND (%s);"
                         % (", ".join(f for f, _, _ in sets["A"]), rid, guard))
        for tier, bucket in (("BG", sql_bg), ("BV", sql_b)):
            if not sets[tier]:
                continue
            guard = " AND ".join(
                "%s = %s" % (f, sql_str(cur)) for _, f, cur in sets[tier])
            bucket.append("UPDATE wardrobe_items SET %s WHERE id = %d AND %s;"
                          % (", ".join(f for f, _, _ in sets[tier]), rid, guard))

    # Tier D: rows whose merchant page no longer resolves at all. Enriching them
    # is beside the point — the user taps through to a 404. Hiding is a product
    # decision, so this ships as counts + commented SQL, never live.
    dead_visible, dead_by_reason = [], defaultdict(int)
    for row in pop:
        rec = page.get(row["id"]) or {}
        if rec.get("pred"):
            continue
        reason = rec.get("error") or "no page record"
        status = rec.get("http_status") or "?"
        dead_by_reason["%s / %s" % (status, reason[:48])] += 1
        if not row.get("is_hidden"):
            dead_visible.append(row["id"])

    sql_path = os.path.join(args.outdir, "proposal.sql")
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write("-- DRY RUN. Generated by ai-service/scripts/propose_no_feed_updates.py\n"
                "-- NOT executed. Nothing in this file was run against prod.\n"
                "-- Tier A  fills empty columns.\n"
                "-- Tier BG replaces gender='unisex' that the merchant card denies.\n"
                "-- Tier BV replaces other unusable values (hex colour / unknown fibre).\n"
                "-- Every statement pins its guard, so a row changed since export is skipped.\n"
                "BEGIN;\n\n-- ============ TIER A: fill empty columns (%d rows) ============\n"
                % len(sql_a))
        f.write("\n".join(sql_a))
        f.write("\n\n-- ============ TIER BG: gender='unisex' the merchant contradicts "
                "(%d rows) ============\n"
                "-- Evidence, all reproducible from files:\n"
                "--   * every one of these rows was inserted in the same minute\n"
                "--     (2026-04-13 12:13Z) and has never been through the admin edit\n"
                "--     form, which is the only human writer of this column and always\n"
                "--     stamps updated_at = NOW()  -> r2/artifacts/no_human_edit.json\n"
                "--   * the db's own male/female is contradicted by the merchant 0 times\n"
                "--     out of 1602; 'unisex' is contradicted 973 out of 1015\n"
                "--     -> r2/artifacts/unisex_conflict.json\n"
                "--   * catalog_filters.gender_ok() shows 'unisex' to BOTH sexes, so\n"
                "--     these rows are eligible for the wrong audience today and are not\n"
                "--     after this tier  -> r2/artifacts/leak_measurement.json\n"
                "--   * the gender path itself scores 1.000 on both rulers\n"
                "--     -> r2/artifacts/score_truth_no_feed.json\n"
                % len(sql_bg))
        if args.no_tier_b_gender:
            f.write("-- commented out by --no-tier-b-gender\n")
            f.write("\n".join("-- " + s for s in sql_bg))
        else:
            f.write("\n".join(sql_bg))
        f.write("\n\n-- ============ TIER BV: replace other unusable values (%d rows) "
                "============\n" % len(sql_b))
        if not args.allow_tier_b:
            f.write("-- commented out: re-run with --allow-tier-b to emit these live\n")
            f.write("\n".join("-- " + s for s in sql_b))
        else:
            f.write("\n".join(sql_b))
        f.write("\n\n-- ============ TIER D: %d visible rows whose merchant page is "
                "gone ============\n"
                "-- Never emitted live: hiding catalogue rows is a product call, not a\n"
                "-- markup call. Ids are in proposal_dead_rows.txt.\n"
                "-- UPDATE wardrobe_items SET is_hidden = true WHERE id IN (...);\n"
                % len(dead_visible))
        f.write("\nROLLBACK;  -- flip to COMMIT only after review\n")
    with open(os.path.join(args.outdir, "proposal_dead_rows.txt"), "w") as f:
        f.write("\n".join(str(i) for i in dead_visible))

    with open(os.path.join(args.outdir, "proposal_rows.jsonl"), "w",
              encoding="utf-8") as f:
        for r in rows_out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    summary = {"population_rows": len(pop),
               "rows_touched": len(rows_out),
               "tier_a_statements": len(sql_a),
               "tier_bg_statements": len(sql_bg),
               "tier_bg_emitted_live": not args.no_tier_b_gender,
               "tier_bv_statements": len(sql_b),
               "tier_bv_emitted_live": bool(args.allow_tier_b),
               "counts": dict(counts),
               "tier_d_dead_page_rows_visible": len(dead_visible),
               "tier_d_reasons": dict(dead_by_reason),
               "per_source": {k: dict(v) for k, v in per_source.items()},
               "inputs": {"population": os.path.basename(args.population),
                          "page": os.path.basename(args.page),
                          "name": os.path.basename(args.name or ""),
                          "vision": [os.path.basename(v) for v in (args.vision or [])]},
               "policy": {"source_order": {k: list(v) for k, v in SOURCE_ORDER.items()},
                          "allow_replace": {k: list(v) for k, v in ALLOW_REPLACE.items()}},
               "executed_against_prod": False}
    json.dump(summary, open(os.path.join(args.outdir, "proposal_summary.json"), "w",
                            encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
