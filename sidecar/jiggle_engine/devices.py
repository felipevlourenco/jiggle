import asyncio
import sys
from typing import Callable

from pymobiledevice3 import usbmux

Emit = Callable[[str, dict], None]


async def list_devices() -> list[dict]:
    """USB devices only. Wi-Fi devices are opt-in later (M25)."""
    return [{"udid": d.serial} for d in await usbmux.list_devices() if d.is_usb]


def changes(known: dict[int, str], now: dict[int, str]) -> list[tuple[str, str]]:
    """Diff two {device id: udid} maps into ('device_attached' | 'device_detached', udid)."""
    out = [("device_attached", udid) for devid, udid in now.items() if devid not in known]
    out += [("device_detached", udid) for devid, udid in known.items() if devid not in now]
    return out


async def watch(emit: Emit) -> None:
    """Emit device_attached / device_detached for USB devices, forever.

    usbmuxd replays already-connected devices as attached when we start listening.
    If usbmuxd goes away we reconnect, and diff against what we knew.
    """
    known: dict[int, str] = {}
    while True:
        try:
            mux = await usbmux.create_mux()
            try:
                await mux.listen()
                while True:
                    await mux.receive_device_state_update()
                    now = {d.devid: d.serial for d in mux.devices if d.is_usb}
                    for event, udid in changes(known, now):
                        emit(event, {"udid": udid})
                    known = now
            finally:
                await mux.close()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"watch: {type(e).__name__}: {e}; retrying", file=sys.stderr, flush=True)
            for event, udid in changes(known, {}):
                emit(event, {"udid": udid})
            known = {}
            await asyncio.sleep(1)
