"""Flujo de aprobación multinivel."""
import enum
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StepStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SKIPPED = "SKIPPED"


class ApprovalWorkflow(Base):
    __tablename__ = "approval_workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), unique=True, index=True)
    current_step_index: Mapped[int] = mapped_column(Integer, default=0)
    total_steps: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    request: Mapped["Request"] = relationship("Request", back_populates="workflow")  # type: ignore  # noqa: F821
    steps: Mapped[List["ApprovalStep"]] = relationship(
        "ApprovalStep", back_populates="workflow", order_by="ApprovalStep.step_index", cascade="all, delete-orphan"
    )


class ApprovalStep(Base):
    """Un paso lo resuelve una persona concreta (approver_id) o cualquier usuario con un rol (approver_role)."""
    __tablename__ = "approval_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("approval_workflows.id", ondelete="CASCADE"), index=True)
    step_index: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(60), default="Supervisor")
    approver_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    approver_role: Mapped[Optional[str]] = mapped_column(String(20))
    status: Mapped[StepStatus] = mapped_column(SAEnum(StepStatus), default=StepStatus.PENDING)
    acted_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reminded: Mapped[bool] = mapped_column(Boolean, default=False)
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    action_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    comments: Mapped[Optional[str]] = mapped_column(String(2000))

    workflow: Mapped[ApprovalWorkflow] = relationship("ApprovalWorkflow", back_populates="steps")
    approver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approver_id])  # type: ignore  # noqa: F821
    acted_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[acted_by_id])  # type: ignore  # noqa: F821
