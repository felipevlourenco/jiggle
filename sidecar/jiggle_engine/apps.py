"""List and uninstall the apps installed on the phone through the installation proxy."""
from contextlib import asynccontextmanager

from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.installation_proxy import InstallationProxyService

from jiggle_engine.rpc import RpcError


@asynccontextmanager
async def open_installation_proxy(udid: str, connect=create_using_usbmux):
    lockdown = await connect(serial=udid, autopair=False)  # USB if it is there, else Wi-Fi
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


async def uninstall_app(ip, bundle_id: str) -> None:
    """Delete one app and its data. Refuses anything the phone doesn't list as removable, so a bad call
    can't take out a system app."""
    removable = {a["bundleId"] for a in await read_apps(ip) if a["removable"]}
    if bundle_id not in removable:
        raise RpcError("not_removable", f"{bundle_id} can't be removed")
    await ip.uninstall(bundle_id)
