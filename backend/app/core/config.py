"""Configuración central (variables de entorno / archivo .env)."""
from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_KEYS = {"", "change-me", "dev-insecure-secret-key-change-me-please-0123456789"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore")

    # Si es true, el sistema NO arranca mientras falte alguna integración obligatoria del proyecto
    # (IA con Groq/Ollama, inicio de sesión con Keycloak, Power BI). Actívalo cuando ya las hayas configurado.
    REQUIRE_INTEGRATIONS: bool = False

    # Aplicación
    APP_NAME: str = "HR Automation"
    APP_VERSION: str = "2.0.0"
    ENVIRONMENT: str = "development"  # development | production | testing
    DEBUG: bool = False
    # Datos de la empresa (aparecen en la interfaz y en las constancias). Cámbielos en .env para otra organización.
    COMPANY_NAME: str = "PluriOne S.A. de C.V."
    COMPANY_TRADE_NAME: str = "Develop Talent & Technology"
    COMPANY_RFC: str = "PLU060407HC9"
    COMPANY_ADDRESS: str = "Puebla 46, Col. Roma Norte, Alcaldía Cuauhtémoc, C.P. 06700, Ciudad de México"
    COMPANY_LEGAL_REP: str = "Xochicuahuitl Gleason Juárez"
    CURRENCY: str = "MXN"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8080,http://localhost"

    # Datos
    DATABASE_URL: str = "postgresql+asyncpg://hr_user:hr_pass@localhost:5432/hr_automation"
    REDIS_URL: Optional[str] = "redis://localhost:6379/0"

    # Seguridad / autenticación
    SECRET_KEY: str = "dev-insecure-secret-key-change-me-please-0123456789"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    AUTH_MODE: str = "both"  # local | oidc | both
    SETUP_TOKEN: Optional[str] = None  # si se define, es obligatorio para crear el primer administrador
    FIRST_ADMIN_EMAIL: Optional[str] = None  # alternativa no interactiva al asistente de primer uso
    FIRST_ADMIN_PASSWORD: Optional[str] = None
    FIRST_ADMIN_NAME: str = "Administrador del Sistema"

    # Inicio de sesión corporativo con OpenID Connect (Keycloak)
    OIDC_ISSUER: Optional[str] = None  # URL PÚBLICA del realm, igual a la que ve el navegador: http://localhost:8080/realms/rrhh
    OIDC_CLIENT_ID: Optional[str] = None
    OIDC_JWKS_URL: Optional[str] = None  # opcional: URL interna de las llaves (dentro de Docker: http://keycloak:8080/realms/rrhh/protocol/openid-connect/certs)
    OIDC_ALLOWED_DOMAINS: str = ""  # csv, vacío = cualquier usuario del realm
    OIDC_PROVIDER_NAME: str = "Keycloak"

    # IA: cadena de proveedores compatibles con la API de OpenAI. Orden: Groq (nube) → Ollama (local, sin internet) → motor de reglas
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "qwen/qwen3.8-27b"  # debe soportar herramientas y modo JSON; ver console.groq.com/docs/models
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    OLLAMA_BASE_URL: Optional[str] = None  # ej. http://ollama:11434/v1 (Docker) o http://localhost:11434/v1
    OLLAMA_MODEL: str = "llama3.1:8b"  # debe soportar herramientas; descargar con: ollama pull llama3.1:8b
    LLM_COOLDOWN_SECONDS: int = 60  # tras un fallo, se salta ese proveedor este tiempo para no hacer esperar a los usuarios
    CHAT_SCOPE_FILTER: bool = False  # clasificador rápido opcional para filtrar temas fuera de alcance

    # Notificaciones externas (opcionales)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: str = "rrhh@localhost"
    TEAMS_WEBHOOK_URL: Optional[str] = None

    # Power BI
    POWERBI_REPORT_URL: Optional[str] = None  # URL de inserción del reporte publicado
    POWERBI_DB_USER: str = "powerbi_reader"  # rol de solo lectura sobre las vistas analíticas
    POWERBI_DB_PASSWORD: Optional[str] = None  # si se define, se crea el rol automáticamente

    # Reglas de negocio
    VACATION_MIN_NOTICE_DAYS: int = 3
    VACATION_MAX_CONSECUTIVE_DAYS: int = 15
    VACATION_HR_APPROVAL_DAYS: int = 10  # a partir de estos días interviene RRHH
    MEDICAL_CERT_REQUIRED_DAYS: int = 2
    TEAM_MAX_ABSENT_RATIO: float = 0.5

    # SLA
    SLA_SCHEDULER_ENABLED: bool = True
    SLA_CHECK_INTERVAL_SECONDS: int = 900

    # Archivos
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 8

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_postgresql(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")

    @property
    def has_llm(self) -> bool:
        return bool(self.GROQ_API_KEY or self.OLLAMA_BASE_URL)

    @property
    def oidc_enabled(self) -> bool:
        return self.AUTH_MODE in ("oidc", "both") and bool(self.OIDC_ISSUER and self.OIDC_CLIENT_ID)

    @property
    def local_auth_enabled(self) -> bool:
        return self.AUTH_MODE in ("local", "both") or not self.oidc_enabled

    @property
    def oidc_domains(self) -> List[str]:
        return [d.strip().lower() for d in self.OIDC_ALLOWED_DOMAINS.split(",") if d.strip()]

    def missing_integrations(self) -> List[str]:
        missing = []
        if not self.has_llm:
            missing.append("IA (GROQ_API_KEY y/o OLLAMA_BASE_URL)")
        if self.AUTH_MODE == "local" or not (self.OIDC_ISSUER and self.OIDC_CLIENT_ID):
            missing.append("Keycloak (AUTH_MODE distinto de 'local', OIDC_ISSUER y OIDC_CLIENT_ID)")
        if not self.POWERBI_DB_PASSWORD:
            missing.append("Power BI (POWERBI_DB_PASSWORD, crea el usuario de solo lectura)")
        return missing

    def validate_for_runtime(self) -> None:
        if self.REQUIRE_INTEGRATIONS and self.missing_integrations():
            raise RuntimeError("REQUIRE_INTEGRATIONS=true pero faltan integraciones obligatorias: " + "; ".join(self.missing_integrations()))
        if self.is_production and (self.SECRET_KEY in _INSECURE_KEYS or len(self.SECRET_KEY) < 32):
            raise RuntimeError("SECRET_KEY inseguro: defina un valor aleatorio de al menos 32 caracteres en producción.")


@lru_cache()
def get_settings() -> Settings:
    return Settings()
