"""List the apps installed on the phone through the installation proxy."""
from contextlib import asynccontextmanager

from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.installation_proxy import InstallationProxyService


@asynccontextmanager
async def open_installation_proxy(udid: str, connect=create_using_usbmux):
    lockdown = await connect(serial=udid, autopair=False, connection_type="USB")
    try:
        async with InstallationProxyService(lockdown) as ip:
            yield ip
    finally:
        await lockdown.close()


def is_visible(app: dict) -> bool:
    """The phone lists ~300 apps; most system ones are internal helpers a person never sees."""
    tags = (app.get("SBAppTags") or []) + (app.get("SBAppTags~iphone") or [])
    return not (
        "hidden" in tags
        or app.get("LSDefaultSystemHidden")
        or app.get("SBIconVisibilityDefaultVisible") is False
        or app.get("IsPlaceholder")
    )


async def read_apps(ip) -> list[dict]:
    """[{bundleId, name, removable}] for every app a person can see."""
    apps = await ip.get_apps("Any")
    return [
        {
            "bundleId": bundle_id,
            "name": app.get("CFBundleDisplayName") or app.get("CFBundleName") or bundle_id,
            "removable": app.get("ApplicationType") == "User" or bool(app.get("_LSSupportsRemoval")),
        }
        for bundle_id, app in apps.items()
        if is_visible(app)
    ]
