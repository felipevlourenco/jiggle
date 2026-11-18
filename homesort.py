#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = ["pymobiledevice3"]
# ///
"""
homesort.py: minimal POC that reads, sorts and rewrites an iPhone home screen over USB.

Setup (macOS):
    python3 -m venv .venv && source .venv/bin/activate
    pip install pymobiledevice3
    Plug in the iPhone, unlock it and tap "Trust this computer".

Usage:
    python homesort.py dump                     # save current layout to backup.plist, print it
    python homesort.py icons                    # save every app icon PNG into ./icons
    python homesort.py sort                     # dry run: show the new alphabetical order
    python homesort.py sort --by category       # dry run: group by App Store category
    python homesort.py sort --apply             # actually write the new layout to the phone
    python homesort.py sort --all-pages         # also sort apps on widget pages (widgets stay)
    python homesort.py restore                  # put backup.plist back on the phone

What it touches: only home screen pages. The dock is left alone, folders are sorted as
single items by their name, and any page holding a widget or anything unrecognised is
kept exactly as it was.
"""
import argparse
import asyncio
import json
import plistlib
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.springboard import SpringBoardServicesService

BACKUP = Path("backup.plist")
ICONS_DIR = Path("icons")
PER_PAGE = 24  # 6 rows x 4 columns on current iPhones


# ---------- layout helpers (pure functions, easy to test without a phone) ----------

def is_app(item) -> bool:
    return isinstance(item, dict) and "bundleIdentifier" in item and "listType" not in item \
        and "gridSize" not in item and "elementType" not in item


def is_folder(item) -> bool:
    return isinstance(item, dict) and item.get("listType") == "folder"


def name_of(item) -> str:
    return (item.get("displayName") or item.get("bundleIdentifier") or "").strip()


def iter_apps(state):
    """Every app on the phone, including ones inside folders and the dock."""
    for page in state:
        for item in page:
            if is_app(item):
                yield item
            elif is_folder(item):
                for sub in item.get("iconLists", []):
                    yield from (i for i in sub if is_app(i))


def build_sorted_state(state, key, all_pages=False):
    """state[0] is the dock, state[1:] are home screen pages.

    Default: pages with a widget (or anything unrecognised) are kept untouched.
    all_pages=True: apps and folders are pulled out of those pages too, and only
    the widgets/other items stay behind on them.
    """
    dock, pages = state[0], state[1:]
    frozen, movable = [], []
    for page in pages:
        if all(is_app(i) or is_folder(i) for i in page):
            movable.extend(page)
        elif all_pages:
            movable.extend(i for i in page if is_app(i) or is_folder(i))
            frozen.append([i for i in page if not (is_app(i) or is_folder(i))])
        else:
            frozen.append(page)  # widgets or unknown items: leave the page as is
    movable.sort(key=key)
    new_pages = [movable[i:i + PER_PAGE] for i in range(0, len(movable), PER_PAGE)]
    return [dock, *frozen, *new_pages]


def describe(state) -> str:
    lines = []
    for n, page in enumerate(state):
        label = "Dock" if n == 0 else f"Page {n}"
        names = []
        for i in page:
            if is_app(i):
                names.append(name_of(i))
            elif is_folder(i):
                names.append(f"[{name_of(i)}]")
            else:
                names.append("<widget/other>")
        lines.append(f"{label}: " + ", ".join(names))
    return "\n".join(lines)


# ---------- App Store categories ----------

def lookup_categories(bundle_ids, country="nl"):
    """bundleId -> primaryGenreName via Apple's public iTunes Lookup API."""
    cats = {}
    for bid in bundle_ids:
        if bid.startswith("com.apple."):
            cats[bid] = "Apple"
            continue
        url = "https://itunes.apple.com/lookup?" + urllib.parse.urlencode(
            {"bundleId": bid, "country": country})
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                results = json.load(r).get("results", [])
            cats[bid] = results[0]["primaryGenreName"] if results else "Other"
        except Exception:
            cats[bid] = "Other"
    return cats


def make_key(by, state):
    if by == "name":
        return lambda i: name_of(i).lower()
    cats = lookup_categories({a["bundleIdentifier"] for a in iter_apps(state)})
    # Folders go first, then apps grouped by category, alphabetical inside each group
    return lambda i: ("", name_of(i).lower()) if is_folder(i) else \
        (cats.get(i["bundleIdentifier"], "Other"), name_of(i).lower())


# ---------- commands ----------

async def main():
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["dump", "icons", "sort", "restore"])
    p.add_argument("--by", choices=["name", "category"], default="name")
    p.add_argument("--apply", action="store_true", help="write the new layout to the phone")
    p.add_argument("--all-pages", action="store_true",
                   help="also sort apps that sit on pages with widgets (widgets stay put)")
    args = p.parse_args()

    async with await create_using_usbmux() as lockdown:
        async with SpringBoardServicesService(lockdown) as sb:
            if args.cmd == "restore":
                await sb.set_icon_state(plistlib.loads(BACKUP.read_bytes()))
                print("Restored layout from", BACKUP)
                return

            state = await sb.get_icon_state()
            if not BACKUP.exists() or args.cmd == "dump":
                BACKUP.write_bytes(plistlib.dumps(state))
                print(f"Saved current layout to {BACKUP}\n")

            if args.cmd == "dump":
                print(describe(state))
            elif args.cmd == "icons":
                ICONS_DIR.mkdir(exist_ok=True)
                for app in iter_apps(state):
                    bid = app["bundleIdentifier"]
                    (ICONS_DIR / f"{bid}.png").write_bytes(await sb.get_icon_pngdata(bid))
                print("Icons saved to", ICONS_DIR)
            elif args.cmd == "sort":
                new_state = build_sorted_state(state, make_key(args.by, state), args.all_pages)
                print(describe(new_state))
                if args.apply:
                    await sb.set_icon_state(new_state)
                    print("\nApplied. Undo with: python homesort.py restore")
                else:
                    print("\nDry run. Add --apply to write it to the phone.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(1)
