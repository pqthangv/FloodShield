from typing import Optional
import httpx
from config import user_agent

_client: Optional[httpx.AsyncClient] = None


def get_client() -> httpx.AsyncClient:
    """Shared HTTP client for calls to external data providers."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, connect=10.0),
            headers={"User-Agent": user_agent()},
            follow_redirects=True,
        )
    return _client


async def close_client():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
