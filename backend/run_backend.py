"""
Script de inicio rápido del servidor backend.
Uso:
    python backend/run_backend.py
"""
import os
import socket
import sys

# Agregar la carpeta backend al sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

if __name__ == "__main__":
    # Detección inteligente de entorno local
    if "DATABASE_URL" not in os.environ:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        pg_alive = sock.connect_ex(("localhost", 5432)) == 0
        sock.close()
        if not pg_alive:
            print("ℹ️  PostgreSQL no detectado en localhost:5432.")
            print("🚀 Iniciando automáticamente con SQLite local (hr_system.db) y modo desarrollo...")
            os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./hr_system.db"
            os.environ["REQUIRE_INTEGRATIONS"] = "false"
            os.environ["REDIS_URL"] = ""

    import uvicorn

    print("🌐 Servidor backend iniciando en http://localhost:8000")
    print("📚 Documentación Swagger API en: http://localhost:8000/docs")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["app"],
        log_level="info",
    )
