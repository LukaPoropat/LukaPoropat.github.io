#!/usr/bin/env python3
"""
Build data/observations.json: every object observed by one person from one MPC station.

  1. Two lists name the Minor Planet Electronic Circulars (MPECs) to check: MPEC Watch lists every
     MPEC with observations from the station (default L01, Visnjan Observatory, Tican), and Jost
     Jahn's MPEC statistics (mpec.jostjahn.de) list the person's own circulars. MPEC Watch misses
     some circulars and lists new ones later; Jost Jahn's list fills those gaps.
  2. Each MPEC is fetched from the Minor Planet Center (cached on disk) and kept only if the
     person appears as observer or measurer for that station in "Observer details".
  3. The station's 80-column observation lines in those MPECs give the objects.
  4. Current orbits come from JPL's Small-Body Database API (falling back to nothing,
     the object is then listed but not drawn).

Results per MPEC are remembered in data/mpec_index.json, so re-runs only fetch new
circulars.  Daily Orbit Update MPECs carry no observer credits and are skipped.
Orbits are cached too and re-fetched from JPL once they are a month old.

Usage:
    python tools/build_observations.py                 # incremental update
    python tools/build_observations.py --refresh-orbits
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
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MPECWATCH = "https://sbnmpc.astro.umd.edu/mpecwatch/byStation/station_{}.html"
JAHN = "https://mpec.jostjahn.de/person-data/{}.js"
MPC_MPEC = re.compile(r"^https://(www\.)?minorplanetcenter\.net/mpec/K\d\d/K\d\d[0-9A-Za-z]+\.html$")
MPEC_ID = re.compile(r"^\d{4}-[A-Z]\d+$")  # e.g. 2026-U49
SBDB = "https://ssd-api.jpl.nasa.gov/sbdb.api"
UA = {"User-Agent": "luka-poropat-website-stats/1.0 (personal site data build)"}
B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def fetch(url, retries=4, timeout=240):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            if exc.code in (400, 404):
                raise
            err = exc
        except Exception as exc:  # noqa: BLE001 - network hiccups: retry
            err = exc
        time.sleep(4 * (attempt + 1))
    raise err


# ---------------------------------------------------------------- MPEC Watch list
def mpec_list(station, cache):
    path = os.path.join(cache, f"station_{station}.html")
    if not os.path.exists(path) or time.time() - os.path.getmtime(path) > 12 * 3600:
        print("downloading MPEC Watch station page ...")
        with open(path, "w", encoding="utf-8") as f:
            f.write(fetch(MPECWATCH.format(station), timeout=900))
    text = open(path, encoding="utf-8").read()
    i = text.find('id="mpec_table"')
    out = []
    for row in re.findall(r"<tr>(.*?)</tr>", text[i:text.find("</table>", i)], re.S):
        tds = re.findall(r"<td>(.*?)</td>", row, re.S)
        m = re.search(r'href="([^"]+)">([^<]+)</a>', tds[1]) if len(tds) >= 7 else None
        if not m:
            continue
        mpec, _, title = html.unescape(m.group(2)).partition("\t")
        out.append({
            "id": mpec.replace("MPEC", "").strip(),
            "title": title.strip(),
            "url": m.group(1),
            "date": tds[2].strip(),
            "discovery": bool(re.sub(r"<.*?>", "", tds[3]).strip()),
            "first_followup": bool(re.sub(r"<.*?>", "", tds[4]).strip()),
            "type": html.unescape(re.sub(r"<.*?>", "", tds[5])).strip(),
        })
    return out


# ---------------------------------------------------------------- Jost Jahn's list
def jahn_list(person, station, cache):
    """The person's circulars from Jost Jahn's MPEC statistics (observer and measurer pages).

    MPEC Watch's station list misses some circulars (50 of Luka's at L01 in October 2026), so these
    fill the gaps. Each one is still read from the Minor Planet Center before it counts. If the list
    can't be read, the run carries on with MPEC Watch alone."""
    out = {}
    for role in ("obs", "mea"):
        path = os.path.join(cache, f"jahn_{person}-{role}.js")
        try:
            if not os.path.exists(path) or time.time() - os.path.getmtime(path) > 12 * 3600:
                try:
                    raw = fetch(JAHN.format(f"{person}-{role}"), retries=2, timeout=120)
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(raw)
                except Exception:  # noqa: BLE001 - keep using the last copy, if there is one
                    if not os.path.exists(path):
                        raise
            raw = open(path, encoding="utf-8").read()
            rows = json.loads(raw[raw.index("=") + 1:].strip().rstrip(";"))["data"]
        except Exception as exc:  # noqa: BLE001 - someone else's site: never let it break the build
            print(f"  Jost Jahn's {role} list not read ({exc}); using MPEC Watch only", file=sys.stderr)
            continue
        for row in rows:
            mpec, url, title, stations, date = row[0], row[1], row[2], row[4], row[6]
            if station in stations and MPEC_ID.match(mpec) and MPC_MPEC.match(url):
                out[mpec] = {"id": mpec, "title": title, "url": url, "date": date,
                             "discovery": None, "first_followup": None, "type": "", "src": "jahn"}
    return list(out.values())


