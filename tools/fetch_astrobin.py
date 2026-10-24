#!/usr/bin/env python3
"""
Download web-sized copies of my AstroBin images for the gallery page.

Writes assets/images/gallery/<slug>.jpg (max 1824 px wide, plus a 640 px thumbnail
<slug>-thumb.jpg) and data/gallery.json.  Re-run after posting new images on AstroBin.

    python tools/fetch_astrobin.py --user-id 93381
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.request

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
API = "https://app.astrobin.com/api/v2/images/image/?user={}&page={}&gallery-serializer=1&subsection=uploaded"
UA = {"User-Agent": "Mozilla/5.0 (personal website gallery sync)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def slug(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return s[:48].rstrip("-")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user-id", default="93381", help="AstroBin numeric user id (AstroLux = 93381)")
    args = ap.parse_args()
    out_dir = os.path.join(ROOT, "assets", "images", "gallery")
    os.makedirs(out_dir, exist_ok=True)

    images, page = [], 1
    while True:
        data = json.loads(get(API.format(args.user_id, page)))
        images += data.get("results", [])
        if not data.get("next"):
            break
        page += 1

    gallery, used = [], set()
    for img in images:
        thumbs = {t["alias"]: t["url"] for t in img.get("thumbnails", [])}
        key = re.sub(r"[^A-Za-z0-9]", "", str(img.get("hash") or ""))
        name = slug(img["title"]) or "image"
        if name in used:  # two images with the same title (or none) must not share one file
            name = f"{name}-{key.lower()[:8]}"
        used.add(name)
        path = os.path.join(out_dir, name + ".jpg")
        try:
            if not os.path.exists(path):
                pic = Image.open(io.BytesIO(get(thumbs["hd"]))).convert("RGB")
                pic.save(path, "JPEG", quality=88, optimize=True, progressive=True)
                small = pic.copy()
                small.thumbnail((640, 640 * 3))
                small.save(os.path.join(out_dir, name + "-thumb.jpg"), "JPEG", quality=82, optimize=True, progressive=True)
                print("saved", name)
            w, h = Image.open(path).size
        except Exception as exc:  # noqa: BLE001 - one bad image shouldn't stop the whole gallery update
            print(f"  skipped {img.get('title')!r}: {exc}", file=sys.stderr)
            continue
        gallery.append({
            "title": img["title"],
            "date": (img.get("published") or img.get("uploaded") or "")[:10],
            "src": f"assets/images/gallery/{name}.jpg",
            "thumb": f"assets/images/gallery/{name}-thumb.jpg",
            "w": w, "h": h,
            "url": f"https://www.astrobin.com/{key}/",
        })
    with open(os.path.join(ROOT, "data", "gallery.json"), "w", encoding="utf-8") as f:
        json.dump(gallery, f, indent=1, ensure_ascii=False)
    print(len(gallery), "images in data/gallery.json")


if __name__ == "__main__":
    main()
