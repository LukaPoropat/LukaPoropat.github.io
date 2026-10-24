#!/usr/bin/env python3
"""
Compute an individual observer's world rank (Jost Jahn's MPEC statistics) and the
observatory's placings (MPEC Watch).

Jost Jahn's MPEC statistics (https://mpec.jostjahn.de/) read every Minor Planet Electronic
Circular the Minor Planet Center has published and count, for each person, the circulars that
name them as observer or measurer. This script:

  1. reads that people table and ranks every individual by circulars as observer
     (survey teams, collaborations and unknown observers are left out),
  2. reads MPEC Watch (https://sbnmpc.astro.umd.edu/mpecwatch/, Q. Ye & T. Hibbitts) for the
     observatory's placings, and the tail of each sufficiently active station page (HTTP Range)
     for the stations each ranked person observes from,
  3. writes data/rank.json for the website, and keeps a snapshot of the top of the observer
     ranking in data/rank_history.json, so the page can show who moved up or down over the last
     month and the last three months (compared with the newest snapshot at least 4 / 12 weeks old).

Usage:
    python tools/observer_rank.py --name L.Poropat --station L01
"""
import argparse
import concurrent.futures as cf
import csv
import datetime as dt
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request

BASE = "https://sbnmpc.astro.umd.edu/mpecwatch/"
JAHN_PEOPLE = "https://mpec.jostjahn.de/MPECS-STAT-PEOPLE-MPECS.tsv"
UA = {"User-Agent": "luka-poropat-website-stats/1.0 (personal site; contact via site)"}
NOT_PEOPLE = re.compile(r"\b(unknown|collaboration|team|survey|project|staff|observers|students|queue|service)\b", re.I)
TOP = 200            # observers listed in the world table
SNAPSHOT_KEEP = 400  # observers kept in each snapshot (enough to rank the top 200 months ago)
PERIODS = (("month", 28), ("quarter", 84))  # compare with the newest snapshot at least this many days old


def fetch(url, byte_range=None, retries=4):
    headers = dict(UA)
    if byte_range:
        headers["Range"] = byte_range
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=180) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001 - retry on any network error
            if attempt == retries - 1:
                raise
            time.sleep(3 * (attempt + 1))
            print(f"  retry {url}: {exc}", file=sys.stderr)


