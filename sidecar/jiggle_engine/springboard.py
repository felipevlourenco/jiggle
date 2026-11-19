"""Read the home screen through SpringBoard services. Every reader takes an open service,
so tests can hand it a fake; `open_springboard` is the only part that needs a phone."""
import base64
import sys
from contextlib import asynccontextmanager

from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.springboard import SpringBoardServicesService

from jiggle_engine.plistjson import from_json, to_json


@asynccontextmanager
async def open_springboard(udid: str, connect=create_using_usbmux):
    lockdown = await connect(serial=udid, autopair=False)  # USB if it is there, else Wi-Fi
    try:
        async with SpringBoardServicesService(lockdown) as sb:
            yield sb
    finally:
        await lockdown.close()


async def read_icon_state(sb) -> list:
    """[dock, page 1, page 2, ...] exactly as the phone reports it, as tagged JSON."""
    return to_json(await sb.get_icon_state())


async def read_icon_metrics(sb) -> dict:
    return await sb.get_homescreen_icon_metrics()


async def read_icons(sb, bundle_ids: list[str]) -> dict[str, str]:
    """bundle id -> base64 PNG. An app whose icon can't be read is left out."""
    icons: dict[str, str] = {}
    for bundle_id in bundle_ids:
        try:
            icons[bundle_id] = base64.b64encode(await sb.get_icon_pngdata(bundle_id)).decode("ascii")
        except Exception as e:
            print(f"icon {bundle_id}: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    return icons


async def write_icon_state(sb, state: list) -> None:
    """Write a whole home screen. `state` is the tagged JSON read_icon_state produced (dock first)."""
    await sb.set_icon_state(from_json(state))
