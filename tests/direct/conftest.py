"""Direct Mode harness for contracts/PACT.py (see support.py for what is and is
not mocked). The validator closure is exercised through
`direct_vm.run_validator()`, which replays it against a forged leader result
while the mocks stand in for the validator's own view of the web and the model.
"""
import datetime
import json
import os
import sys

import pytest

from tests.direct.support import (AMOUNT, BOND, CONSTRAINTS, CONTRACT, DEADLINE, NOW_UNIX, TERMS,
                                  TITLE, URL_INDEX, URL_REPORT, WEB_FULFILLED, definition, evidence,
                                  page, readings)


# -- Windows compatibility shim for genlayer-test 0.29.2 ----------------------
# The direct runner injects the transaction message by writing a temp file,
# dup2-ing it onto fd 0 and unlinking the path while fd 0 still holds it. POSIX
# allows that; Windows refuses with WinError 32, so every direct test would error
# at deploy on a fresh Windows checkout. The shim tolerates that one refusal and
# is a no-op elsewhere, so CI runs the runner exactly as published.
def _tolerate_windows_unlink():
    if os.name != "nt":
        return
    try:
        from gltest.direct import loader as _loader
    except ImportError:
        return
    original = _loader._inject_message_to_fd0
    if getattr(original, "_pact_shim", False):
        return

    def inject_tolerant(vm):
        real_unlink = os.unlink

        def unlink_tolerant(path, *args, **kwargs):
            try:
                real_unlink(path, *args, **kwargs)
            except PermissionError:
                pass
        os.unlink = unlink_tolerant
        try:
            return original(vm)
        finally:
            os.unlink = real_unlink

    inject_tolerant._pact_shim = True
    _loader._inject_message_to_fd0 = inject_tolerant


_tolerate_windows_unlink()


# -- warp() must move the transaction clock -----------------------------------
# PACT measures every window against gl.message_raw["datetime"], the
# transaction's own time. direct_vm.warp() moves the block timestamp; this keeps
# the message clock in step so a test can cross a deadline.
def _warp_moves_the_message_clock():
    try:
        from gltest.direct.vm import VMContext
    except ImportError:
        return
    original = VMContext.warp
    if getattr(original, "_pact_shim", False):
        return

    def warp(self, timestamp: str) -> None:
        original(self, timestamp)
        gl = sys.modules.get("genlayer.gl")
        if gl is not None and getattr(gl, "message_raw", None) is not None:
            gl.message_raw["datetime"] = timestamp

    warp._pact_shim = True
    VMContext.warp = warp


_warp_moves_the_message_clock()


def iso(unix_seconds: int) -> str:
    return datetime.datetime.fromtimestamp(
        int(unix_seconds), tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def warp_to(direct_vm, unix_seconds: int) -> None:
    direct_vm.warp(iso(unix_seconds))


def hex_of(account) -> str:
    raw = account.as_bytes if hasattr(account, "as_bytes") else bytes(account)
    return "0x" + raw.hex()


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def pact(direct_vm, direct_deploy):
    direct_vm.check_pickling = True
    warp_to(direct_vm, NOW_UNIX)
    return direct_deploy(str(CONTRACT))


@pytest.fixture
def mod(pact):
    """The loaded contract module, so the pure helpers can be tested directly."""
    for name, module in sys.modules.items():
        if name.endswith("PACT") and hasattr(module, "_derive_result"):
            return module
    raise AssertionError("the contract module is not loaded")


@pytest.fixture
def creator(direct_alice):
    return direct_alice


@pytest.fixture
def agent(direct_bob):
    return direct_bob


@pytest.fixture
def stranger(direct_charlie):
    return direct_charlie


# ── acts ─────────────────────────────────────────────────────────────────────

def mock_round(direct_vm, reading=None, web=None) -> None:
    """Register what the sources serve and what a model reader answers for each
    constraint. Mocks are first-registered-wins, so clear first."""
    direct_vm.clear_mocks()
    for url, (status, body) in (web if web is not None else WEB_FULFILLED).items():
        direct_vm.mock_web("^" + url.replace("?", r"\?") + "$",
                           {"response": {"status": status, "headers": {}, "body": page(body)}})
    if reading is not None:
        for pattern, body in readings(reading):
            direct_vm.mock_llm(pattern, body)


def create(pact, direct_vm, signer, counterparty, title=TITLE, terms=TERMS) -> str:
    direct_vm.sender = signer
    return pact.create_agreement(title, terms, hex_of(counterparty))


def lock(pact, direct_vm, signer, aid, **over) -> str:
    direct_vm.sender = signer
    return pact.lock_agreement(aid, definition(**over))


def fund(pact, direct_vm, signer, aid, value) -> str:
    direct_vm.sender = signer
    direct_vm.value = value
    try:
        return pact.fund_agreement(aid)
    finally:
        direct_vm.value = 0


def submit(pact, direct_vm, signer, aid, **over) -> str:
    direct_vm.sender = signer
    return pact.submit_evidence(aid, evidence(**over))


def adjudicate(direct_vm, pact, signer, aid, reading=None, web=None, at=None) -> str:
    if at is not None:
        warp_to(direct_vm, at)
    mock_round(direct_vm, reading, web)
    direct_vm.sender = signer
    return pact.request_adjudication(aid)


def finalize(direct_vm, pact, signer, aid, at=None):
    record = pact.get_verdict(aid, pact.get_agreement(aid)["round_count"] - 1)
    warp_to(direct_vm, at if at is not None else int(record["proposed_at"]) + 300)
    direct_vm.sender = signer
    pact.finalize_verdict(aid)


def in_force(pact, direct_vm, creator, agent, **over):
    """A locked, funded agreement with the report and the index registered."""
    aid = create(pact, direct_vm, creator, agent)
    lock(pact, direct_vm, creator, aid, **over)
    a = pact.get_agreement(aid)
    if a["economic"]:
        if int(a["amount_required"]):
            fund(pact, direct_vm, creator, aid, int(a["amount_required"]))
        if int(a["bond_required"]):
            fund(pact, direct_vm, agent, aid, int(a["bond_required"]))
    submit(pact, direct_vm, agent, aid, source=URL_REPORT,
           constraints=("C1", "C2", "C3", "C4", "C5", "C6"), label="the delivered report")
    submit(pact, direct_vm, creator, aid, source=URL_INDEX,
           constraints=("C1", "C2", "C3", "C4"), label="independent index")
    return aid


def latest_verdict(pact, aid) -> dict:
    return pact.get_verdict(aid, pact.get_agreement(aid)["round_count"] - 1)


def findings_by_id(verdict: dict) -> dict:
    return {f["id"]: f for f in verdict["findings"]}


def transfers_to(sent, address) -> int:
    return sum(v for a, v in sent if a.lower() == address.lower())


@pytest.fixture
def transfers(monkeypatch):
    """Every GEN transfer the contract emits, as (recipient_hex, atto)."""
    from gltest.direct import wasi_mock
    sent = []
    original = wasi_mock._handle_gl_call

    def recording(vm, request):
        if isinstance(request, dict) and "EthSend" in request:
            op = request["EthSend"]
            addr = op["address"]
            raw = addr.as_bytes if hasattr(addr, "as_bytes") else bytes(addr)
            sent.append(("0x" + raw.hex(), int(op["value"])))
        return original(vm, request)

    monkeypatch.setattr(wasi_mock, "_handle_gl_call", recording)
    return sent
