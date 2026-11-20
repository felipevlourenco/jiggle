import json

from jiggle_engine.__main__ import build_server
import pytest

from jiggle_engine.apps import read_apps, uninstall_app
from jiggle_engine.rpc import RpcError


class FakeIP:
    def __init__(self, apps, sizes_fail=False):
        self.apps = apps
        self.sizes_fail = sizes_fail
        self.asked_sizes = []

    async def get_apps(self, application_type, calculate_sizes=False):
        self.asked_sizes.append(calculate_sizes)
        if calculate_sizes and self.sizes_fail:
            raise RuntimeError("the phone refused")
        return self.apps

    async def uninstall(self, bundle_id):
        self.uninstalled = getattr(self, "uninstalled", []) + [bundle_id]


async def test_read_apps_hides_internal_apps_and_flags_removable():
    ip = FakeIP(
        {
            "a.user": {"ApplicationType": "User", "CFBundleDisplayName": "User App"},
            "com.apple.news": {"ApplicationType": "System", "CFBundleName": "News", "_LSSupportsRemoval": True},
            "com.apple.mail": {"ApplicationType": "System", "CFBundleName": "Mail"},
            "com.apple.helper": {"ApplicationType": "System", "SBAppTags": ["hidden"]},
            "com.apple.internal": {"ApplicationType": "System", "LSDefaultSystemHidden": True},
            "com.apple.flagged": {"ApplicationType": "System", "SBIconVisibilityDefaultVisible": False},
            "no.name": {"ApplicationType": "User"},
        }
    )
    got = {a["bundleId"]: a for a in await read_apps(ip)}
    assert sorted(got) == ["a.user", "com.apple.mail", "com.apple.news", "no.name"]
    assert got["a.user"] == {"bundleId": "a.user", "name": "User App", "removable": True, "size": None}
    assert got["com.apple.news"]["removable"] is True
    assert got["com.apple.mail"]["removable"] is False
    assert got["no.name"]["name"] == "no.name"  # last resort: never an empty name


async def test_read_apps_reports_disk_usage_in_bytes_or_null():
    ip = FakeIP(
        {
            "both": {"ApplicationType": "User", "StaticDiskUsage": 100, "DynamicDiskUsage": 50},
            "static.only": {"ApplicationType": "User", "StaticDiskUsage": 7},
            "none": {"ApplicationType": "User"},
            "junk": {"ApplicationType": "User", "StaticDiskUsage": "lots", "DynamicDiskUsage": True},
        }
    )
    got = {a["bundleId"]: a["size"] for a in await read_apps(ip)}
    assert got == {"both": 150, "static.only": 7, "none": None, "junk": None}
    assert ip.asked_sizes == [True]


async def test_read_apps_falls_back_to_the_plain_list_when_sizes_fail():
    ip = FakeIP({"a.user": {"ApplicationType": "User"}}, sizes_fail=True)
    got = await read_apps(ip)
    assert [(a["bundleId"], a["size"]) for a in got] == [("a.user", None)]
    assert ip.asked_sizes == [True, False]


async def test_uninstall_does_not_ask_for_sizes():
    ip = FakeIP({"a.user": {"ApplicationType": "User"}})
    await uninstall_app(ip, "a.user")
    assert ip.asked_sizes == [False]


async def test_list_apps_validates_params_before_touching_a_phone():
    out = []
    server = build_server(lambda line: out.append(json.loads(line)))
    await server.handle_line('{"id": 1, "method": "list_apps"}')
    assert out[0]["error"]["code"] == "invalid_params"


async def test_uninstall_removes_a_removable_app():
    ip = FakeIP({"a.user": {"ApplicationType": "User", "CFBundleName": "A"}})
    await uninstall_app(ip, "a.user")
    assert ip.uninstalled == ["a.user"]


@pytest.mark.parametrize("bundle_id", ["com.apple.mail", "not.installed", "com.apple.helper"])
async def test_uninstall_refuses_system_unknown_and_hidden_apps(bundle_id):
    ip = FakeIP(
        {
            "com.apple.mail": {"ApplicationType": "System", "CFBundleName": "Mail"},
            "com.apple.helper": {"ApplicationType": "User", "SBAppTags": ["hidden"]},
        }
    )
    with pytest.raises(RpcError) as err:
        await uninstall_app(ip, bundle_id)
    assert err.value.code == "not_removable"
    assert not hasattr(ip, "uninstalled")


async def test_uninstall_validates_params_before_touching_a_phone():
    out = []
    server = build_server(lambda line: out.append(json.loads(line)))
    await server.handle_line('{"id": 1, "method": "uninstall", "params": {"udid": "U"}}')
    await server.handle_line('{"id": 2, "method": "uninstall", "params": {"bundle_id": "a.b"}}')
    assert [o["error"]["code"] for o in out] == ["invalid_params", "invalid_params"]