def cells(row):
    return [html.unescape(re.sub(r"<.*?>", "", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]


def key(name):
    """'K. Korlević' and MPEC Watch's 'K.Korlevic' -> 'kkorlevic'."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", plain.lower())


# ---------------------------------------------------------------- Jost Jahn: people
def jahn_people(cache_dir):
    path = os.path.join(cache_dir, "jahn_people.tsv")
    if not os.path.exists(path) or time.time() - os.path.getmtime(path) > 86400:
        with open(path, "w", encoding="utf-8") as f:
            f.write(fetch(JAHN_PEOPLE))
    rows = csv.DictReader(io.StringIO(open(path, encoding="utf-8").read().lstrip("﻿")), delimiter="\t")
    out = []
    for r in rows:
        name = (r.get("Person") or "").strip()
        if name and not NOT_PEOPLE.search(name):
            out.append({"name": name, "obs": int(r.get("Observer MPECs") or 0), "mea": int(r.get("Measurer MPECs") or 0)})
    if len(out) < 1000:  # a cut-off or changed table would give a wrong rank
        raise ValueError(f"only {len(out)} people in Jost Jahn's table")
    return out


def ranks_of(counts):
    """{name: count} -> list ordered by count, and competition ranks (ties share a rank)."""
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ranks, prev, rank = {}, None, 0
    for pos, (name, n) in enumerate(ordered, start=1):
        if n != prev:
            rank, prev = pos, n
        ranks[name] = rank
    return ordered, ranks


def rank_people(people, role):
    return ranks_of({p["name"]: p[role] for p in people if p[role] > 0})


def snapshot_counts(counts):
    """The part of a ranking worth keeping for later comparisons: the top SNAPSHOT_KEEP observers."""
    return dict(ranks_of({n: c for n, c in counts.items() if c > 0})[0][:SNAPSHOT_KEEP])


# ---------------------------------------------------------------- MPEC Watch: stations
def station_table(cache_dir):
    path = os.path.join(cache_dir, "obs.html")
    if not os.path.exists(path) or time.time() - os.path.getmtime(path) > 86400:
        with open(path, "w", encoding="utf-8") as f:
            f.write(fetch(BASE + "obs.html"))
    text = open(path, encoding="utf-8").read()
    head = [re.sub(r"<.*?>", "", h).strip() for h in re.findall(r"<th[^>]*>(.*?)</th>", text, re.S)]
    ncol = head.index("Prec.") + 1
    head = head[:ncol]
    stations = []
    for row in re.findall(r"<tr>(.*?)</tr>", text, re.S):
        c = cells(row)
        if len(c) == ncol:
            d = dict(zip(head, c))
            for k in head[6:]:
                d[k] = int(d[k] or 0)
            stations.append(d)
    return stations


def people_table(text, header):
    """Rows of the table whose column header is `header` (e.g. 'Individual Observer')."""
    i = text.find(header)
    if i < 0:
        return None
    j = text.find("</table>", i)
    out = {}
    for row in re.findall(r"<tr>(.*?)</tr>", text[i:j], re.S):
        c = cells(row)
        if len(c) >= 2 and c[-1].isdigit():
            out[c[0]] = int(c[-1])
    return out


def station_people(code, cache_dir):
    if not re.match(r"^[0-9A-Z]{3}$", code):  # the codes come from MPEC Watch's table and become file names
        raise ValueError(f"not an observatory code: {code!r}")
    path = os.path.join(cache_dir, f"tail_{code}.json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < 6 * 86400:
        return json.load(open(path, encoding="utf-8"))
    url = f"{BASE}byStation/station_{code}.html"
    result = None
    for size in (400_000, 2_000_000, None):
        text = fetch(url, f"bytes=-{size}" if size else None)
        if "Individual Measurer" in text and "</html>" in text:
            obs = people_table(text, "Individual Observer")
            mea = people_table(text, "Individual Measurer")
            if obs is not None:
                result = {"observers": obs, "measurers": mea or {}}
                break
    if result is None:
        result = {"observers": {}, "measurers": {}}
    json.dump(result, open(path, "w", encoding="utf-8"))
    return result


def stations_by_person(per_station, role):
    """key(name) -> station codes, most MPECs first (from MPEC Watch's per-station tables)."""
    where = {}
    for code, tables in per_station.items():
        for name, n in tables[role].items():
            where.setdefault(key(name), []).append((n, code))
    return {k: [c for _, c in sorted(v, reverse=True)] for k, v in where.items()}


def station_ranks(stations, code):
    keys = {"MPECs": "MPECs", "F/U": "Follow-up", "1st F/U": "First follow-up",
            "NEA FU": "NEA follow-up", "PHA FU": "PHA follow-up", "Comet FU": "Comet follow-up"}
    out = []
    for key_, label in keys.items():
        active = [s for s in stations if s[key_] > 0]
        ordered = sorted(active, key=lambda s: -s[key_])
        for pos, s in enumerate(ordered, start=1):
            if s["Code"] == code:
                better = sum(1 for o in ordered if o[key_] > s[key_])
                out.append({"metric": label, "rank": better + 1, "of": len(active), "count": s[key_]})
                break
    return out


EUROPE = {
    "Albania", "Andorra", "Austria", "Belarus", "Belgium", "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus",
    "Czech Republic", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Iceland",
    "Ireland", "Italy", "Kosovo", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova", "Monaco",
    "Montenegro", "Netherlands", "North Macedonia", "Norway", "Poland", "Portugal", "Romania", "Russia", "San Marino",
    "Serbia", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Ukraine", "United Kingdom", "Vatican City",
}


def followup_year_rank(code, year, cache_dir):
    """World and European rank of a station by follow-up MPECs ("F/U") in one calendar year."""
    path = os.path.join(cache_dir, f"obs-{year}.html")
    if not os.path.exists(path) or time.time() - os.path.getmtime(path) > 7 * 86400:
        with open(path, "w", encoding="utf-8") as f:
            f.write(fetch(f"{BASE}obs-{year}.html"))
    text = open(path, encoding="utf-8").read()
    head = [re.sub(r"<.*?>", "", h).strip() for h in re.findall(r"<th[^>]*>(.*?)</th>", text, re.S)]
    rows = []
    for row in re.findall(r"<tr>(.*?)</tr>", text, re.S):
        c = cells(row)
        if len(c) >= len(head) and c[0]:
            d = dict(zip(head, c))
            d["F/U"] = int(d.get("F/U") or 0)
            rows.append(d)
    me = next((r for r in rows if r["Code"] == code), None)
    if not me:
        return None
    europe = [r for r in rows if r.get("Country") in EUROPE]
    return {
        "year": year,
        "count": me["F/U"],
        "rank": 1 + sum(1 for r in rows if r["F/U"] > me["F/U"]),
        "of": sum(1 for r in rows if r["F/U"] > 0),
        "europe_rank": 1 + sum(1 for r in europe if r["F/U"] > me["F/U"]),
    }


def recent_station_ranks(code, cache_dir):
    """Station placings in MPEC Watch's home-page top-10 tables (last year / 5 years / all time)."""
    path = os.path.join(cache_dir, "index.html")
    if not os.path.exists(path) or time.time() - os.path.getmtime(path) > 86400:
        with open(path, "w", encoding="utf-8") as f:
            f.write(fetch(BASE + "index.html"))
    text = open(path, encoding="utf-8").read()
    marks = sorted([(m.start(), "category", m.group(0).strip()) for m in re.finditer(r"Top MPEC[^<]{0,100}", text)] +
                   [(m.start(), "window", re.sub(r"<.*?>", "", m.group(1)).strip())
                    for m in re.finditer(r"<h[2-5][^>]*>((?:Last|All time)[^<]*)</h[2-5]>", text)])
    out, category = [], None
    for k, (pos, kind, label) in enumerate(marks):
        if kind == "category":
            category = label
            continue
        end = marks[k + 1][0] if k + 1 < len(marks) else len(text)
        for row in re.findall(r"<tr>(.*?)</tr>", text[pos:end], re.S):
            c = cells(row)
            if len(c) >= 3 and c[1].startswith(code + " "):
                window = re.sub(r"\s*\(.*\)", "", label)
                out.append({"category": category, "window": window, "rank": int(c[0]), "count": int(c[2])})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", default="L.Poropat", help="name as written by MPEC Watch, e.g. L.Poropat")
    ap.add_argument("--person", default="L. Poropat", help="name as written in Jost Jahn's people table")
    ap.add_argument("--station", default="L01")
    ap.add_argument("--min-mpecs", type=int, default=150, help="read observers only at stations with this many MPECs")
    ap.add_argument("--cache", default=os.path.join(os.path.dirname(__file__), ".cache", "rank"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "rank.json"))
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    try:
        people = jahn_people(args.cache)
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"Jost Jahn's people table could not be read ({exc}); {args.out} left unchanged")
    print(f"{len(people)} individuals in Jost Jahn's MPEC statistics")

    stations = station_table(args.cache)
    active = [s for s in stations if s["MPECs"] >= args.min_mpecs]
    print(f"{len(stations)} stations, {len(active)} with >= {args.min_mpecs} MPECs")
    per_station = {}
    with cf.ThreadPoolExecutor(args.workers) as pool:
        futures = {pool.submit(station_people, s["Code"], args.cache): s["Code"] for s in active}
        for k, fut in enumerate(cf.as_completed(futures), start=1):
            code = futures[fut]
            try:
                per_station[code] = fut.result()
            except Exception as exc:  # noqa: BLE001
                print(f"  failed {code}: {exc}", file=sys.stderr)
            if k % 25 == 0:
                print(f"  {k}/{len(active)} stations")
    if len(per_station) < 0.95 * len(active):  # only the "main stations" column depends on this scan
        print(f"  only {len(per_station)} of {len(active)} stations read; some observatories may be missing",
              file=sys.stderr)

    result = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Jost Jahn's MPEC statistics (mpec.jostjahn.de) for the personal rank; MPEC Watch "
                  "(sbnmpc.astro.umd.edu/mpecwatch) for observatory placings and stations",
        "name": args.person,
        "stations_scanned": len(per_station),
        "min_station_mpecs": args.min_mpecs,
    }
    # earlier observer rankings: for each period, the newest snapshot at least that old
    history_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), "rank_history.json")
    history = json.load(open(history_path, encoding="utf-8")) if os.path.exists(history_path) else {}
    today = dt.date.fromisoformat(result["generated"][:10])
    bases = {}
    for period, days in PERIODS:
        older = sorted(d for d in history if d <= (today - dt.timedelta(days=days)).isoformat())
        if older:
            bases[period] = older[-1]
    before = {period: ranks_of(history[d]["counts"])[1] for period, d in bases.items()}

    for role, label, mw_role in (("obs", "observer", "observers"), ("mea", "measurer", "measurers")):
        ordered, ranks = rank_people(people, role)
        me = args.person
        if me not in ranks:
            result[label] = None
            continue
        where = stations_by_person(per_station, mw_role)
        pos = next(i for i, (n, _) in enumerate(ordered) if n == me)
        compare = before if role == "obs" else {}

        def row(n, c):
            r = {"rank": ranks[n], "name": n, "count": c, "stations": where.get(key(n), [])[:3]}
            if compare:  # rank then, per period; None: not among that snapshot's top SNAPSHOT_KEEP
                r["prev"] = {period: old.get(n) for period, old in compare.items()}
            return r

        result[label] = {
            "rank": ranks[me],
            "of": len(ordered),
            "count": dict(ordered)[me],
            "percentile": round(100 * (1 - (ranks[me] - 1) / len(ordered)), 2),
            "stations": where.get(key(me), []),
            "top": [row(n, c) for n, c in ordered[:TOP if role == "obs" else 25]],
            "neighbours": [row(n, c) for n, c in ordered[max(0, pos - 5): pos + 6]],
        }
        if compare:
            result[label]["compare"] = [{"period": period, "date": bases[period],
                                         "reconstructed": bool(history[bases[period]].get("reconstructed"))}
                                        for period, _ in PERIODS if period in bases]
        if role == "obs":
            history[today.isoformat()] = {"counts": snapshot_counts(dict(ordered))}
    result["station"] = {"code": args.station,
                         "name": next((s["Observatory"] for s in stations if s["Code"] == args.station), ""),
                         "ranks": station_ranks(stations, args.station)}
    try:
        result["station"]["recent"] = recent_station_ranks(args.station, args.cache)
    except Exception as exc:  # noqa: BLE001 - optional extra
        print("  recent ranks unavailable:", exc, file=sys.stderr)
    try:  # placing among follow-up observatories in the last complete calendar year
        last_year = dt.datetime.now(dt.timezone.utc).year - 1
        result["station"]["followup_year"] = followup_year_rank(args.station, last_year, args.cache)
    except Exception as exc:  # noqa: BLE001 - optional extra
        print("  yearly follow-up rank unavailable:", exc, file=sys.stderr)

    if not result.get("observer"):
        sys.exit(f"{args.person} not found in Jost Jahn's people table; {args.out} left unchanged")
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    keep_from = (today - dt.timedelta(days=200)).isoformat()  # about half a year of weekly snapshots
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump({d: v for d, v in sorted(history.items()) if d >= keep_from}, f, ensure_ascii=False,
                  separators=(",", ":"))
    obs = result["observer"]
    print(f"{args.person}: observer rank #{obs['rank']} of {obs['of']} ({obs['count']} MPECs)")
    print("wrote", os.path.abspath(args.out))


if __name__ == "__main__":
    main()
