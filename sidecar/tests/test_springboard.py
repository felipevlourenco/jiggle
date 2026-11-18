import base64
import datetime
import json
import plistlib

from jiggle_engine.__main__ import build_server
from jiggle_engine.plistjson import from_json, to_json
from jiggle_engine.springboard import read_icon_state, read_icons, write_icon_state


def test_plist_json_round_trip_keeps_dates_and_data():
    state = [
        [{"bundleIdentifier": "a.b", "iconModDate": datetime.datetime(2026, 11, 16, 13, 26, 56)}],
        [{"listType": "folder", "iconLists": [[{"blob": b"\x00\x01\xff", "n": 3, "ok": True}]]}],
    ]
    wire = json.loads(json.dumps(to_json(state)))  # what actually crosses stdio
    assert wire[0][0]["iconModDate"] == {"$date": "2026-11-16T13:26:56"}
    assert from_json(wire) == state
    # and the phone would get back byte-identical plist data
    assert plistlib.dumps(from_json(wire)) == plistlib.dumps(state)


class FakeSB:
    def __init__(self, icons=None, state=None):
        self.icons, self.state = icons or {}, state or []

    async def get_icon_state(self):
        return self.state

    async def set_icon_state(self, state):
        self.written = state

    async def get_icon_pngdata(self, bundle_id):
        if bundle_id not in self.icons:
            raise RuntimeError("no such app")
        return self.icons[bundle_id]


async def test_read_icon_state_is_json_safe():
    sb = FakeSB(state=[[{"d": datetime.datetime(2026, 1, 1)}]])
    json.dumps(await read_icon_state(sb))


async def test_read_icons_skips_unreadable_apps():
    sb = FakeSB(icons={"a.b": b"PNG-A", "c.d": b"PNG-C"})
    got = await read_icons(sb, ["a.b", "missing", "c.d"])
    assert {k: base64.b64decode(v) for k, v in got.items()} == {"a.b": b"PNG-A", "c.d": b"PNG-C"}


async def test_springboard_commands_validate_params_before_touching_a_phone():
    out = []
    server = build_server(lambda line: out.append(json.loads(line)))
    await server.handle_line('{"id": 1, "method": "get_icon_state"}')
    await server.handle_line('{"id": 2, "method": "get_icons", "params": {"udid": "U"}}')
    await server.handle_line('{"id": 3, "method": "get_icons", "params": {"udid": "U", "bundle_ids": [1]}}')
    assert [m["error"]["code"] for m in out] == ["invalid_params"] * 3


async def test_write_icon_state_sends_exactly_what_was_read():
    state = [[{"d": datetime.datetime(2026, 1, 1), "blob": b"\x00\x01"}], [{"bundleIdentifier": "a.b"}]]
    sb = FakeSB(state=state)
    await write_icon_state(sb, await read_icon_state(sb))
    assert plistlib.dumps(sb.written) == plistlib.dumps(state)  # dates and bytes survive the JSON trip


async def test_set_icon_state_validates_its_params_before_touching_a_phone():
    out = []
    server = build_server(lambda line: out.append(json.loads(line)))
    for params in (
        '{"udid": "U"}',
        '{"udid": "U", "state": []}',
        '{"udid": "U", "state": [1]}',
        '{"udid": "U", "state": [[1]]}',
        '{"state": [[{}]]}',
    ):
        await server.handle_line('{"id": 1, "method": "set_icon_state", "params": %s}' % params)
    assert [m["error"]["code"] for m in out] == ["invalid_params"] * 5
