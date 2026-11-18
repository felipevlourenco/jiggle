import json
import subprocess
import sys
from pathlib import Path

import pytest

from jiggle_engine import __version__
from jiggle_engine.devices import changes
from jiggle_engine.rpc import RpcError, Server, decode_request

ROOT = Path(__file__).resolve().parent.parent


def test_decode_valid_request():
    assert decode_request('{"id": 7, "method": "ping"}') == (7, "ping", {})
    assert decode_request('{"id": 1, "method": "x", "params": {"a": 1}}') == (1, "x", {"a": 1})


@pytest.mark.parametrize(
    "line, code",
    [
        ("not json", "parse_error"),
        ("[]", "invalid_request"),
        ('{"id": 1}', "invalid_request"),
        ('{"id": 1, "method": 5}', "invalid_request"),
        ('{"id": 1, "method": "x", "params": []}', "invalid_request"),
    ],
)
def test_decode_rejects_malformed(line, code):
    with pytest.raises(RpcError) as e:
        decode_request(line)
    assert e.value.code == code


def make_server():
    out: list[dict] = []
    server = Server(lambda line: out.append(json.loads(line)))

    @server.method("echo")
    async def echo(params):
        return params

    @server.method("fail")
    async def fail(_params):
        raise RpcError("nope", "denied")

    @server.method("boom")
    async def boom(_params):
        raise ValueError("bug")

    return server, out


async def test_response_error_and_event_framing():
    server, out = make_server()
    await server.handle_line('{"id": 1, "method": "echo", "params": {"a": 1}}')
    await server.handle_line('{"id": 2, "method": "fail"}')
    await server.handle_line('{"id": 3, "method": "boom"}')
    await server.handle_line('{"id": 4, "method": "missing"}')
    await server.handle_line("garbage")
    server.emit("device_attached", {"udid": "U1"})

    assert out[0] == {"id": 1, "result": {"a": 1}}
    assert out[1] == {"id": 2, "error": {"code": "nope", "message": "denied"}}
    assert out[2]["error"]["code"] == "internal" and "bug" in out[2]["error"]["message"]
    assert out[3]["error"]["code"] == "method_not_found"
    assert out[4] == {"id": None, "error": {"code": "parse_error", "message": "Request is not valid JSON"}}
    assert out[5] == {"event": "device_attached", "data": {"udid": "U1"}}


def test_changes_diff():
    assert changes({}, {1: "A"}) == [("device_attached", "A")]
    assert changes({1: "A"}, {1: "A"}) == []
    assert changes({1: "A"}, {}) == [("device_detached", "A")]
    assert sorted(changes({1: "A"}, {2: "B"})) == [("device_attached", "B"), ("device_detached", "A")]


def test_engine_answers_ping_over_stdio():
    """The manual check, automated: run the real engine and ping it."""
    p = subprocess.run(
        [sys.executable, "-m", "jiggle_engine"],
        input='{"id":1,"method":"ping"}\n',
        capture_output=True,
        text=True,
        timeout=20,
        cwd=ROOT,
    )
    assert json.loads(p.stdout.splitlines()[0]) == {"id": 1, "result": {"version": __version__}}


def test_engine_answers_every_request_before_exiting_on_eof():
    p = subprocess.run(
        [sys.executable, "-m", "jiggle_engine"],
        input='{"id":1,"method":"ping"}\n{"id":2,"method":"list_devices"}\n',
        capture_output=True,
        text=True,
        timeout=20,
        cwd=ROOT,
    )
    ids = sorted(json.loads(line)["id"] for line in p.stdout.splitlines())
    assert ids == [1, 2]
