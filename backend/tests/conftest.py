"""Fixtures. Por defecto usa SQLite temporal y caché en memoria; en CI se apunta a PostgreSQL y Redis reales:
   TEST_DATABASE_URL=postgresql+asyncpg://... TEST_REDIS_URL=redis://localhost:6379/1 pytest"""
import os
import tempfile
from datetime import date, timedelta

_tmp = tempfile.mkdtemp(prefix="hr-tests-")
os.environ["ENVIRONMENT"] = "testing"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{_tmp}/test.db"
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "")
os.environ["SECRET_KEY"] = "test-secret-key-for-automated-tests-only-0123456789"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["AUTH_MODE"] = "both"
os.environ["REQUIRE_INTEGRATIONS"] = "false"
for k in ("GROQ_API_KEY", "OLLAMA_BASE_URL", "OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_JWKS_URL", "SETUP_TOKEN", "FIRST_ADMIN_EMAIL", "POWERBI_DB_PASSWORD"):
    os.environ[k] = ""

import httpx  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.config import get_settings  # noqa: E402
get_settings.cache_clear()
from app.core.cache import cache  # noqa: E402
from app.core.database import engine  # noqa: E402
from app.main import app  # noqa: E402

PWD = "Test-password-123"


def next_monday(weeks_ahead: int) -> date:
    d = date.today() + timedelta(days=14 + 7 * weeks_ahead)
    return d - timedelta(days=d.weekday())


class Api:
    def __init__(self, client: httpx.AsyncClient):
        self.c = client
        self.tokens: dict[str, str] = {}
        self.users: dict[str, dict] = {}
        self._week = 0

    def window(self, days: int = 3) -> tuple[str, str]:
        """Ventana de fechas (lunes→) que nunca se traslapa con otra pedida antes, sin importar su duración."""
        start = next_monday(self._week)
        self._week += max(1, (days + 6) // 7)
        return start.isoformat(), (start + timedelta(days=days - 1)).isoformat()

    async def login(self, email: str, password: str = PWD) -> str:
        r = await self.c.post("/api/v1/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return r.json()["access_token"]

    def h(self, who: str) -> dict:
        return {"Authorization": f"Bearer {self.tokens[who]}"}

    async def get(self, who, url, **kw):
        return await self.c.get(url, headers=self.h(who), **kw)

    async def post(self, who, url, **kw):
        return await self.c.post(url, headers=self.h(who), **kw)

    async def patch(self, who, url, **kw):
        return await self.c.patch(url, headers=self.h(who), **kw)

    async def request(self, who, rtype, start=None, end=None, description=None, data=None):
        body = {"type": rtype, "start_date": start, "end_date": end, "description": description, "request_data": data or {}}
        return await self.post(who, "/api/v1/requests", json=body)


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def api():
    if os.environ.get("REDIS_URL"):  # contadores/revocaciones de corridas anteriores no deben contaminar
        import redis.asyncio as aioredis

        r0 = aioredis.from_url(os.environ["REDIS_URL"])
        await r0.flushdb()
        await r0.aclose()
    async with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            a = Api(client)
            r = await client.post("/api/v1/auth/setup", json={"email": "admin@pruebas-rh.com", "full_name": "Admin Pruebas", "password": PWD})
            assert r.status_code == 200, r.text
            a.tokens["admin"] = r.json()["access_token"]
            d1 = (await a.post("admin", "/api/v1/users/departments", json={"name": "Tecnología", "code": "ti"})).json()
            d2 = (await a.post("admin", "/api/v1/users/departments", json={"name": "Recursos Humanos", "code": "rh"})).json()

            async def mk(key, role, name, dept, sup=None, hire="2020-01-15", salary=30000):
                body = {"email": f"{key}@pruebas-rh.com", "full_name": name, "role": role, "password": PWD, "department_id": dept["id"],
                        "job_title": f"Puesto {key}", "hire_date": hire, "salary": salary}
                if sup:
                    body["direct_supervisor_id"] = sup["id"]
                r = await a.post("admin", "/api/v1/users", json=body)
                assert r.status_code == 201, r.text
                a.users[key] = r.json()
                a.tokens[key] = await a.login(f"{key}@pruebas-rh.com")

            await mk("hr", "HR_ADMIN", "Rita Recursos", d2)
            await mk("mgr", "MANAGER", "Mario Gerente", d1)
            await mk("emp1", "EMPLOYEE", "Elena Uno", d1, a.users["mgr"])
            await mk("emp2", "EMPLOYEE", "Ernesto Dos", d1, a.users["mgr"])
            await mk("emp3", "EMPLOYEE", "Eva <b>Tres</b>", d1, a.users["mgr"], hire=(date.today() - timedelta(days=90)).isoformat())
            await mk("solo", "EMPLOYEE", "Sara Sola", d2)  # sin supervisor → va directo a RRHH
            yield a
    await cache.close()