# ---------------------------------------------------------------- MPEC parsing
def mpec_text(mpec_id, url, cache):
    # Cache by MPEC number: packed names such as K22Ua1 (U361) and K22UA1 (U101) differ only
    # in case and collide on case-insensitive file systems (Windows, macOS).
    if not MPEC_ID.match(mpec_id):  # the numbers come from other sites' lists and become file names
        raise ValueError(f"not an MPEC number: {mpec_id!r}")
    path = os.path.join(cache, "mpec", mpec_id + ".txt")
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    raw = fetch(url)
    text = html.unescape(re.sub(r"<[^>]+>", "", raw))
    if mpec_id not in text[:4000]:
        raise ValueError(f"{url} does not contain MPEC {mpec_id}")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def station_entry(text, station):
    i = text.find("Observer details:")
    if i < 0:
        return None
    end = len(text)
    for stop in ("Orbital elements", "Residuals", "Ephemeris:", "Observations:", "MPEC number"):
        j = text.find(stop, i + 10)
        if 0 < j < end:
            end = j
    for entry in re.split(r"\n(?=[0-9A-Z]\w\w )", text[i:end]):
        if entry.startswith(station + " "):
            return re.sub(r"\s*\n\s*", " ", entry.strip())
    return None


def roles(entry, surname):
    """Return (observer, measurer) flags for `surname` inside one station entry."""
    if not entry or surname not in entry:
        return False, False
    tel = re.search(r"\d+(\.\d+)?-m\b|\bCCD\b|\bCMO\b", entry)
    tel = tel.start() if tel else len(entry)
    obs = entry.find("Observer")
    mea = entry.find("Measurer")
    mea = mea if mea >= 0 else tel
    hits = [m.start() for m in re.finditer(re.escape(surname), entry)]
    is_obs = obs >= 0 and any(obs < h < min(mea, tel) for h in hits)
    is_mea = mea < tel and any(mea < h < tel for h in hits)
    return is_obs or (not is_mea), is_mea


def unpack_number(s):
    s = s.strip()
    if not s:
        return None
    if s[0] == "~":
        n = 0
        for ch in s[1:]:
            n = n * 62 + B62.index(ch)
        return 620000 + n
    if s.isdigit():
        return int(s)
    if s[0].isalpha() and s[1:].isdigit():
        return B62.index(s[0]) * 10000 + int(s[1:])
    return None


def unpack_provisional(p):
    p = p.strip()
    if len(p) != 7 or p[0] not in "IJK":
        return None
    year = {"I": 1800, "J": 1900, "K": 2000}[p[0]] + int(p[1:3])
    cycle = B62.index(p[4]) * 10 + int(p[5]) if p[5].isdigit() else None
    if cycle is None:
        return None
    return f"{year} {p[3]}{p[6]}{cycle if cycle else ''}"


