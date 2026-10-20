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
        self.base_url = (self.settings.OIDC_ISSUER or "").replace("/realms/rrhh", "")
        self.realm = "rrhh"
        self._token: Optional[str] = None

    @property
    def is_enabled(self) -> bool:
        return bool(self.settings.OIDC_ISSUER and self.base_url and self.settings.ENVIRONMENT != "testing")

    async def _get_token(self) -> str:
        """Obtiene un token de administrador de Keycloak."""
        if not self.is_enabled:
            return "mock_token"
        if self._token:
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

    async def create_user(
        self,
        email: str,
        full_name: str,
        role: str,
        password: Optional[str] = None,
    ) -> dict:
        if not self.is_enabled:
            return {"id": "mock_kc_id", "email": email, "role": role}
        token = await self._get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        # Crear usuario
        user_data = {
            "username": email,
            "email": email,
            "emailVerified": True,
            "enabled": True,
            "firstName": full_name.split()[0] if full_name else email,
            "lastName": " ".join(full_name.split()[1:]) if len(full_name.split()) > 1 else "",
        }
        if password:
            user_data["credentials"] = [{"type": "password", "value": password, "temporary": False}]

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/admin/realms/{self.realm}/users",
                headers=headers,
                json=user_data,
            )
            if resp.status_code == 409:
                raise HTTPException(409, f"Ya existe un usuario con el correo {email} en Keycloak.")
            resp.raise_for_status()

            # Obtener el ID del usuario creado
            resp = await client.get(
                f"{self.base_url}/admin/realms/{self.realm}/users?username={email}",
                headers=headers,
            )
            resp.raise_for_status()
            users = resp.json()
            if not users:
                raise HTTPException(500, "No se pudo obtener el ID del usuario creado en Keycloak.")
            kc_user_id = users[0]["id"]

            # Asignar rol del realm
            resp = await client.get(
                f"{self.base_url}/admin/realms/{self.realm}/roles/{role}",
                headers=headers,
            )
            if resp.status_code == 404:
                raise HTTPException(400, f"Rol '{role}' no encontrado en Keycloak.")
            resp.raise_for_status()
            role_data = resp.json()

            resp = await client.post(
                f"{self.base_url}/admin/realms/{self.realm}/users/{kc_user_id}/role-mappings/realm",
                headers=headers,
                json=[role_data],
            )
            resp.raise_for_status()

            logger.info("Usuario creado en Keycloak: %s con rol %s", email, role)
            return {"id": kc_user_id, "email": email, "role": role}

    async def reset_password(self, email: str, new_password: str) -> bool:
        """Actualiza la contraseña del usuario en Keycloak."""
        if not self.is_enabled:
            return True
        token = await self._get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            # Buscar primero por correo y luego por nombre de usuario
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
            # Limpiar la acci?n requerida UPDATE_PASSWORD para que el usuario pueda entrar directamente
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
        """Envía enlace de restablecimiento de contraseña por Keycloak (execute-actions-email) o marca UPDATE_PASSWORD."""
        if not self.is_enabled:
            return {"email_sent": False, "reset_url": "http://localhost:8080/realms/rrhh/login-actions/reset-credentials"}
        self._token = None
        token = await self._get_token()
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
