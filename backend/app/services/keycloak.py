"""Servicio para interactuar con la API de Keycloak."""
import logging
from typing import Optional

import httpx
from fastapi import HTTPException

from app.core.config import get_settings

logger = logging.getLogger("hr.keycloak")


class KeycloakService:
    """Cliente para la API REST de Keycloak."""

    def __init__(self) -> None:
        self.settings = get_settings()
        if self.settings.OIDC_JWKS_URL:
            self.base_url = self.settings.OIDC_JWKS_URL.split("/realms/")[0]
        else:
            self.base_url = (self.settings.OIDC_ISSUER or "").replace("/realms/rrhh", "")
        self.realm = "rrhh"
        self._token: Optional[str] = None

    @property
    def is_enabled(self) -> bool:
        return bool(self.settings.OIDC_ISSUER and self.base_url and self.settings.ENVIRONMENT != "testing")

    async def _get_token(self, force_refresh: bool = False) -> str:
        """Obtiene un token de administrador de Keycloak."""
        if not self.is_enabled:
            return "mock_token"
        if self._token and not force_refresh:
            return self._token
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/realms/master/protocol/openid-connect/token",
                data={
                    "username": self.settings.KEYCLOAK_ADMIN,
                    "password": self.settings.KEYCLOAK_ADMIN_PASSWORD,
                    "grant_type": "password",
                    "client_id": "admin-cli",
                },
            )
            resp.raise_for_status()
            self._token = resp.json()["access_token"]
            return self._token

    async def find_user(self, identifier: str) -> Optional[dict]:
        """Busca un usuario en Keycloak por email o username."""
        if not self.is_enabled:
            return None
        token = await self._get_token()
        ident = identifier.strip().lower()
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                headers = {"Authorization": f"Bearer {token}"}
                # Buscar por email
                resp = await client.get(
                    f"{self.base_url}/admin/realms/{self.realm}/users?email={ident}",
                    headers=headers,
                )
                if resp.status_code == 401:
                    token = await self._get_token(force_refresh=True)
                    headers = {"Authorization": f"Bearer {token}"}
                    resp = await client.get(
                        f"{self.base_url}/admin/realms/{self.realm}/users?email={ident}",
                        headers=headers,
                    )
                users = resp.json() if resp.status_code == 200 else []
                if not users:
                    # Buscar por username
                    resp = await client.get(
                        f"{self.base_url}/admin/realms/{self.realm}/users?username={ident}",
                        headers=headers,
                    )
                    users = resp.json() if resp.status_code == 200 else []
                return users[0] if users else None
            except Exception as e:
                logger.warning("Error buscando usuario en Keycloak: %s", e)
                return None

    async def create_user(
        self,
        email: str,
        full_name: str,
        role: str,
        password: Optional[str] = None,
        temporary_password: Optional[str] = None,
    ) -> dict:
        pwd = password or temporary_password
        """Crea un usuario en el realm de Keycloak y le asigna su rol."""
        if not self.is_enabled:
            return {"id": "mock-kc-id", "email": email, "username": email}
        token = await self._get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        parts = full_name.strip().split()
        first_name = parts[0] if parts else email
        last_name = " ".join(parts[1:]) if len(parts) > 1 else ""

        user_data = {
            "username": email,
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
            "enabled": True,
            "emailVerified": True,
        }
        if pwd:
            user_data["credentials"] = [
                {
                    "type": "password",
                    "value": pwd,
                    "temporary": True,
                }
            ]

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/admin/realms/{self.realm}/users",
                headers=headers,
                json=user_data,
            )
            if resp.status_code == 401:
                token = await self._get_token(force_refresh=True)
                headers["Authorization"] = f"Bearer {token}"
                resp = await client.post(
                    f"{self.base_url}/admin/realms/{self.realm}/users",
                    headers=headers,
                    json=user_data,
                )
            if resp.status_code == 409:
                # Ya existe en Keycloak, buscar su ID
                get_resp = await client.get(
                    f"{self.base_url}/admin/realms/{self.realm}/users?email={email}",
                    headers=headers,
                )
                get_resp.raise_for_status()
                existing = get_resp.json()
                if existing:
                    return existing[0]
                raise HTTPException(409, "El usuario ya existe en Keycloak.")
            resp.raise_for_status()

            # Obtener ID del usuario creado
            get_resp = await client.get(
                f"{self.base_url}/admin/realms/{self.realm}/users?email={email}",
                headers=headers,
            )
            get_resp.raise_for_status()
            user = get_resp.json()[0]
            user_id = user["id"]

            # Asignar rol del realm
            role_resp = await client.get(
                f"{self.base_url}/admin/realms/{self.realm}/roles/{role}",
                headers=headers,
            )
            if role_resp.status_code == 200:
                role_data = role_resp.json()
                await client.post(
                    f"{self.base_url}/admin/realms/{self.realm}/users/{user_id}/role-mappings/realm",
                    headers=headers,
                    json=[{"id": role_data["id"], "name": role_data["name"]}],
                )
            return user

    async def reset_password(self, email: str, new_password: str) -> bool:
        """Restablece la contraseña de un usuario en Keycloak de forma permanente."""
        if not self.is_enabled:
            return True
        token = await self._get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/admin/realms/{self.realm}/users?email={email}",
                headers=headers,
            )
            if resp.status_code == 401:
                token = await self._get_token(force_refresh=True)
                headers["Authorization"] = f"Bearer {token}"
                resp = await client.get(
                    f"{self.base_url}/admin/realms/{self.realm}/users?email={email}",
                    headers=headers,
                )
            users = resp.json() if resp.status_code == 200 else []
            if not users:
                resp = await client.get(
                    f"{self.base_url}/admin/realms/{self.realm}/users?username={email}",
                    headers=headers,
                )
                users = resp.json() if resp.status_code == 200 else []
            if not users:
                return False
            user_id = users[0]["id"]
            resp = await client.put(
                f"{self.base_url}/admin/realms/{self.realm}/users/{user_id}/reset-password",
                headers=headers,
                json={"type": "password", "value": new_password, "temporary": False},
            )
            # Limpiar la acción requerida UPDATE_PASSWORD para que el usuario pueda entrar directamente
            existing_actions = [a for a in (users[0].get("requiredActions") or []) if a != "UPDATE_PASSWORD"]
            await client.put(
                f"{self.base_url}/admin/realms/{self.realm}/users/{user_id}",
                headers=headers,
                json={"requiredActions": existing_actions},
            )
            return resp.status_code == 204

    async def update_user(self, email: str, full_name: Optional[str] = None, new_email: Optional[str] = None) -> bool:
        """Actualiza datos del usuario en Keycloak."""
        if not self.is_enabled:
            return True
        token = await self._get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/admin/realms/{self.realm}/users?username={email}",
                headers=headers,
            )
            if resp.status_code == 401:
                token = await self._get_token(force_refresh=True)
                headers["Authorization"] = f"Bearer {token}"
                resp = await client.get(
                    f"{self.base_url}/admin/realms/{self.realm}/users?username={email}",
                    headers=headers,
                )
            resp.raise_for_status()
            users = resp.json()
            if not users:
                return False
            user_id = users[0]["id"]
            update_data = {}
            if full_name:
                parts = full_name.strip().split()
                update_data["firstName"] = parts[0]
                update_data["lastName"] = " ".join(parts[1:]) if len(parts) > 1 else ""
            if new_email:
                update_data["email"] = new_email
                update_data["username"] = new_email
            if update_data:
                resp = await client.put(
                    f"{self.base_url}/admin/realms/{self.realm}/users/{user_id}",
                    headers=headers,
                    json=update_data,
                )
                return resp.status_code == 204
            return True

    async def send_password_reset(self, email: str, redirect_uri: Optional[str] = None) -> dict:
        """Envía enlace de restablecimiento de contraseña por Keycloak o marca UPDATE_PASSWORD."""
        if not self.is_enabled:
            return {"email_sent": False, "reset_url": "http://localhost:8080/realms/rrhh/login-actions/reset-credentials"}
        token = await self._get_token(force_refresh=True)
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        public_issuer = self.settings.OIDC_PUBLIC_ISSUER or f"http://localhost:8080/realms/{self.realm}"
        client_id = self.settings.OIDC_CLIENT_ID or "rrhh-frontend"
        reset_url = f"{public_issuer}/login-actions/reset-credentials?client_id={client_id}"

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/admin/realms/{self.realm}/users?username={email}",
                headers=headers,
            )
            resp.raise_for_status()
            users = resp.json()
            if not users:
                raise HTTPException(404, f"El usuario {email} no existe en Keycloak.")
            user_id = users[0]["id"]

            params = {"client_id": client_id}
            if redirect_uri:
                params["redirect_uri"] = redirect_uri
            email_resp = await client.put(
                f"{self.base_url}/admin/realms/{self.realm}/users/{user_id}/execute-actions-email",
                headers=headers,
                params=params,
                json=["UPDATE_PASSWORD"],
            )
            email_sent = email_resp.status_code == 204

            # Asegurar acción requerida UPDATE_PASSWORD en Keycloak
            existing_actions = list(users[0].get("requiredActions") or [])
            if "UPDATE_PASSWORD" not in existing_actions:
                existing_actions.append("UPDATE_PASSWORD")
            await client.put(
                f"{self.base_url}/admin/realms/{self.realm}/users/{user_id}",
                headers=headers,
                json={"requiredActions": existing_actions},
            )
            return {"email_sent": email_sent, "reset_url": reset_url}


_singleton: Optional[KeycloakService] = None


def get_keycloak_service() -> KeycloakService:
    global _singleton
    if _singleton is None:
        _singleton = KeycloakService()
    return _singleton