def unpack_comet(line):
    num, kind, prov = line[0:4].strip(), line[4], line[5:12].strip()
    if prov and len(prov) == 7 and prov[0] in "IJK":
        year = {"I": 1800, "J": 1900, "K": 2000}[prov[0]] + int(prov[1:3])
        cycle = B62.index(prov[4]) * 10 + int(prov[5])
        if num:
            return f"{int(num)}{kind}"
        if prov[6].isupper():  # asteroid-style comet designation: K22Q78E = C/2022 QE78
            return f"{kind}/{year} {prov[3]}{prov[6]}{cycle if cycle else ''}"
        frag = "" if prov[6] == "0" else "-" + prov[6].upper()  # lower-case = fragment
        return f"{kind}/{year} {prov[3]}{cycle}{frag}"
    if num.isdigit():
        return f"{int(num)}{kind}"
    return None


def observed_objects(text, station):
    """Objects + observation dates from the station's 80-column lines."""
    found = {}
    for line in text.split("\n"):
        if len(line) < 80 or line[77:80] != station or not re.match(r"\d{4} \d\d \d\d", line[15:25]):
            continue
        if line[4] in "PCDXIA" and (line[0:4].strip() == "" or line[0:4].isdigit()):
            des = unpack_comet(line)
        else:
            num = unpack_number(line[0:5])
            des = str(num) if num else unpack_provisional(line[5:12])
        if not des:
            continue
        date = line[15:25].replace(" ", "-")
        rec = found.setdefault(des, {"first": date, "last": date, "n": 0})
        rec["first"], rec["last"] = min(rec["first"], date), max(rec["last"], date)
        rec["n"] += 1
    return found


def followup_flags(text, station):
    """(first follow-up, discovery) for `station`, read from an MPEC's observation lines, for circulars
    MPEC Watch doesn't list. As in MPEC Watch, the discovery is the line marked '*', and the first
    follow-up is the earliest later observation by a station that hadn't already seen the object
    (this rule reproduces MPEC Watch's flag on all 1,125 L01 circulars crediting Luka, October 2026)."""
    tracks = {}
    for line in text.split("\n"):
        m = re.match(r"(\d{4}) (\d\d) (\d\d\.\d+)", line[15:32]) if len(line) >= 80 else None
        if m:
            when = (int(m.group(1)), int(m.group(2)), float(m.group(3)))
            tracks.setdefault(line[0:12], []).append((when, line[77:80], line[12] == "*"))
    first = disc = False
    for obs in tracks.values():
        found = [o for o in obs if o[2]]
        if not found:
            continue
        t0, st0, _ = min(found)
        disc = disc or st0 == station
        seen = {o[1] for o in obs if o[0] <= t0} | {st0}  # discoverer, precoveries, same-night detections
        later = sorted(o for o in obs if o[0] > t0 and o[1] not in seen)
        first = first or (bool(later) and later[0][1] == station)
    return first, disc


def title_designation(title):
    t = re.sub(r"^COMET\s+", "", title.strip())
    t = re.sub(r"\s+\(.*\)$", "", t) if t.startswith(("C/", "P/", "A/", "I/")) else t
    numbered = re.match(r"^(\d+[PDI])/", t)
    return numbered.group(1) if numbered else t


# ---------------------------------------------------------------- JPL SBDB
ORBIT_MAX_AGE = 30 * 86400  # re-fetch cached orbits monthly: young orbits improve and objects get numbered


def sbdb(des, cache, refresh=False):
    path = os.path.join(cache, "sbdb", re.sub(r"[^\w\-]", "_", des) + ".json")
    old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else None
    # a failed lookup (network trouble, rate limit) is never trusted: it is tried again on every run
    if old is not None and not refresh and "error" not in old and time.time() - os.path.getmtime(path) < ORBIT_MAX_AGE:
        return old
    url = SBDB + "?" + urllib.parse.urlencode({"sstr": des, "phys-par": "1"})
    try:
        data = json.loads(fetch(url))
    except Exception as exc:  # noqa: BLE001
        if old is not None and "orbit" in old:
            return old  # JPL unreachable: keep the previous orbit and try again next run
        data = {"error": str(exc)}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(data, open(path, "w", encoding="utf-8"))
    time.sleep(0.15)
    return data


