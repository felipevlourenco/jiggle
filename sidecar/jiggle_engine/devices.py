import asyncio
import sys
from typing import Callable

from pymobiledevice3 import usbmux
from pymobiledevice3.exceptions import (
    PairingDialogResponsePendingError,
    PasswordRequiredError,
    UserDeniedPairingError,
)
from pymobiledevice3.lockdown import create_using_usbmux

Emit = Callable[[str, dict], None]

SPRINGBOARD = "com.apple.springboardservices"
MIN_SUPPORTED_MAJOR = 17


async def list_devices() -> list[dict]:
    """USB devices only. Wi-Fi devices are opt-in later (M25)."""
    return [{"udid": d.serial} for d in await usbmux.list_devices() if d.is_usb]


def describe(udid: str, lockdown=None) -> dict:
    """The Device fields we can read. Without a lockdown client they fall back to generic values."""
    values = lockdown.all_values if lockdown else {}
    product = (lockdown.product_type if lockdown else None) or ""
    return {
        "udid": udid,
        "name": values.get("DeviceName") or "iPhone",
        "productType": product,
        "modelName": (lockdown.display_name if lockdown else None) or product or "iPhone",
        "deviceClass": "iPad" if values.get("DeviceClass") == "iPad" else "iPhone",
        "osVersion": values.get("ProductVersion") or "",
        "connection": "usb",
    }


def os_major(version: str) -> int:
    try:
        return int(version.split(".")[0])
    except ValueError:
        return 0


async def probe(lockdown) -> str:
    """One non-blocking attempt to get a trusted, usable device. Returns a DeviceState.

    Pairing is requested with timeout=0, which raises at once while the Trust dialog is
    still showing on the phone, so the caller can poll instead of hanging.
    """
    try:
        if not lockdown.paired:
            await lockdown.pair(timeout=0)  # this is what shows the Trust dialog
            if not await lockdown.validate_pairing():
                return "error"
        # A locked phone refuses to start SpringBoard services: that is our lock test.
        await lockdown.get_service_connection_attributes(SPRINGBOARD)
    except PairingDialogResponsePendingError:
        return "trust-pending"
    except UserDeniedPairingError:
        return "trust-declined"
    except PasswordRequiredError:
        return "locked"
    return "ready"


async def device_info(udid: str, connect=create_using_usbmux) -> dict:
    """Describe one USB device and say whether it is usable. Stateless: call it again to re-check."""
    lockdown = None
    try:
        lockdown = await connect(serial=udid, autopair=False, connection_type="USB")
        state = await probe(lockdown)
        if state == "ready" and os_major(describe(udid, lockdown)["osVersion"]) < MIN_SUPPORTED_MAJOR:
            state = "unsupported-os"
        return {**describe(udid, lockdown), "state": state}
    except PasswordRequiredError:
        return {**describe(udid, lockdown), "state": "locked"}
    except Exception as e:  # lockdownd not up yet, device busy, unexpected reply...
        print(f"device_info({udid}): {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        return {**describe(udid, lockdown), "state": "error"}
    finally:
        if lockdown:
            await lockdown.close()


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
