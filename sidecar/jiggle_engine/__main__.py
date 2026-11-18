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


def build_server(write=write_line) -> Server:
    server = Server(write)
    watcher: list[asyncio.Task] = []

    @server.method("ping")
    async def ping(_params):
        return {"version": __version__}

    @server.method("list_devices")
    async def list_devices(_params):
        return await devices.list_devices()

    @server.method("device_info")
    async def device_info(params):
        return await devices.device_info(udid_param(params))

    @server.method("watch")
    async def watch(_params):
        if not watcher:  # idempotent: one watcher per process
            watcher.append(asyncio.create_task(devices.watch(server.emit)))
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

    @server.method("list_apps")
    async def list_apps(params):
        async with apps.open_installation_proxy(udid_param(params)) as ip:
            return await apps.read_apps(ip)

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
