"""Solicitudes de RRHH, tipos y configuración por tipo."""
import enum
import secrets
import string
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import JSON, Date, DateTime, Enum as SAEnum, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RequestType(str, enum.Enum):
    VACATION = "VACATION"
    PERSONAL_LEAVE = "PERSONAL_LEAVE"
    MEDICAL_LEAVE = "MEDICAL_LEAVE"
    MATERNITY_PATERNITY = "MATERNITY_PATERNITY"
    CERTIFICATE_EMPLOYMENT = "CERTIFICATE_EMPLOYMENT"
    CERTIFICATE_SALARY = "CERTIFICATE_SALARY"
    ADDRESS_CHANGE = "ADDRESS_CHANGE"
    BANK_ACCOUNT_CHANGE = "BANK_ACCOUNT_CHANGE"
    PAYROLL_INCIDENT = "PAYROLL_INCIDENT"
    OTHER = "OTHER"


class RequestStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


ACTIVE_STATUSES = (RequestStatus.PENDING_APPROVAL, RequestStatus.IN_REVIEW)


class Priority(str, enum.Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    URGENT = "URGENT"


LEAVE_TYPES = (RequestType.VACATION, RequestType.PERSONAL_LEAVE, RequestType.MEDICAL_LEAVE, RequestType.MATERNITY_PATERNITY)

FOLIO_PREFIXES = {
    RequestType.VACATION: "VAC", RequestType.PERSONAL_LEAVE: "PER", RequestType.MEDICAL_LEAVE: "MED",
    RequestType.MATERNITY_PATERNITY: "MAT", RequestType.CERTIFICATE_EMPLOYMENT: "CON",
    RequestType.CERTIFICATE_SALARY: "COS", RequestType.ADDRESS_CHANGE: "DOM",
    RequestType.BANK_ACCOUNT_CHANGE: "BAN", RequestType.PAYROLL_INCIDENT: "NOM", RequestType.OTHER: "OTR",
}


def generate_folio(request_type: RequestType) -> str:
    suffix = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(5))
    return f"{FOLIO_PREFIXES[request_type]}-{datetime.now().year}-{suffix}"


class RequestTypeConfig(Base):
    """Parámetros del flujo por tipo de solicitud (editables por RRHH)."""
    __tablename__ = "request_type_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[RequestType] = mapped_column(SAEnum(RequestType), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(String(500))
    requires_approval: Mapped[bool] = mapped_column(default=True)
    auto_approve_days: Mapped[float] = mapped_column(Float, default=0)  # auto-aprobación hasta N días (0 = nunca)
    sla_hours: Mapped[int] = mapped_column(Integer, default=48)
    is_active: Mapped[bool] = mapped_column(default=True)


class Request(Base):
    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    folio: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    type: Mapped[RequestType] = mapped_column(SAEnum(RequestType), index=True)
    status: Mapped[RequestStatus] = mapped_column(SAEnum(RequestStatus), default=RequestStatus.PENDING_APPROVAL, index=True)
    priority: Mapped[Priority] = mapped_column(SAEnum(Priority), default=Priority.NORMAL)

    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(String(2000))
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    days_requested: Mapped[Optional[float]] = mapped_column(Float)
    request_data: Mapped[Optional[Any]] = mapped_column(JSON, default=dict)
    attached_files: Mapped[Optional[Any]] = mapped_column(JSON, default=list)  # límite 3 archivos, 5 MB cada uno

    ai_validation_score: Mapped[Optional[float]] = mapped_column(Float)
    ai_validation_notes: Mapped[Optional[str]] = mapped_column(String(2000))
    ai_risk_level: Mapped[Optional[str]] = mapped_column(String(20))
    auto_resolved: Mapped[bool] = mapped_column(default=False)  # resuelta sin intervención humana

    generated_document_html: Mapped[Optional[str]] = mapped_column(Text)

    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    requester: Mapped["User"] = relationship("User", foreign_keys=[requester_id])  # type: ignore  # noqa: F821
    workflow: Mapped[Optional["ApprovalWorkflow"]] = relationship(  # type: ignore  # noqa: F821
        "ApprovalWorkflow", back_populates="request", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_requests_requester_status", "requester_id", "status"),)
