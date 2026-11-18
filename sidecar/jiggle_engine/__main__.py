import asyncio
import sys
import threading

from jiggle_engine import __version__, devices
from jiggle_engine.rpc import RpcError, Server


def write_line(line: str) -> None:
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


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
        udid = params.get("udid")
        if not isinstance(udid, str) or not udid:
            raise RpcError("invalid_params", "device_info needs a 'udid' string")
        return await devices.device_info(udid)

    @server.method("watch")
    async def watch(_params):
        if not watcher:  # idempotent: one watcher per process
            watcher.append(asyncio.create_task(devices.watch(server.emit)))
        return {"watching": True}

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
