"""Esquemas Pydantic de entrada."""
from datetime import date
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import RequestType, UserRole, UserStatus


class SetupIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=10, max_length=128)
    setup_token: Optional[str] = None


class LoginIn(BaseModel):
    email: str
    password: str


class OidcLoginIn(BaseModel):
    id_token: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)


class RequestIn(BaseModel):
    type: RequestType
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    request_data: dict[str, Any] = Field(default_factory=dict)


class ApprovalIn(BaseModel):
    comments: Optional[str] = Field(default=None, max_length=2000)


class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=2000)

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ("user", "assistant"):
            raise ValueError("role inválido")
        return v


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    provider: Optional[str] = Field(default=None, description="Proveedor preferido: 'groq' o 'ollama'")


class DepartmentIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    code: str = Field(min_length=2, max_length=20)
    description: Optional[str] = None
    manager_id: Optional[int] = None
    is_active: bool = True


class UserCreateIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=3, max_length=150)
    employee_id: Optional[str] = Field(default=None, max_length=30)
    password: Optional[str] = Field(default=None, min_length=10, max_length=128)  # vacío = solo acceso con Keycloak
    role: UserRole = UserRole.EMPLOYEE
    department_id: Optional[int] = None
    job_title: Optional[str] = None
    direct_supervisor_id: Optional[int] = None
    hire_date: Optional[date] = None
    phone: Optional[str] = None
    salary: Optional[float] = Field(default=None, ge=0)
    vacation_balance: Optional[float] = Field(default=None, ge=0)
    personal_leave_balance: Optional[float] = Field(default=None, ge=0)


class UserUpdateIn(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=3, max_length=150)
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    department_id: Optional[int] = None
    job_title: Optional[str] = None
    direct_supervisor_id: Optional[int] = None
    hire_date: Optional[date] = None
    phone: Optional[str] = None
    salary: Optional[float] = Field(default=None, ge=0)
    vacation_balance: Optional[float] = Field(default=None, ge=0)
    personal_leave_balance: Optional[float] = Field(default=None, ge=0)
    new_password: Optional[str] = Field(default=None, min_length=10, max_length=128)


class ProfileUpdateIn(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=3, max_length=150)
    phone: Optional[str] = Field(default=None, max_length=30)
    address: Optional[str] = Field(default=None, max_length=300)
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(default=None, min_length=10, max_length=128)


class PolicyIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    category: str = Field(min_length=2, max_length=100)
    content: str = Field(min_length=10, max_length=8000)
    tags: Optional[str] = Field(default=None, max_length=300)
    version: str = "1.0"
    is_active: bool = True


class RequestTypeConfigIn(BaseModel):
    requires_approval: Optional[bool] = None
    auto_approve_days: Optional[float] = Field(default=None, ge=0, le=30)
    sla_hours: Optional[int] = Field(default=None, ge=1, le=720)
    is_active: Optional[bool] = None
