import json

from jiggle_engine.__main__ import build_server
from jiggle_engine.apps import read_apps


class FakeIP:
    def __init__(self, apps):
        self.apps = apps

    async def get_apps(self, application_type):
        return self.apps


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
