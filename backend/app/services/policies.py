"""Recuperación de políticas (RAG ligero por palabras clave, sin base vectorial)."""
import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HRPolicy


def _tokens(text: str) -> set[str]:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]+", text) if len(w) >= 3}


async def active_policies(db: AsyncSession) -> list[HRPolicy]:
    return list((await db.execute(select(HRPolicy).where(HRPolicy.is_active.is_(True)).order_by(HRPolicy.category, HRPolicy.title))).scalars())


async def search_policies(db: AsyncSession, query: str, k: int = 3) -> list[HRPolicy]:
    q = _tokens(query)
    if not q:
        return []
    scored = []
    for p in await active_policies(db):
        title_t, body_t, tag_t = _tokens(p.title), _tokens(p.content), _tokens((p.tags or "").replace(",", " "))
        score = 3 * len(q & title_t) + 3 * len(q & tag_t) + len(q & body_t)
        if score:
            scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    return [p for _, p in scored[:k]]
