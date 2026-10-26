"""Usuarios, departamentos y roles."""
import enum
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import Boolean, Date, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    EMPLOYEE = "EMPLOYEE"
    MANAGER = "MANAGER"
    HR_ADMIN = "HR_ADMIN"
    SYSTEM_ADMIN = "SYSTEM_ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    description: Mapped[Optional[str]] = mapped_column(String(500))
    manager_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", use_alter=True, name="fk_dept_manager"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    users: Mapped[List["User"]] = relationship("User", back_populates="department", foreign_keys="User.department_id")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(150))
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255))  # NULL para usuarios que solo entran con Keycloak
    auth_provider: Mapped[str] = mapped_column(String(20), default="local")  # local | oidc
    oidc_sub: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True)  # identificador del usuario en Keycloak

    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.EMPLOYEE)
    status: Mapped[UserStatus] = mapped_column(SAEnum(UserStatus), default=UserStatus.ACTIVE)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    job_title: Mapped[Optional[str]] = mapped_column(String(100))
    direct_supervisor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    hire_date: Mapped[Optional[date]] = mapped_column(Date)
    phone: Mapped[Optional[str]] = mapped_column(String(30))
    address: Mapped[Optional[str]] = mapped_column(String(300))
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500))
    salary: Mapped[Optional[float]] = mapped_column(Float)  # sueldo mensual bruto

    vacation_balance: Mapped[float] = mapped_column(Float, default=0.0)
    personal_leave_balance: Mapped[float] = mapped_column(Float, default=6.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    department: Mapped[Optional[Department]] = relationship("Department", back_populates="users", foreign_keys=[department_id])
    direct_supervisor: Mapped[Optional["User"]] = relationship("User", remote_side="User.id", foreign_keys=[direct_supervisor_id])
    calendar_notes: Mapped[List["CalendarNote"]] = relationship("CalendarNote", back_populates="user", cascade="all, delete-orphan", foreign_keys="CalendarNote.user_id")


class CalendarNote(Base):
    __tablename__ = "calendar_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)
    visibility: Mapped[str] = mapped_column(String(20), default="PERSONAL")  # PERSONAL, DEPARTMENT, GLOBAL
    title: Mapped[str] = mapped_column(String(200))
    date: Mapped[date] = mapped_column(Date)
    type: Mapped[str] = mapped_column(String(50), default="Actividad")
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="calendar_notes", foreign_keys=[user_id])
    department: Mapped[Optional[Department]] = relationship("Department", foreign_keys=[department_id])