def orbit_record(data):
    if not data or "orbit" not in data:
        return None
    o, orb = data["object"], data["orbit"]
    el = {e["name"]: e["value"] for e in orb.get("elements", [])}
    phys = {p["name"]: p["value"] for p in data.get("phys_par", [])}

    def f(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    rec = {
        "full": o.get("fullname"),
        "des": o.get("des"),
        "kind": o.get("kind"),
        "cls": (o.get("orbit_class") or {}).get("code"),
        "neo": bool(o.get("neo")),
        "pha": bool(o.get("pha")),
        "e": f(el.get("e")), "a": f(el.get("a")), "q": f(el.get("q")), "i": f(el.get("i")),
        "om": f(el.get("om")), "w": f(el.get("w")), "ma": f(el.get("ma")), "tp": f(el.get("tp")),
        "epoch": f(orb.get("epoch")),
        "moid": f(orb.get("moid")),
        "H": f(phys.get("H")),
        "diam": f(phys.get("diameter")),
        "arc": orb.get("data_arc"),
    }
    return rec


def category(rec, title_type):
    if rec is None:
        return "comet" if title_type == "Comet" else "other"
    if rec["kind"] and rec["kind"].startswith("c"):
        return "comet"
    if rec["pha"]:
        return "pha"
    return {"APO": "apollo", "ATE": "aten", "AMO": "amor", "IEO": "atira"}.get(rec["cls"], "other")


def mpec_type(rec, title):
    """MPEC Watch's object-type code, worked out from the orbit for circulars MPEC Watch doesn't list."""
    if "COMET" in title.upper() or (rec and (rec["kind"] or "").startswith("c")):
        return "Comet"
    if not rec or rec["H"] is None:
        return ""
    if rec["pha"]:
        return "PHAl18" if rec["H"] < 18 else "PHAg18"
    if rec["neo"]:
        return "NEAl18" if rec["H"] < 18 else "NEA (H>22)" if rec["H"] > 22 else "NEA (18>H>22)"
    return ""


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--station", default="L01")
    ap.add_argument("--surname", default="Poropat", help="surname as printed in MPEC observer details")
    ap.add_argument("--jahn", default="lporopat",
                    help="person key on mpec.jostjahn.de (page lporopat-obs.html); '' for MPEC Watch only")
    ap.add_argument("--cache", default=os.path.join(os.path.dirname(__file__), ".cache"))
    ap.add_argument("--workers", type=int, default=3, help="parallel MPEC downloads (be gentle)")
    ap.add_argument("--refresh-orbits", action="store_true")
    ap.add_argument("--reparse", action="store_true", help="re-extract objects from cached MPECs (after parser fixes)")
    ap.add_argument("--limit", type=int, default=0, help="debug: only process N MPECs")
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    data_dir = os.path.join(ROOT, "data")
    os.makedirs(data_dir, exist_ok=True)
    index_path = os.path.join(data_dir, "mpec_index.json")
    index = json.load(open(index_path, encoding="utf-8")) if os.path.exists(index_path) else {}

    mpecs = mpec_list(args.station, args.cache)
    listed = {m["id"]: m for m in mpecs}
    extra = [m for m in (jahn_list(args.jahn, args.station, args.cache) if args.jahn else []) if m["id"] not in listed]
    # a circular first found through Jost Jahn's list takes MPEC Watch's flags once MPEC Watch lists it too
    for mid, rec in index.items():
        if rec.get("src") == "jahn" and mid in listed:
            m = listed[mid]
            rec.update({"ty": m["type"], "ff": m["first_followup"], "disc": m["discovery"]})
            del rec["src"]
    todo = [m for m in mpecs + extra if m["id"] not in index and "DAILY ORBIT UPDATE" not in m["title"].upper()]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(mpecs)} MPECs with {args.station} observations on MPEC Watch, {len(extra)} more in "
          f"Jost Jahn's list, {len(todo)} new to check")

    def work(m):
        text = mpec_text(m["id"], m["url"], args.cache)
        entry = station_entry(text, args.station)
        is_obs, is_mea = roles(entry, args.surname)
        if m.get("src") == "jahn":  # no MPEC Watch flags for this one: read them from the observation lines
            ff, disc = followup_flags(text, args.station)
            m = dict(m, first_followup=ff, discovery=disc, type="Comet" if "COMET" in m["title"].upper() else "")
        rec = {"t": m["title"], "d": m["date"][:10], "ty": m["type"], "ff": m["first_followup"],
               "disc": m["discovery"], "u": m["url"], "me": bool(entry and args.surname in entry),
               "obs": is_obs, "mea": is_mea}
        if m.get("src"):
            rec["src"] = m["src"]
        if not rec["me"]:
            return m["id"], {"me": False}  # remembered so it is never fetched again
        rec["objects"] = observed_objects(text, args.station)
        if not rec["objects"]:
            des = title_designation(m["title"])
            rec["objects"] = {des: {"first": m["date"][:10], "last": m["date"][:10], "n": 0}}
        return m["id"], rec

    done = 0
    with cf.ThreadPoolExecutor(args.workers) as pool:
        for fut in cf.as_completed([pool.submit(work, m) for m in todo]):
            try:
                mid, rec = fut.result()
                index[mid] = rec
            except Exception as exc:  # noqa: BLE001
                print("  failed:", exc, file=sys.stderr)
            done += 1
            if done % 200 == 0:
                print(f"  {done}/{len(todo)} MPECs checked")
                json.dump(index, open(index_path, "w", encoding="utf-8"), separators=(",", ":"))
    if args.reparse:
        for mid, rec in index.items():
            if rec.get("me"):
                text = mpec_text(mid, rec["u"], args.cache)
                rec["objects"] = observed_objects(text, args.station) or {
                    title_designation(rec["t"]): {"first": rec["d"], "last": rec["d"], "n": 0}}
    json.dump(index, open(index_path, "w", encoding="utf-8"), separators=(",", ":"))

    # ---- aggregate objects
    mine = {k: v for k, v in index.items() if v.get("me")}
    objects = {}
    for mid, rec in sorted(mine.items(), key=lambda kv: kv[1]["d"]):
        for des, o in rec.get("objects", {}).items():
            obj = objects.setdefault(des, {"first": o["first"], "last": o["last"], "nobs": 0, "mpecs": [],
                                           "ff": False, "type": rec["ty"]})
            obj["first"], obj["last"] = min(obj["first"], o["first"]), max(obj["last"], o["last"])
            obj["nobs"] += o["n"]
            obj["mpecs"].append(mid)
            obj["ff"] = obj["ff"] or rec["ff"]
            if rec["ty"]:
                obj["type"] = rec["ty"]
    print(f"{len(mine)} MPECs credit {args.surname}; {len(objects)} distinct objects")

    # orbits from JPL; lookups that fail (busy server, rate limit) get a second try after a pause
    orbit_data = {}
    for k, des in enumerate(sorted(objects, key=lambda d: objects[d]["first"]), start=1):
        orbit_data[des] = sbdb(des, args.cache, args.refresh_orbits)
        if k % 100 == 0:
            print(f"  orbits {k}/{len(objects)}")
    failed = [des for des, data in orbit_data.items() if "error" in data]
    if failed:
        print(f"  {len(failed)} orbit lookups failed; trying them again in 60 s")
        time.sleep(60)
        for des in failed:
            orbit_data[des] = sbdb(des, args.cache, refresh=True)
            time.sleep(1)
        still = [des for des in failed if "error" in orbit_data[des]]
        if still:
            print("  still no orbit (next run tries again): " + ", ".join(still), file=sys.stderr)

    orbits = {des: orbit_record(data) for des, data in orbit_data.items()}
    rows = {}  # keyed by JPL's designation, so renamed objects (A/2022 T1 -> C/2022 T1) merge
    for des, obj in sorted(objects.items(), key=lambda kv: kv[1]["first"]):
        orb = orbits[des]
        key = (orb or {}).get("full") or des
        if key in rows:
            row = rows[key]
            row["first"], row["last"] = min(row["first"], obj["first"]), max(row["last"], obj["last"])
            row["nobs"] += obj["nobs"]
            row["mpecs"] = sorted(set(row["mpecs"]) | set(obj["mpecs"]), key=lambda m: index[m]["d"])
            row["ff"] = row["ff"] or obj["ff"]
            continue
        row = {"id": des, "name": key, "cat": category(orb, obj["type"]),
               "first": obj["first"], "last": obj["last"], "nobs": obj["nobs"], "mpecs": obj["mpecs"], "ff": obj["ff"]}
        if orb and orb["e"] is not None and orb["om"] is not None:
            row.update({k2: orb[k2] for k2 in ("a", "e", "q", "i", "om", "w", "ma", "tp", "epoch", "H", "moid", "cls", "diam")})
        rows[key] = row
    out_objects = list(rows.values())

    by_year, by_cat = {}, {}
    for rec in mine.values():
        y = rec["d"][:4]
        by_year[y] = by_year.get(y, 0) + 1
    for o in out_objects:
        by_cat[o["cat"]] = by_cat.get(o["cat"], 0) + 1
    summary = {
        "mpecs": len(mine),
        "mpecs_as_observer": sum(1 for r in mine.values() if r["obs"]),
        "mpecs_as_measurer": sum(1 for r in mine.values() if r["mea"]),
        "first_followups": sum(1 for r in mine.values() if r["ff"]),
        "objects": len(out_objects),
        "observations": sum(o["nobs"] for o in out_objects),
        "with_orbit": sum(1 for o in out_objects if "a" in o),
        "first_mpec": min((r["d"] for r in mine.values()), default=None),
        "last_mpec": max((r["d"] for r in mine.values()), default=None),
        "mpecs_by_year": dict(sorted(by_year.items())),
        "objects_by_category": by_cat,
        "station_mpecs_checked": len(index),
        "mpecs_only_in_jahn": sum(1 for r in mine.values() if r.get("src") == "jahn"),
    }

    def type_of(rec):  # circulars only Jost Jahn's list has: MPEC Watch's type code from the orbit
        if rec["ty"]:
            return rec["ty"]
        return mpec_type(orbits.get(next(iter(rec.get("objects", {})), None)), rec["t"])

    result = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "station": args.station,
        "observer": args.surname,
        "summary": summary,
        "mpecs": [{"id": k, "t": v["t"], "d": v["d"], "ty": type_of(v), "ff": v["ff"], "obs": v["obs"],
                   "mea": v["mea"], "u": v["u"]}
                  for k, v in sorted(mine.items(), key=lambda kv: kv[1]["d"], reverse=True)],
        "objects": out_objects,
    }
    out_path = os.path.join(data_dir, "observations.json")
    print(json.dumps(summary, indent=1))
    # a run that found nothing new leaves the file alone (only "generated" would change), so the daily
    # workflow has nothing to commit and doesn't republish the site
    old = json.load(open(out_path, encoding="utf-8")) if os.path.exists(out_path) else None
    same = old is not None and {k: v for k, v in old.items() if k != "generated"} == \
        {k: v for k, v in json.loads(json.dumps(result)).items() if k != "generated"}
    if same:
        print("nothing new;", out_path, "left as it is")
        return
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"), ensure_ascii=False)
    print("wrote", out_path)


if __name__ == "__main__":
    main()
