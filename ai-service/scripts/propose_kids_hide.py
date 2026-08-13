#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Propose (never apply) is_kids / is_hidden updates for children's items.

    python3 ai-service/scripts/propose_kids_hide.py \
        --snapshot   raw/db_all.jsonl \
        --feed       "ЦУМ=/tmp/cum.xml" --feed "SELA=/tmp/feed_SELA.xml" \
        --page-verdicts raw/cum_page_verdicts.json \
        --out        dry-run/

Input is a read-only snapshot of ``wardrobe_items`` (one JSON object per line,
keys id/n/ne/d/u/no/ct/g/k/h — the shape produced by

    SELECT json_build_object('id',id,'n',item_name,'ne',item_name_en,
           'd',left(coalesce(description,''),400),'u',url,'no',notes,
           'ct',clothing_type,'g',gender,'k',is_kids,'h',is_hidden)
    FROM wardrobe_items;

), plus any YML feeds and, optionally, the verdicts of a merchant-page scan for
rows the feed no longer covers.

Output is three files and nothing else:
    proposal.sql     one guarded UPDATE per row, re-runnable, no DELETE anywhere
    proposal.json    row + the signal and the evidence string behind it
    SUMMARY.json     counts, per source and per signal

Kids are HIDDEN, never deleted: `is_kids = true, is_hidden = true`. Every
statement carries its pre-image in the WHERE clause, so a second run is a no-op.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys
import urllib.parse
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                "..", "..", "backend")))
from kids_detect import detect_kids, merchant_url  # noqa: E402


# --------------------------------------------------------------------- feeds
def load_feed(path):
    """-> {merchant-url-key: {'chain': [...], 'params': {...}}} for one YML feed."""
    root = ET.parse(path).getroot()
    shop = root.find("shop")
    if shop is None:
        shop = root
    names, parents = {}, {}
    for c in shop.findall(".//category"):
        cid = c.get("id")
        if not cid:
            continue
        names[cid] = (c.text or "").strip()
        if c.get("parentId"):
            parents[cid] = c.get("parentId")

    def chain(cid):
        out, seen = [], set()
        while cid and cid not in seen and cid in names:
            seen.add(cid)
            out.append(names[cid])
            cid = parents.get(cid, "")
        return out[::-1]

    index = {}
    for o in shop.findall(".//offer"):
        params = {(p.get("name") or "").strip(): (p.text or "").strip()
                  for p in o.findall("param")}
        entry = {"chain": chain((o.findtext("categoryId") or "").strip()),
                 "params": params, "id": o.get("id")}
        index[url_key(o.findtext("url") or "")] = entry
        index["id:" + str(o.get("id"))] = entry
    return index


def url_key(u: str) -> str:
    """Normalised merchant URL — the only join key that works on all four feeds.

    notes holds 'SRC:SKU', but SKU is the offer id only for ЦУМ; SELA stores a
    vendor article, 2moodstore stores the size and ElytS stores the colour, so
    they cannot be joined by notes at all.
    """
    p = urllib.parse.urlparse(merchant_url(u))
    if not p.netloc:
        return ""
    return p.netloc.lower().replace("www.", "") + p.path.rstrip("/").lower()


# ---------------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True, help="JSONL snapshot of wardrobe_items")
    ap.add_argument("--feed", action="append", default=[], metavar="SRC=PATH")
    ap.add_argument("--page-verdicts", default=None,
                    help="JSON list of {'id', 'page_is_kids', 'why'} from a merchant-page scan")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    feeds = {}
    for spec in args.feed:
        src, _, path = spec.partition("=")
        feeds[src] = load_feed(path)
        print(f"[feed] {src}: {len(feeds[src])} keys from {path}")

    pages = {}
    if args.page_verdicts:
        for v in json.load(open(args.page_verdicts)):
            if v.get("page_is_kids") is True:  # only positive verdicts propose anything
                pages[url_key(v["url"])] = v

    rows = [json.loads(l) for l in open(args.snapshot)]
    proposals = []
    sig = collections.Counter()
    per_src = collections.Counter()
    for r in rows:
        src = (r["no"] or "(null)").split(":")[0]
        sku = (r["no"] or "").partition(":")[2]
        key = url_key(r["u"])
        offer = feeds.get(src, {}).get(key) or feeds.get(src, {}).get("id:" + sku)
        verdict = detect_kids(name=r["n"], description=r["d"], url=r["u"],
                              category_chain=(offer or {}).get("chain"),
                              params=(offer or {}).get("params"))
        signal, evidence = verdict.signal, verdict.evidence
        if not verdict.is_kids and key in pages:
            # the row is gone from the feed; the merchant page still says kids
            signal = "page:breadcrumb"
            evidence = pages[key]["why"]
            verdict = type(verdict)(True, signal, evidence)
        if not verdict.is_kids:
            continue
        if r["k"] and r["h"]:
            continue  # already flagged and already hidden — nothing to write
        proposals.append({"id": r["id"], "src": src, "name": r["n"], "signal": signal,
                          "evidence": evidence[:200],
                          "was_kids": bool(r["k"]), "was_hidden": bool(r["h"])})
        sig[signal.split(":")[0]] += 1
        per_src[src] += 1

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "proposal.sql"), "w") as f:
        f.write("-- DRY RUN OUTPUT. Nothing here has been executed.\n")
        f.write(f"-- {len(proposals)} UPDATE statements, one per wardrobe_items row.\n")
        f.write("-- Kids items are HIDDEN, never deleted.\n")
        f.write("-- Guarded by the pre-image, so a second run changes 0 rows.\n\n")
        for p in proposals:
            f.write("UPDATE wardrobe_items SET is_kids = true, is_hidden = true "
                    f"WHERE id = {p['id']} "
                    f"AND (COALESCE(is_kids, false) = false OR COALESCE(is_hidden, false) = false);"
                    f"  -- {p['signal']}\n")
    json.dump(proposals, open(os.path.join(args.out, "proposal.json"), "w"),
              ensure_ascii=False, indent=1)
    summary = {
        "rows_in_snapshot": len(rows),
        "already_flagged_and_hidden": sum(1 for r in rows if r["k"] and r["h"]),
        "statements": len(proposals),
        "new_flags": sum(1 for p in proposals if not p["was_kids"]),
        "newly_hidden": sum(1 for p in proposals if not p["was_hidden"]),
        "by_source": dict(per_src),
        "by_signal": dict(sig),
        "note": "SELECT-only run: this script never opens a write connection.",
    }
    json.dump(summary, open(os.path.join(args.out, "SUMMARY.json"), "w"),
              ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
