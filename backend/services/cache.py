import asyncio
import time
from collections import OrderedDict
from typing import Any, Awaitable, Callable


class TTLCache:
    """Small in-memory cache with per-entry TTL.

    Concurrent requests for the same missing key share a single upstream call, which keeps
    us well inside the free API quotas when many people open the app at once.
    """

    def __init__(self, max_entries: int = 5000):
        self._data: "OrderedDict[str, tuple[float, Any]]" = OrderedDict()
        self._locks: dict[str, asyncio.Lock] = {}
        self._max = max_entries

    def get(self, key: str):
        item = self._data.get(key)
        if item is None:
            return None
        expires, value = item
        if expires < time.monotonic():
            self._data.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl: float):
        self._data[key] = (time.monotonic() + ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self._max:
            self._data.popitem(last=False)

    async def get_or_set(self, key: str, ttl: float, factory: Callable[[], Awaitable[Any]]):
        value = self.get(key)
        if value is not None:
            return value
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            value = self.get(key)
            if value is None:
                value = await factory()
                if value is not None:
                    self.set(key, value, ttl)
        self._locks.pop(key, None)
        return value

    def delete(self, key: str):
        self._data.pop(key, None)

    def clear(self):
        self._data.clear()


cache = TTLCache()
