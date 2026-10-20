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


class ForgotPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)


class ResetPasswordCodeIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=10, max_length=128)


from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationError, field_validator, model_validator


class EmptyRequestData(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MaternityPaternityData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["maternity", "paternity"] = "maternity"


class CertificateData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    addressed_to: Optional[str] = Field(default=None, max_length=120)
    purpose: Optional[str] = Field(default=None, max_length=120)


class AddressChangeData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    new_address: str = Field(default="", max_length=300)
    phone: Optional[str] = Field(default=None, max_length=15)

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != "":
            if len(v) > 15 or not all(c.isdigit() or c == "+" for c in v):
                raise ValueError("Teléfono inválido (máx. 15 dígitos)")
        return v


class BankAccountChangeData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bank_name: str = Field(default="", max_length=80)
    clabe: str = Field(default="", max_length=24)

    @field_validator("clabe")
    @classmethod
    def _validate_clabe(cls, v: str) -> str:
        clean = (v or "").strip().replace(" ", "").replace("-", "")
        if clean and not clean.isdigit():
            raise ValueError("La CLABE solo debe contener números (18 dígitos).")
        return clean


class PayrollIncidentData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: Optional[str] = Field(default=None, max_length=80)


class MedicalLeaveData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    has_medical_certificate: Optional[bool] = None


_REQUEST_DATA_SCHEMAS: dict[RequestType, type[BaseModel]] = {
    RequestType.VACATION: EmptyRequestData,
    RequestType.PERSONAL_LEAVE: EmptyRequestData,
    RequestType.MEDICAL_LEAVE: MedicalLeaveData,
    RequestType.MATERNITY_PATERNITY: MaternityPaternityData,
    RequestType.CERTIFICATE_EMPLOYMENT: CertificateData,
    RequestType.CERTIFICATE_SALARY: CertificateData,
    RequestType.ADDRESS_CHANGE: AddressChangeData,
    RequestType.BANK_ACCOUNT_CHANGE: BankAccountChangeData,
    RequestType.PAYROLL_INCIDENT: PayrollIncidentData,
    RequestType.OTHER: EmptyRequestData,
}


class RequestIn(BaseModel):
    type: RequestType
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_emergency: bool = Field(default=False, description="Marca de solicitud urgente (SLA 4h)")
    request_data: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate_data_by_type(self) -> "RequestIn":
        schema_cls = _REQUEST_DATA_SCHEMAS.get(self.type, EmptyRequestData)
        parsed = schema_cls.model_validate(self.request_data or {})
        self.request_data = parsed.model_dump(exclude_none=True)
        return self


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
