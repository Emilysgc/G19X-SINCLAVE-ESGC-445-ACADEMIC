"""Comprobación de integraciones desde la terminal.

  Con Docker:   docker compose exec backend python -m app.check
  Sin Docker:   cd backend && python -m app.check
  En CI:        python -m app.check --prepare   (crea tablas y vistas de Power BI antes de comprobar)
Sale con código 1 si falla alguna integración obligatoria (útil en CI/CD)."""
import asyncio
import sys

from app.core.cache import cache
from app.core.database import AsyncSessionLocal, engine
from app.services.integrations import check_all, has_failures

ICON = {True: "✔", False: "✘", None: "ℹ"}


async def main(prepare: bool = False) -> int:
    await cache.connect()
    try:
        if prepare:
            from app.core.database import init_db
            from app.services.bootstrap import apply_powerbi_views, ensure_defaults

            await init_db()
            async with AsyncSessionLocal() as db:
                await ensure_defaults(db)
                await db.commit()
            await apply_powerbi_views(engine)
        async with AsyncSessionLocal() as db:
            results = await check_all(db)
    finally:
        await cache.close()
        await engine.dispose()
    print("\nVerificación de integraciones\n" + "=" * 31)
    for r in results:
        print(f" {ICON[r['ok']]}  {r['name']}: {r['detail']}")
        if r["ok"] is False and r["fix"]:
            print(f"      → {r['fix']}")
    bad = has_failures(results)
    print("\n" + ("RESULTADO: faltan integraciones obligatorias." if bad else "RESULTADO: todas las integraciones obligatorias están operativas."))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(prepare="--prepare" in sys.argv)))
