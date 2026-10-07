"""Hashing de contraseñas, JWT de la aplicación y cifrado de datos sensibles."""
import base64
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_access_token(data: dict[str, Any], expires_minutes: Optional[int] = None) -> tuple[str, str, int]:
    """Devuelve (token, jti, segundos_de_vida)."""
    minutes = expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    now = datetime.now(timezone.utc)
    jti = uuid.uuid4().hex
    payload = {**data, "jti": jti, "iat": now, "exp": now + timedelta(minutes=minutes)}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM), jti, minutes * 60


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest()))


def encrypt_value(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_value(token: str) -> Optional[str]:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None
