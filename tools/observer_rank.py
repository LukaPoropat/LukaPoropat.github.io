#!/usr/bin/env python3
"""
Compute an individual observer's world rank from MPEC Watch.

MPEC Watch (https://sbnmpc.astro.umd.edu/mpecwatch/, Q. Ye & T. Hibbitts) parses
every Minor Planet Electronic Circular and tallies, per observatory code, how many
MPECs credit each individual observer.  This script:

  1. reads the observatory table (obs.html) to get every station's MPEC total,
  2. downloads only the tail of each sufficiently active station page (HTTP Range),
     where the "Individual Observer" / "Individual Measurer" tables live,
  3. sums each person's MPEC credits over all stations and ranks everyone,
  4. writes data/rank.json for the website.

An individual can never have more MPECs at a station than the station itself, so
stations below --min-mpecs cannot change the ranking of anyone above
(--min-mpecs x number of stations they observe from).

Usage:
    python tools/observer_rank.py --name L.Poropat --station L01
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.request

BASE = "https://sbnmpc.astro.umd.edu/mpecwatch/"
UA = {"User-Agent": "luka-poropat-website-stats/1.0 (personal site; contact via site)"}
NOT_PEOPLE = re.compile(r"unknown|collaboration|team|survey|project|staff|observers|students", re.I)


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


def rank_people(per_station, key):
    totals, where = {}, {}
    for code, tables in per_station.items():
        for name, n in tables[key].items():
            if NOT_PEOPLE.search(name):
                continue
            totals[name] = totals.get(name, 0) + n
            where.setdefault(name, []).append([code, n])
    ordered = sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))
    ranks, prev, rank = {}, None, 0
    for pos, (name, n) in enumerate(ordered, start=1):
        if n != prev:
            rank, prev = pos, n
        ranks[name] = rank
    return ordered, ranks, where


def station_ranks(stations, code):
    keys = {"MPECs": "MPECs", "F/U": "Follow-up", "1st F/U": "First follow-up",
            "NEA FU": "NEA follow-up", "PHA FU": "PHA follow-up", "Comet FU": "Comet follow-up"}
    out = []
    for key, label in keys.items():
        active = [s for s in stations if s[key] > 0]
        ordered = sorted(active, key=lambda s: -s[key])
        for pos, s in enumerate(ordered, start=1):
            if s["Code"] == code:
                better = sum(1 for o in ordered if o[key] > s[key])
                out.append({"metric": label, "rank": better + 1, "of": len(active), "count": s[key]})
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
    ap.add_argument("--station", default="L01")
    ap.add_argument("--min-mpecs", type=int, default=150, help="ignore stations with fewer MPECs")
    ap.add_argument("--cache", default=os.path.join(os.path.dirname(__file__), ".cache", "rank"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "rank.json"))
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

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
    if len(per_station) < 0.95 * len(active):  # a partial scan would give a wrong rank
        sys.exit(f"only {len(per_station)} of {len(active)} stations could be read; {args.out} left unchanged")

    result = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "MPEC Watch (sbnmpc.astro.umd.edu/mpecwatch), Minor Planet Center MPECs",
        "name": args.name,
        "stations_scanned": len(per_station),
        "min_station_mpecs": args.min_mpecs,
    }
    for key, label in (("observers", "observer"), ("measurers", "measurer")):
        ordered, ranks, where = rank_people(per_station, key)
        me = args.name
        if me not in ranks:
            result[label] = None
            continue
        pos = next(i for i, (n, _) in enumerate(ordered) if n == me)
        result[label] = {
            "rank": ranks[me],
            "of": len(ordered),
            "count": dict(ordered)[me],
            "percentile": round(100 * (1 - (ranks[me] - 1) / len(ordered)), 2),
            "stations": sorted(where[me], key=lambda x: -x[1]),
            "top": [{"rank": ranks[n], "name": n, "count": c, "stations": [w[0] for w in sorted(where[n], key=lambda x: -x[1])[:3]]}
                    for n, c in ordered[:25]],
            "neighbours": [{"rank": ranks[n], "name": n, "count": c, "stations": [w[0] for w in sorted(where[n], key=lambda x: -x[1])[:3]]}
                           for n, c in ordered[max(0, pos - 5): pos + 6]],
        }
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
        sys.exit(f"{args.name} not found in MPEC Watch's observer tables; {args.out} left unchanged")
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    obs = result.get("observer")
    if obs:
        print(f"{args.name}: observer rank #{obs['rank']} of {obs['of']} ({obs['count']} MPECs)")
    print("wrote", os.path.abspath(args.out))


if __name__ == "__main__":
    main()
