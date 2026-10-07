"""Redis: caché, rate limiting, revocación de tokens y locks distribuidos.
Si Redis no está disponible, degrada a memoria de proceso (un solo worker) y lo registra en el log."""
import json
import logging
import time
from typing import Any, Optional

from app.core.config import get_settings

logger = logging.getLogger("hr.cache")


class Cache:
    def __init__(self) -> None:
        self._redis = None
        self._mem: dict[str, tuple[Any, Optional[float]]] = {}

    async def connect(self) -> None:
        url = get_settings().REDIS_URL
        if not url:
            logger.warning("REDIS_URL vacío: usando caché en memoria.")
            return
        try:
            import redis.asyncio as aioredis

            client = aioredis.from_url(url, decode_responses=True, socket_connect_timeout=3)
            await client.ping()
            self._redis = client
            logger.info("Redis conectado.")
        except Exception as exc:  # noqa: BLE001
            self._redis = None
            logger.warning("Redis no disponible (%s): usando caché en memoria.", exc)

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None

    @property
    def backend(self) -> str:
        return "redis" if self._redis is not None else "memory"

    def _mem_get(self, key: str) -> Any:
        item = self._mem.get(key)
        if not item:
            return None
        value, exp = item
        if exp is not None and exp < time.monotonic():
            self._mem.pop(key, None)
            return None
        return value

    def _mem_set(self, key: str, value: Any, ttl: Optional[int]) -> None:
        self._mem[key] = (value, time.monotonic() + ttl if ttl else None)

    async def get_json(self, key: str) -> Any:
        if self._redis is not None:
            raw = await self._redis.get(key)
            return json.loads(raw) if raw else None
        return self._mem_get(key)

    async def set_json(self, key: str, value: Any, ttl: int = 60) -> None:
        if self._redis is not None:
            await self._redis.set(key, json.dumps(value, default=str), ex=ttl)
        else:
            self._mem_set(key, value, ttl)

    async def delete_prefix(self, prefix: str) -> None:
        if self._redis is not None:
            async for k in self._redis.scan_iter(match=f"{prefix}*"):
                await self._redis.delete(k)
        else:
            for k in [k for k in self._mem if k.startswith(prefix)]:
                self._mem.pop(k, None)

    async def set_flag(self, key: str, ttl: int) -> None:
        await self.set_json(key, 1, ttl)

    async def has_flag(self, key: str) -> bool:
        return await self.get_json(key) is not None

    async def hit(self, key: str, window: int) -> int:
        """Incrementa un contador con ventana fija y devuelve el total (rate limiting)."""
        if self._redis is not None:
            pipe = self._redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, window, nx=True)
            count, _ = await pipe.execute()
            return int(count)
        current = self._mem_get(key)
        if current is None:
            self._mem_set(key, 1, window)
            return 1
        exp = self._mem[key][1]
        self._mem[key] = (current + 1, exp)
        return current + 1

    async def acquire_lock(self, key: str, ttl: int) -> bool:
        if self._redis is not None:
            return bool(await self._redis.set(key, "1", nx=True, ex=ttl))
        if self._mem_get(key) is not None:
            return False
        self._mem_set(key, 1, ttl)
        return True


cache = Cache()


async def rate_limit(key: str, limit: int, window: int) -> None:
    """Lanza 429 si se excede el límite."""
    from fastapi import HTTPException

    if await cache.hit(f"rl:{key}", window) > limit:
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes. Intente de nuevo en un momento.")
