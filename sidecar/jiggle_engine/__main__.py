import asyncio
import sys
import threading

from jiggle_engine import __version__, apps, devices, springboard
from jiggle_engine.rpc import RpcError, Server


def write_line(line: str) -> None:
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def udid_param(params: dict) -> str:
    udid = params.get("udid")
    if not isinstance(udid, str) or not udid:
        raise RpcError("invalid_params", "Needs a 'udid' string")
    return udid


def bundle_ids_param(params: dict) -> list[str]:
    ids = params.get("bundle_ids")
    if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
        raise RpcError("invalid_params", "Needs 'bundle_ids': a list of strings")
    return ids


def bundle_id_param(params: dict) -> str:
    bundle_id = params.get("bundle_id")
    if not isinstance(bundle_id, str) or not bundle_id:
        raise RpcError("invalid_params", "Needs a 'bundle_id' string")
    return bundle_id


def icon_state_param(params: dict) -> list:
    state = params.get("state")
    ok = isinstance(state, list) and all(
        isinstance(page, list) and all(isinstance(item, dict) for item in page) for page in state
    )
    if not ok or not state:
        raise RpcError("invalid_params", "Needs 'state': [dock, page 1, ...], each a list of dicts")
    return state


def build_server(write=write_line) -> Server:
    server = Server(write)
    watcher: list[tuple[bool, asyncio.Task]] = []  # (Wi-Fi on, the task)

    @server.method("ping")
    async def ping(_params):
        return {"version": __version__}

    @server.method("list_devices")
    async def list_devices(params):
        return await devices.list_devices(wifi=params.get("wifi") is True)

    @server.method("device_info")
    async def device_info(params):
        return await devices.device_info(udid_param(params))

    @server.method("watch")
    async def watch(params):
        wifi = params.get("wifi") is True
        # One watcher per process; asking again with another Wi-Fi setting swaps it.
        if watcher and watcher[0][0] != wifi:
            _, old = watcher.pop()
            old.cancel()
            await asyncio.gather(old, return_exceptions=True)  # it detaches what it knew
        if not watcher:
            watcher.append((wifi, asyncio.create_task(devices.watch(server.emit, wifi))))
        return {"watching": True}

    # The SpringBoard commands: validate the params first, then open the service and read.
    @server.method("get_icon_state")
    async def get_icon_state(params):
        async with springboard.open_springboard(udid_param(params)) as sb:
            return await springboard.read_icon_state(sb)

    @server.method("get_icon_metrics")
    async def get_icon_metrics(params):
        async with springboard.open_springboard(udid_param(params)) as sb:
            return await springboard.read_icon_metrics(sb)

    @server.method("get_icons")
    async def get_icons(params):
        udid, ids = udid_param(params), bundle_ids_param(params)
        async with springboard.open_springboard(udid) as sb:
            return await springboard.read_icons(sb, ids)

    @server.method("set_icon_state")
    async def set_icon_state(params):
        udid, state = udid_param(params), icon_state_param(params)
        async with springboard.open_springboard(udid) as sb:
            await springboard.write_icon_state(sb, state)
        return {"written": True}

    @server.method("list_apps")
    async def list_apps(params):
        async with apps.open_installation_proxy(udid_param(params)) as ip:
            return await apps.read_apps(ip)

    @server.method("uninstall")
    async def uninstall(params):
        udid, bundle_id = udid_param(params), bundle_id_param(params)
        async with apps.open_installation_proxy(udid) as ip:
            await apps.uninstall_app(ip, bundle_id)
        return {"uninstalled": True}

    return server


async def main() -> None:
    loop = asyncio.get_running_loop()
    lines: asyncio.Queue[str | None] = asyncio.Queue()

    # A daemon thread reads stdin: works for pipes and terminals, and never blocks exit.
    def read_stdin() -> None:
        for line in sys.stdin:
            loop.call_soon_threadsafe(lines.put_nowait, line)
        loop.call_soon_threadsafe(lines.put_nowait, None)

    threading.Thread(target=read_stdin, daemon=True).start()

    server = build_server()
    while (line := await lines.get()) is not None:  # None = stdin closed: the app is gone
        if line.strip():
            server.dispatch(line)
    await server.drain()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
