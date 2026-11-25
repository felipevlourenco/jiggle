import asyncio
import sys
from typing import Callable

from pymobiledevice3 import usbmux
from pymobiledevice3.exceptions import (
    ConnectionFailedToUsbmuxdError,
    PairingDialogResponsePendingError,
    PasswordRequiredError,
    UserDeniedPairingError,
)
from pymobiledevice3.lockdown import create_using_usbmux

Emit = Callable[[str, dict], None]

SPRINGBOARD = "com.apple.springboardservices"
MIN_SUPPORTED_MAJOR = 17


def reachable(mux_devices, wifi: bool) -> dict[str, str]:
    """{udid: 'usb' | 'wifi'}. A phone on both counts as USB. Wi-Fi ones only show when `wifi` is on."""
    found: dict[str, str] = {}
    for d in mux_devices:
        if d.is_usb:
            found[d.serial] = "usb"
        elif wifi and d.is_network:
            found.setdefault(d.serial, "wifi")
    return found


async def list_devices(wifi: bool = False) -> list[dict]:
    """USB devices, plus the ones reachable over Wi-Fi when that is switched on."""
    found = reachable(await usbmux.list_devices(), wifi)
    return [{"udid": udid, "connection": connection} for udid, connection in found.items()]


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
        # Over the cable unless usbmux reached it through the network (the engine asks for either).
        "connection": "wifi" if getattr(getattr(lockdown, "service", None), "mux_device", None) is not None
        and lockdown.service.mux_device.is_network else "usb",
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
        lockdown = await connect(serial=udid, autopair=False)  # USB if it is there, else Wi-Fi
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


def changes(known: dict[str, str], now: dict[str, str]) -> list[tuple[str, str]]:
    """Diff two {udid: 'usb' | 'wifi'} maps into ('device_attached' | 'device_detached', udid).
    A phone whose connection changed (cable pulled, Wi-Fi left) is attached again, so it is read afresh."""
    out = [("device_attached", udid) for udid, connection in now.items() if known.get(udid) != connection]
    out += [("device_detached", udid) for udid in known if udid not in now]
    return out


async def watch(emit: Emit, wifi: bool = False) -> None:
    """Emit device_attached / device_detached for USB devices (and Wi-Fi ones when `wifi`), forever.

    usbmuxd replays already-connected devices as attached when we start listening.
    If usbmuxd goes away we reconnect, and diff against what we knew. When cancelled (the Wi-Fi switch
    changed) everything known is detached first, so the next watcher starts from nothing.

    It also emits usbmux {available: false} when there is no usbmuxd to talk to (on Windows: Apple's driver is
    missing or not running), and {available: true} once it answers again.
    """
    known: dict[str, str] = {}
    available = True
    while True:
        try:
            mux = await usbmux.create_mux()
            try:
                await mux.listen()
                if not available:
                    available = True
                    emit("usbmux", {"available": True})
                while True:
                    await mux.receive_device_state_update()
                    now = reachable(mux.devices, wifi)
                    for event, udid in changes(known, now):
                        emit(event, {"udid": udid})
                    known = now
            finally:
                await mux.close()
        except asyncio.CancelledError:
            for event, udid in changes(known, {}):
                emit(event, {"udid": udid})
            raise
        except Exception as e:
            missing = isinstance(e, ConnectionFailedToUsbmuxdError)
            if available or not missing:  # a missing service is logged once, not on every retry
                print(f"watch: {type(e).__name__}: {e}; retrying", file=sys.stderr, flush=True)
            if missing and available:
                available = False
                emit("usbmux", {"available": False})
            for event, udid in changes(known, {}):
                emit(event, {"udid": udid})
            known = {}
            await asyncio.sleep(1)
