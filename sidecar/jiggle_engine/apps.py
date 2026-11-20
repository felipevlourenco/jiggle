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


def disk_usage(app: dict) -> int | None:
    """Bytes the app takes: the app itself plus its data. None when the phone doesn't say."""
    parts = [app.get("StaticDiskUsage"), app.get("DynamicDiskUsage")]
    known = [p for p in parts if isinstance(p, int) and not isinstance(p, bool)]
    return sum(known) if known else None


async def read_apps(ip, with_sizes: bool = True) -> list[dict]:
    """[{bundleId, name, removable, size}] for every app a person can see. `size` is in bytes, or null."""
    apps = None
    if with_sizes:
        try:
            apps = await ip.get_apps("Any", calculate_sizes=True)
        except Exception:  # the size lookup is a bonus: without it the list is still the list
            pass
    if apps is None:
        apps = await ip.get_apps("Any")
    return [
        {
            "bundleId": bundle_id,
            "name": app.get("CFBundleDisplayName") or app.get("CFBundleName") or bundle_id,
            "removable": app.get("ApplicationType") == "User" or bool(app.get("_LSSupportsRemoval")),
            "size": disk_usage(app),
        }
        for bundle_id, app in apps.items()
        if is_visible(app)
    ]


async def uninstall_app(ip, bundle_id: str) -> None:
    """Delete one app and its data. Refuses anything the phone doesn't list as removable, so a bad call
    can't take out a system app."""
    removable = {a["bundleId"] for a in await read_apps(ip, with_sizes=False) if a["removable"]}
    if bundle_id not in removable:
        raise RpcError("not_removable", f"{bundle_id} can't be removed")
    await ip.uninstall(bundle_id)
