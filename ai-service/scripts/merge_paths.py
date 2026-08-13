#!/usr/bin/env python3
"""Merge several enrich_no_feed.py prediction files into one, field by field.

    python merge_paths.py --out merged.json preds_a.json preds_b.json ...

Priority is left to right: the first file that has a non-empty value for a field
wins, and the winning file's basename is recorded in `src` so a proposal can be
filtered by provenance later. This is how the production cascade is expressed:
page (merchant fact) -> name (deterministic, only speaks when the name is
explicit) -> vision (always speaks, never certain).
"""
import argparse
import json
import os

FIELDS = ("color", "shade", "material", "material_full", "gender",
          "clothing_type", "is_kids")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("files", nargs="+")
    args = ap.parse_args()

    loaded = [(os.path.basename(f).replace(".json", ""),
               {p["id"]: (p.get("pred") or {}) for p in
                json.load(open(f, encoding="utf-8"))}) for f in args.files]

    ids = []
    seen = set()
    for _, d in loaded:
        for i in d:
            if i not in seen:
                seen.add(i)
                ids.append(i)

    out = []
    for i in sorted(ids):
        merged, src = {}, {}
        for label, d in loaded:
            pred = d.get(i) or {}
            for f in FIELDS:
                if f in merged:
                    continue
                v = pred.get(f)
                if v not in (None, ""):
                    merged[f], src[f] = v, label
        rec = {"id": i, "path": "merged", "src": src}
        if merged:
            rec["pred"] = merged
        out.append(rec)
    json.dump(out, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("merged %d files -> %d rows -> %s" % (len(loaded), len(out), args.out))


if __name__ == "__main__":
    raise SystemExit(main())
