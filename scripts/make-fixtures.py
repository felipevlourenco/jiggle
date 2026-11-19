#!/usr/bin/env python3
"""Rebuild tests/fixtures/*.json from the POC's backup.plist.

Run from the repo root: python3 scripts/make-fixtures.py
"""
import copy
import json
import plistlib
import sys
from pathlib import Path

sys.path.insert(0, "sidecar")
from jiggle_engine.plistjson import to_json  # noqa: E402  (same tagging the engine uses)

OUT = Path("tests/fixtures")


def is_widget(i):
    return "gridSize" in i or "elementType" in i


def is_app(i):
    return "bundleIdentifier" in i and not is_widget(i) and i.get("listType") != "folder"


def is_folder(i):
    return i.get("listType") == "folder"


def device(n, name, product, model, os, state="ready", kind="iPhone"):
    return {
        "udid": f"00008130-000A1B2C3D4E{n:04d}",
        "name": name,
        "productType": product,
        "modelName": model,
        "deviceClass": kind,
        "osVersion": os,
        "connection": "usb",
        "state": state,
    }


def write(name, dev, state):
    (OUT / f"{name}.json").write_text(
        json.dumps({"device": dev, "rawState": to_json(state)}, indent=2) + "\n"
    )


real = plistlib.loads(Path("backup.plist").read_bytes())
dock, pages = real[0], real[1:]

# basic: no widgets, no unrecognised items
basic_pages = [[i for i in p if is_app(i) or is_folder(i)] for p in pages]
basic = [dock, *[p for p in basic_pages if p]]

# messy: three one-app folders plus two empty pages (the Cleanup sample)
messy = copy.deepcopy(basic)
for page_no, folder_name in ((1, "Games"), (2, "Banking"), (3, "New")):
    page = messy[page_no]
    idx = next(n for n, i in enumerate(page) if is_app(i))
    page[idx] = {"displayName": folder_name, "iconLists": [[page[idx]]], "listType": "folder"}
messy.insert(4, [])
messy.append([])

ios17 = device(1, "Sam's iPhone", "iPhone17,1", "iPhone 16 Pro", "26.1")
write("iphone-basic", ios17, basic)
write("iphone-widgets", device(2, "Sam's iPhone", "iPhone17,1", "iPhone 16 Pro", "26.1"), real)
write("iphone-messy", device(3, "Sam's iPhone", "iPhone17,1", "iPhone 16 Pro", "26.1"), messy)
write(
    "iphone-ios16",
    device(4, "Sam's iPhone", "iPhone14,2", "iPhone 13 Pro", "16.7", "unsupported-os"),
    basic,
)
# blocked-phone states, for the Connect screen
for n, name, state in ((5, "locked", "locked"), (6, "trust-pending", "trust-pending"), (7, "trust-declined", "trust-declined")):
    write(f"iphone-{name}", device(n, "Sam's iPhone", "iPhone17,1", "iPhone 16 Pro", "26.1", state), basic)

# iPad (landscape, 6 x 5 = 30 per page): made-up from the iPhone's apps, not recorded from a real iPad.
# ponytail: replace with a recording of a real iPad's icon state when there is one.
def repack(items, first=()):
    """Pages of 30 cells. `first` is a list of (widget, cells) that take the start of consecutive pages."""
    pages, rest = [], list(items)
    for widget, cells in first:
        pages.append([copy.deepcopy(widget), *[rest.pop(0) for _ in range(30 - cells)]])
    while rest:
        pages.append([rest.pop(0) for _ in range(min(30, len(rest)))])
    return pages


apps_and_folders = [i for p in basic[1:] for i in p]
ipad = lambda n, name: device(n, name, "iPad14,8", "iPad Air 11-inch (M2)", "26.1", kind="iPad")
write("ipad-basic", ipad(11, "Sam's iPad"), [dock, *repack(apps_and_folders)])
widgets = [i for p in pages for i in p if is_widget(i)]
medium = {**widgets[0], "gridSize": "medium"}
large = {**widgets[0], "gridSize": "large", "widgetIdentifier": "LargeWidget"}
write(
    "ipad-widgets",
    ipad(12, "Sam's iPad"),
    [dock, *repack(apps_and_folders, first=[(medium, 8), (large, 16)])],
)
print("wrote", sorted(p.name for p in OUT.glob("*.json")))
