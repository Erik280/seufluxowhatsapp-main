"""
SeuFluxo WhatsApp — Pydantic Schemas
Modelos de validação para requests/responses da API.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional


# ========================
# Enums
# ========================

class ChatStatus(str, Enum):
    bot = "bot"
    human = "human"

class UserRole(str, Enum):
    superadmin = "superadmin"
    admin = "admin"
    manager = "manager"
    agent = "agent"

class MessageDirection(str, Enum):
    incoming = "in"
    outgoing = "out"

class StepType(str, Enum):
    text = "text"
    audio = "audio"
    image = "image"
    video = "video"
    delay = "delay"
    composing = "composing"
    recording = "recording"
    react = "react"
    document = "document"


# ========================
# Company
# ========================

class CompanyBase(BaseModel):
    name: str
    evolution_instance: Optional[str] = None
    evolution_apikey: Optional[str] = None

class CompanyCreate(CompanyBase):
    pass

class CompanyResponse(CompanyBase):
    id: str
    created_at: datetime


# ========================
# Department
# ========================

class DepartmentBase(BaseModel):
    name: str

class DepartmentCreate(DepartmentBase):
    company_id: str

class DepartmentResponse(DepartmentBase):
    id: str
    company_id: str
    created_at: datetime


# ========================
# User
# ========================

class UserBase(BaseModel):
    email: str
    name: Optional[str] = None
    role: UserRole = UserRole.agent
    department_id: Optional[str] = None

class UserCreate(UserBase):
    company_id: str

# Schema para criação de usuário pelo Admin via Supabase Admin API
class AdminUserCreate(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    role: UserRole = UserRole.agent
    department_id: Optional[str] = None
    company_id: str  # Será validado no backend contra o company_id do admin

class UserResponse(UserBase):
    id: str
    company_id: str
    is_active: bool
    created_at: datetime
    signature: Optional[str] = None
    department_id: Optional[str] = None


# ========================
# Contact
# ========================

class ContactBase(BaseModel):
    phone: str
    name: Optional[str] = None
    chat_status: ChatStatus = ChatStatus.bot

class ContactCreate(ContactBase):
    company_id: str

class ContactResponse(ContactBase):
    id: str
    company_id: str
    profile_pic: Optional[str] = None
    avatar_url: Optional[str] = None
    assigned_to: Optional[str] = None
    last_message: Optional[datetime] = None
    created_at: datetime

class ContactStatusUpdate(BaseModel):
    chat_status: ChatStatus


# ========================
# Chat Flow
# ========================

class FlowBase(BaseModel):
    name: str
    trigger_keyword: str
    is_active: bool = True
    trigger_once: bool = False

class FlowCreate(FlowBase):
    company_id: str

class FlowResponse(FlowBase):
    id: str
    company_id: str
    created_at: datetime


# ========================
# Flow Step
# ========================

class StepBase(BaseModel):
    type: StepType = StepType.text
    content: str
    delay_duration: int = Field(default=3, ge=0, le=30)
    order_index: int = 0

class StepCreate(StepBase):
    flow_id: str

class StepResponse(StepBase):
    id: str
    flow_id: str
    created_at: datetime


# ========================
# Message
# ========================

class MessageBase(BaseModel):
    direction: MessageDirection
    content: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    whatsapp_id: Optional[str] = None
    reaction: Optional[str] = None

class MessageCreate(MessageBase):
    company_id: str
    contact_id: str

class MessageResponse(MessageBase):
    id: str
    company_id: str
    contact_id: str
    created_at: datetime

class ReactMessageRequest(BaseModel):
    reaction: str

class EditMessageRequest(BaseModel):
    new_content: str



# ========================
# Evolution Webhook Payload
# ========================

class EvolutionWebhookData(BaseModel):
    """Payload parcial do webhook da Evolution API."""
    instance: Optional[str] = None
    event: Optional[str] = None
    data: Optional[dict] = None

    class Config:
        extra = "allow"   # aceita campos extras sem quebrar

# ========================
# Kanban & Tags
# ========================

class KanbanStageBase(BaseModel):
    name: str
    color: str = "#8892b0"
    order_index: int = 0
    trigger_flow_id: Optional[str] = None

class KanbanStageCreate(KanbanStageBase):
    company_id: str

class KanbanStageResponse(KanbanStageBase):
    id: str
    company_id: str

class TagBase(BaseModel):
    name: str
    color: str = "#00FF88"

class TagCreate(TagBase):
    company_id: str

class TagResponse(TagBase):
    id: str
    company_id: str

class ContactStageUpdate(BaseModel):
    stage_id: Optional[str] = None

# ========================
# Scheduling
# ========================

class ScheduleStep(BaseModel):
    type: StepType
    content: Optional[str] = None
    media_url: Optional[str] = None
    delay_duration: int = 3

class ScheduleMessageRequest(BaseModel):
    scheduled_for: datetime
    flow_id: Optional[str] = None
    save_as_flow: bool = False
    flow_name: Optional[str] = None
    steps: Optional[list[ScheduleStep]] = None

# ========================
# Quick Replies
# ========================

class QuickReplyBase(BaseModel):
    shortcut: str
    content: str
    media_url: Optional[str] = None
    media_type: Optional[str] = None

class QuickReplyCreate(QuickReplyBase):
    company_id: str

class QuickReplyResponse(QuickReplyBase):
    id: str
    company_id: str
    created_at: datetime

