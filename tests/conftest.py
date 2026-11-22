"""Pytest configuration for fast sandbox-safe asyncio loop execution on Windows."""
from __future__ import annotations

import asyncio
import os
import selectors

os.environ["CRUCIBLE_OFFLINE_MODE"] = "1"


class _DummySelector(selectors.BaseSelector):
    def register(self, fileobj, events, data=None):
        return selectors.SelectorKey(fileobj, 0, events, data)

    def unregister(self, fileobj):
        pass

    def select(self, timeout=None):
        return []

    def get_map(self):
        return {}


class _SandboxSafeSelectorLoop(asyncio.SelectorEventLoop):
    """SelectorEventLoop that avoids blocking loopback socketpair() in restricted Windows sandboxes."""

    def __init__(self) -> None:
        super().__init__(selector=_DummySelector())

    def _make_self_pipe(self) -> None:
        self._ssock = None
        self._csock = None
        self._internal_fds += 1

    def _close_self_pipe(self) -> None:
        self._internal_fds -= 1

    def _write_to_self(self) -> None:
        pass
