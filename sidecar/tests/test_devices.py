import pytest
from pymobiledevice3.exceptions import (
    PairingDialogResponsePendingError,
    PasswordRequiredError,
    UserDeniedPairingError,
)

from jiggle_engine.devices import device_info


class FakeLockdown:
    """Just enough of a lockdown client; each flag scripts one phone condition."""

    def __init__(self, *, paired=True, version="26.1", pair_error=None, service_error=None):
        self.paired = paired
        self.all_values = {"DeviceName": "Sam's iPhone", "ProductVersion": version, "DeviceClass": "iPhone"}
        self.product_type = "iPhone17,1"
        self.display_name = "iPhone 16 Pro"
        self.pair_error = pair_error
        self.service_error = service_error
        self.closed = False
        self.pair_timeouts = []

    async def pair(self, timeout=None):
        self.pair_timeouts.append(timeout)
        if self.pair_error:
            raise self.pair_error
        self.paired = True

    async def validate_pairing(self):
        return True

    async def get_service_connection_attributes(self, name):
        if self.service_error:
            raise self.service_error
        return {"Port": 1}

    async def close(self):
        self.closed = True


async def info(lockdown):
    async def connect(**_kwargs):
        return lockdown

    return await device_info("UDID-1", connect=connect)


async def test_paired_phone_is_ready_with_its_details():
    lockdown = FakeLockdown()
    assert await info(lockdown) == {
        "udid": "UDID-1",
        "name": "Sam's iPhone",
        "productType": "iPhone17,1",
        "modelName": "iPhone 16 Pro",
        "deviceClass": "iPhone",
        "osVersion": "26.1",
        "connection": "usb",
        "state": "ready",
    }
    assert lockdown.closed


@pytest.mark.parametrize(
    "lockdown_kwargs, state",
    [
        (dict(paired=False, pair_error=PairingDialogResponsePendingError()), "trust-pending"),
        (dict(paired=False, pair_error=UserDeniedPairingError()), "trust-declined"),
        (dict(paired=False, pair_error=PasswordRequiredError()), "locked"),
        (dict(service_error=PasswordRequiredError()), "locked"),
        (dict(service_error=RuntimeError("boom")), "error"),
        (dict(version="16.7"), "unsupported-os"),
        (dict(paired=False), "ready"),  # user tapped Trust: pair() succeeds
    ],
)
async def test_maps_phone_conditions_to_device_states(lockdown_kwargs, state):
    lockdown = FakeLockdown(**lockdown_kwargs)
    result = await info(lockdown)
    assert result["state"] == state
    assert result["name"] == "Sam's iPhone"  # still known when blocked
    assert lockdown.closed


async def test_pairing_never_blocks():
    lockdown = FakeLockdown(paired=False, pair_error=PairingDialogResponsePendingError())
    await info(lockdown)
    assert lockdown.pair_timeouts == [0]


async def test_unreachable_device_is_an_error_with_generic_details():
    async def connect(**_kwargs):
        raise ConnectionError("lockdownd not up")

    result = await device_info("UDID-2", connect=connect)
    assert result["state"] == "error"
    assert result["udid"] == "UDID-2" and result["name"] == "iPhone" and result["osVersion"] == ""


class FakeMux:
    def __init__(self, serial, kind):
        self.serial, self.connection_type = serial, kind
        self.is_usb, self.is_network = kind == "USB", kind == "Network"


def test_reachable_lists_wifi_phones_only_when_asked_and_prefers_the_cable():
    from jiggle_engine.devices import reachable

    mux = [FakeMux("A", "USB"), FakeMux("A", "Network"), FakeMux("B", "Network")]
    assert reachable(mux, wifi=False) == {"A": "usb"}
    assert reachable(mux, wifi=True) == {"A": "usb", "B": "wifi"}
    assert reachable(list(reversed(mux)), wifi=True) == {"A": "usb", "B": "wifi"}


async def test_describe_says_wifi_when_usbmux_reached_the_phone_through_the_network():
    from types import SimpleNamespace

    lockdown = FakeLockdown()
    assert (await info(lockdown))["connection"] == "usb"
    lockdown.service = SimpleNamespace(mux_device=FakeMux("U", "Network"))
    assert (await info(lockdown))["connection"] == "wifi"


async def test_watch_says_once_that_usbmuxd_is_missing_and_when_it_is_back(monkeypatch):
    import asyncio

    from pymobiledevice3.exceptions import ConnectionFailedToUsbmuxdError

    from jiggle_engine import devices

    class Mux:
        async def listen(self):
            pass

        async def receive_device_state_update(self):
            await asyncio.Event().wait()  # no phone ever shows up

        async def close(self):
            pass

    attempts = iter([ConnectionFailedToUsbmuxdError(), ConnectionFailedToUsbmuxdError(), Mux()])

    async def create_mux():
        result = next(attempts)
        if isinstance(result, Exception):
            raise result
        return result

    real_sleep = asyncio.sleep
    monkeypatch.setattr(devices.usbmux, "create_mux", create_mux)
    monkeypatch.setattr(devices.asyncio, "sleep", lambda _s: real_sleep(0))
    events = []
    task = asyncio.create_task(devices.watch(lambda *e: events.append(e)))
    for _ in range(20):
        await real_sleep(0)
    task.cancel()
    assert events == [("usbmux", {"available": False}), ("usbmux", {"available": True})]
