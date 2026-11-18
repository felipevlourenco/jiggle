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


def device(n, name, product, model, os, state="ready"):
    return {
        "udid": f"00008130-000A1B2C3D4E{n:04d}",
        "name": name,
        "productType": product,
        "modelName": model,
        "deviceClass": "iPhone",
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
print("wrote", sorted(p.name for p in OUT.glob("*.json")))
