import json

from jiggle_engine.__main__ import build_server
import pytest

from jiggle_engine.apps import read_apps, uninstall_app
from jiggle_engine.rpc import RpcError


class FakeIP:
    def __init__(self, apps):
        self.apps = apps

    async def get_apps(self, application_type):
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
    assert got["a.user"] == {"bundleId": "a.user", "name": "User App", "removable": True}
    assert got["com.apple.news"]["removable"] is True
    assert got["com.apple.mail"]["removable"] is False
    assert got["no.name"]["name"] == "no.name"  # last resort: never an empty name


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
