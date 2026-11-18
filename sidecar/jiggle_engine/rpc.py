"""Newline-delimited JSON-RPC over stdio.

    request   {"id": 1, "method": "ping", "params": {}}
    response  {"id": 1, "result": ...}  or  {"id": 1, "error": {"code": "...", "message": "..."}}
    event     {"event": "device_attached", "data": {...}}   (no id, pushed by the engine)

stdout carries only these lines. Logs go to stderr.
"""
import asyncio
import json
from typing import Any, Awaitable, Callable

Handler = Callable[[dict], Awaitable[Any]]


class RpcError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def encode_response(id: Any, result: Any) -> str:
    return json.dumps({"id": id, "result": result})


def encode_error(id: Any, code: str, message: str) -> str:
    return json.dumps({"id": id, "error": {"code": code, "message": message}})


def encode_event(event: str, data: Any) -> str:
    return json.dumps({"event": event, "data": data})


def decode_request(line: str) -> tuple[Any, str, dict]:
    """Returns (id, method, params). Raises RpcError for anything malformed."""
    try:
        msg = json.loads(line)
    except ValueError:
        raise RpcError("parse_error", "Request is not valid JSON")
    if not isinstance(msg, dict) or not isinstance(msg.get("method"), str):
        raise RpcError("invalid_request", "Request needs a string 'method'")
    params = msg.get("params", {})
    if not isinstance(params, dict):
        raise RpcError("invalid_request", "'params' must be an object")
    return msg.get("id"), msg["method"], params


class Server:
    def __init__(self, write: Callable[[str], None]):
        self._write = write
        self._handlers: dict[str, Handler] = {}
        self._tasks: set[asyncio.Task] = set()

    def method(self, name: str) -> Callable[[Handler], Handler]:
        def register(fn: Handler) -> Handler:
            self._handlers[name] = fn
            return fn

        return register

    def emit(self, event: str, data: Any) -> None:
        self._write(encode_event(event, data))

    async def handle_line(self, line: str) -> None:
        id: Any = None
        try:
            id, method, params = decode_request(line)
            handler = self._handlers.get(method)
            if handler is None:
                raise RpcError("method_not_found", f"Unknown method: {method}")
            self._write(encode_response(id, await handler(params)))
        except RpcError as e:
            self._write(encode_error(id, e.code, e.message))
        except Exception as e:  # a handler bug must not kill the engine
            self._write(encode_error(id, "internal", f"{type(e).__name__}: {e}"))

    def dispatch(self, line: str) -> None:
        """Handle a request without blocking the read loop."""
        task = asyncio.create_task(self.handle_line(line))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def drain(self) -> None:
        """Wait for in-flight requests, e.g. before exiting after stdin closed."""
        await asyncio.gather(*self._tasks)
