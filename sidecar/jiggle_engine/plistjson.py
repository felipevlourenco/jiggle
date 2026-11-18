"""Reversible plist <-> JSON.

JSON has no date or data type, but the icon state has dates and a restore must write it
back exactly as read. So they are tagged: {"$date": "<iso>"} and {"$data": "<base64>"}.
"""
import base64
import datetime
from typing import Any


def to_json(o: Any) -> Any:
    if isinstance(o, datetime.datetime):
        return {"$date": o.isoformat()}
    if isinstance(o, (bytes, bytearray)):
        return {"$data": base64.b64encode(o).decode("ascii")}
    if isinstance(o, dict):
        return {k: to_json(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [to_json(v) for v in o]
    return o


def from_json(o: Any) -> Any:
    if isinstance(o, dict):
        if set(o) == {"$date"}:
            return datetime.datetime.fromisoformat(o["$date"])
        if set(o) == {"$data"}:
            return base64.b64decode(o["$data"])
        return {k: from_json(v) for k, v in o.items()}
    if isinstance(o, list):
        return [from_json(v) for v in o]
    return o
