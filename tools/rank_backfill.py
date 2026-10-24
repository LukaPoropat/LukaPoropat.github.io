#!/usr/bin/env python3
"""
Rebuild the observer ranking as it was some days ago, for the up/down arrows on the
Observations page, before observer_rank.py has collected a month of weekly snapshots.

Jost Jahn's people table gives everyone's current number of MPECs as observer. Taking away the
MPECs that named them as observer since then gives the counts as they were on that day. The
recent MPECs are read from the Minor Planet Center (the list comes from Jost Jahn's
MPECS-LIST.tsv; Daily Orbit Updates carry no observer names and are skipped).

Writes one snapshot, marked "reconstructed", into data/rank_history.json.

Usage:
    python tools/rank_backfill.py --days 30
"""
import argparse
import collections
import concurrent.futures as cf
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_observations as bo  # noqa: E402 - MPEC download + cache
import observer_rank as orank  # noqa: E402 - Jost Jahn's people table, names, snapshots

MPEC_LIST = "https://mpec.jostjahn.de/MPECS-LIST.tsv"


def recent_mpecs(cache, days):
    path = os.path.join(cache, "jahn_mpecs_list.tsv")
    if not os.path.exists(path) or time.time() - os.path.getmtime(path) > 86400:
        with open(path, "w", encoding="utf-8") as f:
            f.write(bo.fetch(MPEC_LIST, timeout=300))
    rows = list(csv.DictReader(io.StringIO(open(path, encoding="utf-8").read().lstrip("﻿")), delimiter="\t"))
    latest = max(r["Issued"] for r in rows)[:10]
    since = (dt.date.fromisoformat(latest) - dt.timedelta(days=days)).isoformat()
    keep = [r for r in rows if r["Issued"][:10] > since and r["Category"] != "Daily"
            and bo.MPEC_ID.match(r["MPEC"]) and bo.MPC_MPEC.match(r["URL"])]
    return since, keep


def observers_in(text):
    """Every name listed as observer, at any station, in an MPEC's observer details."""
    i = text.find("Observer details:")
    if i < 0:
        return set()
    end = len(text)
    for stop in ("Orbital elements", "Residuals", "Ephemeris:", "Observations:", "MPEC number"):
        j = text.find(stop, i + 10)
        if 0 < j < end:
            end = j
    names = set()
    for entry in re.split(r"\n(?=[0-9A-Z]\w\w )", text[i:end])[1:]:
        entry = re.sub(r"\s*\n\s*", " ", entry.strip())
        m = re.search(r"\bObservers?\b\s+(.*)", entry)
        if not m:
            continue
        seg = m.group(1)
        stop = len(seg)
        for pat in (r"\bMeasurers?\b", r"\d+(\.\d+)?-m\b", r"\bCCD\b", r"\bCMO\b"):
            mm = re.search(pat, seg)
            if mm:
                stop = min(stop, mm.start())
        for name in re.split(r",\s*|\s+and\s+", seg[:stop]):
            name = name.strip().rstrip(".").strip()
            if name and re.search(r"[A-Za-z]{2}", name):
                names.add(orank.key(name))
    return names


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--cache", default=os.path.join(os.path.dirname(__file__), ".cache"))
    ap.add_argument("--history", default=os.path.join(os.path.dirname(__file__), "..", "data", "rank_history.json"))
    args = ap.parse_args()
    rank_cache = os.path.join(args.cache, "rank")
    os.makedirs(rank_cache, exist_ok=True)

    people = orank.jahn_people(rank_cache)
    since, mpecs = recent_mpecs(args.cache, args.days)
    print(f"{len(mpecs)} MPECs with observer details issued after {since}")

    recent = collections.Counter()
    with cf.ThreadPoolExecutor(args.workers) as pool:
        futures = [pool.submit(bo.mpec_text, r["MPEC"], r["URL"], args.cache) for r in mpecs]
        for k, fut in enumerate(cf.as_completed(futures), start=1):
            try:
                recent.update(observers_in(fut.result()))
            except Exception as exc:  # noqa: BLE001
                sys.exit(f"an MPEC could not be read ({exc}); nothing written")
            if k % 100 == 0:
                print(f"  {k}/{len(mpecs)}")

    # the busiest spelling of a name takes the recent MPECs (variants are rare, and small)
    owner = {}
    for p in sorted(people, key=lambda p: -p["obs"]):
        owner.setdefault(orank.key(p["name"]), p["name"])
    then = {p["name"]: p["obs"] - (recent[orank.key(p["name"])] if owner[orank.key(p["name"])] == p["name"] else 0)
            for p in people}
    history = json.load(open(args.history, encoding="utf-8")) if os.path.exists(args.history) else {}
    history[since] = {"reconstructed": True, "counts": orank.snapshot_counts(then)}
    with open(args.history, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(history.items())), f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote the {since} snapshot to {os.path.abspath(args.history)}")


if __name__ == "__main__":
    main()
