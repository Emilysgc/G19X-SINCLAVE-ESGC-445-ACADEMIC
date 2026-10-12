"""Pruebas del comportamiento del asistente conversacional de RRHH:
- Bloques del system prompt: ALCANCE, FUERA DE ALCANCE, REGLAS, EJEMPLOS, FECHA ACTUAL.
- Inyección de fecha y hora actuales en Ciudad de México.
- Respuestas cortas en una sola línea para consultas simples.
- Rechazo fijo ante preguntas fuera de alcance o jailbreaks.
- Selección de proveedor de IA (Groq vs Ollama).
"""
import json
from types import SimpleNamespace

import pytest

from app.core.config import get_settings
from app.services.ai_agent import Provider, _format_now_mexico, get_agent

pytestmark = pytest.mark.asyncio(loop_scope="session")
V = "/api/v1"


class FakeCompletions:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    async def create(self, **kw):
        self.calls.append(kw)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def _msg(content=None, tool_calls=None):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=tool_calls))]
    )


def _client(replies):
    comp = FakeCompletions(replies)
    return comp, SimpleNamespace(chat=SimpleNamespace(completions=comp))


def _install_mock_providers(monkeypatch, groq=None, ollama=None):
    provs, comps = [], {}
    for name, replies in (("groq", groq), ("ollama", ollama)):
        if replies is not None:
            comps[name], client = _client(replies)
            provs.append(Provider(name, client, f"modelo-{name}"))
    agent = get_agent()
    monkeypatch.setattr(agent, "providers", provs)
    monkeypatch.setattr(agent, "last_provider", None)
    return comps


async def test_system_prompt_contains_rules_and_mexico_date(api, monkeypatch):
    """Verifica que el system prompt contenga las secciones requeridas, la fecha actual y parámetros de llamada."""
    fecha_esperada = _format_now_mexico()
    comps = _install_mock_providers(monkeypatch, groq=[_msg("Respuesta de prueba.")])

    r = await api.post("emp1", f"{V}/ai/chat", json={"messages": [{"role": "user", "content": "¿Qué día es hoy?"}]})
    assert r.status_code == 200

    call_args = comps["groq"].calls[0]
    # Parámetros requeridos: temperature=0.1, max_tokens=250
    assert call_args["temperature"] == 0.1
    assert call_args["max_tokens"] == 250

    system_prompt = call_args["messages"][0]["content"]
    assert "### ALCANCE" in system_prompt
    assert "### FUERA DE ALCANCE" in system_prompt
    assert "### REGLAS" in system_prompt
    assert "### EJEMPLOS" in system_prompt
    assert "### FECHA ACTUAL" in system_prompt
    assert fecha_esperada in system_prompt
    assert "Solo puedo ayudarte con temas de RRHH: saldos, solicitudes y políticas." in system_prompt
    assert "Si la pregunta es sencilla, responde en UNA sola línea" in system_prompt
    assert "Datos y políticas salen SOLO de las herramientas" in system_prompt


async def test_chat_short_date_answer(api, monkeypatch):
    """Verifica respuesta directa y corta de fecha."""
    fecha_str = _format_now_mexico()
    respuesta_modelo = f"Hoy es {fecha_str}."
    _install_mock_providers(monkeypatch, groq=[_msg(respuesta_modelo)])

    r = await api.post("emp1", f"{V}/ai/chat", json={"messages": [{"role": "user", "content": "¿Qué día es hoy?"}]})
    assert r.status_code == 200
    data = r.json()
    assert data["message"] == respuesta_modelo
    assert data["used_ai"] is True


async def test_chat_rejection_out_of_scope(api, monkeypatch):
    """Verifica que una pregunta fuera de alcance reciba la frase fija de rechazo."""
    rejection = "Solo puedo ayudarte con temas de RRHH: saldos, solicitudes y políticas."
    _install_mock_providers(monkeypatch, groq=[_msg(rejection)])

    r = await api.post("emp1", f"{V}/ai/chat", json={"messages": [{"role": "user", "content": "Cuéntame un chiste de programadores"}]})
    assert r.status_code == 200
    assert r.json()["message"] == rejection


async def test_chat_scope_filter_activable(api, monkeypatch):
    """Verifica el filtro opcional CHAT_SCOPE_FILTER: si clasifica out-of-scope, rechaza de inmediato."""
    s = get_settings()
    monkeypatch.setattr(s, "CHAT_SCOPE_FILTER", True)

    # El clasificador rápido devuelve {"in_scope": false}
    clasificador_reply = _msg(json.dumps({"in_scope": False}))
    comps = _install_mock_providers(monkeypatch, groq=[clasificador_reply])

    r = await api.post("emp1", f"{V}/ai/chat", json={"messages": [{"role": "user", "content": "Explícame cómo resolver ecuaciones cuadráticas"}]})
    assert r.status_code == 200
    data = r.json()
    assert data["message"] == "Solo puedo ayudarte con temas de RRHH: saldos, solicitudes y políticas."
    # Solo se ejecutó la llamada corta de clasificación (1 llamada), no el chat completo
    assert len(comps["groq"].calls) == 1
    assert comps["groq"].calls[0]["temperature"] == 0.0
    assert comps["groq"].calls[0]["response_format"] == {"type": "json_object"}


async def test_provider_selection_groq_vs_ollama(api, monkeypatch):
    """Verifica que el usuario pueda seleccionar explícitamente entre Groq y Ollama."""
    comps = _install_mock_providers(
        monkeypatch,
        groq=[_msg("Respuesta generada por Groq")],
        ollama=[_msg("Respuesta generada por Ollama")]
    )

    # 1. Petición especificando Ollama
    r_ollama = await api.post(
        "emp1",
        f"{V}/ai/chat",
        json={
            "messages": [{"role": "user", "content": "Consulta con Ollama"}],
            "provider": "ollama"
        }
    )
    assert r_ollama.status_code == 200
    assert r_ollama.json()["message"] == "Respuesta generada por Ollama"
    assert r_ollama.json()["provider"] == "ollama"
    assert len(comps["ollama"].calls) == 1
    assert len(comps["groq"].calls) == 0

    # 2. Petición especificando Groq
    r_groq = await api.post(
        "emp1",
        f"{V}/ai/chat",
        json={
            "messages": [{"role": "user", "content": "Consulta con Groq"}],
            "provider": "groq"
        }
    )
    assert r_groq.status_code == 200
    assert r_groq.json()["message"] == "Respuesta generada por Groq"
    assert r_groq.json()["provider"] == "groq"
    assert len(comps["groq"].calls) == 1
