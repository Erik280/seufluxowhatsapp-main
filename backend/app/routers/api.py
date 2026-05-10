"""
SeuFluxo WhatsApp — API CRUD Routes
Endpoints para gerenciar contacts, flows, steps e messages.
"""

import logging
from fastapi import APIRouter, HTTPException
from app.database import get_supabase
from app.models.schemas import (
    ContactResponse, ContactStatusUpdate,
    FlowCreate, FlowResponse,
    StepCreate, StepResponse,
    MessageResponse,
)

logger = logging.getLogger("seufluxo.api")

router = APIRouter(prefix="/api", tags=["API"])


# ========================
# CONTACTS
# ========================

@router.get("/contacts/{company_id}", response_model=list[ContactResponse])
async def list_contacts(company_id: str):
    """Lista todos os contatos de uma empresa."""
    db = get_supabase()
    result = (
        db.table("contacts")
        .select("*")
        .eq("company_id", company_id)
        .order("last_message", desc=True)
        .execute()
    )
    return result.data or []


@router.patch("/contacts/{contact_id}/status")
async def update_contact_status(contact_id: str, body: ContactStatusUpdate):
    """Alterna o chat_status de um contato entre 'bot' e 'human'."""
    db = get_supabase()
    result = (
        db.table("contacts")
        .update({"chat_status": body.chat_status.value})
        .eq("id", contact_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    return result.data[0]


# ========================
# CHAT FLOWS
# ========================

@router.get("/flows/{company_id}", response_model=list[FlowResponse])
async def list_flows(company_id: str):
    """Lista todos os fluxos de uma empresa."""
    db = get_supabase()
    result = (
        db.table("chat_flows")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/flows", response_model=FlowResponse, status_code=201)
async def create_flow(body: FlowCreate):
    """Cria um novo fluxo de atendimento."""
    db = get_supabase()
    result = (
        db.table("chat_flows")
        .insert({
            "company_id": body.company_id,
            "name": body.name,
            "trigger_keyword": body.trigger_keyword,
            "is_active": body.is_active,
        })
        .execute()
    )
    return result.data[0]


@router.patch("/flows/{flow_id}/toggle")
async def toggle_flow(flow_id: str):
    """Ativa/desativa um fluxo."""
    db = get_supabase()
    # Buscar estado atual
    current = db.table("chat_flows").select("is_active").eq("id", flow_id).execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Flow not found")
    new_state = not current.data[0]["is_active"]
    result = db.table("chat_flows").update({"is_active": new_state}).eq("id", flow_id).execute()
    return result.data[0]


@router.delete("/flows/{flow_id}", status_code=204)
async def delete_flow(flow_id: str):
    """Deleta um fluxo e todos os seus steps (cascade)."""
    db = get_supabase()
    db.table("chat_flows").delete().eq("id", flow_id).execute()
    return None


# ========================
# FLOW STEPS
# ========================

@router.get("/flows/{flow_id}/steps", response_model=list[StepResponse])
async def list_steps(flow_id: str):
    """Lista todos os steps de um fluxo ordenados por order_index."""
    db = get_supabase()
    result = (
        db.table("flow_steps")
        .select("*")
        .eq("flow_id", flow_id)
        .order("order_index", desc=False)
        .execute()
    )
    return result.data or []


@router.post("/flows/steps", response_model=StepResponse, status_code=201)
async def create_step(body: StepCreate):
    """Adiciona um novo step a um fluxo."""
    db = get_supabase()
    result = (
        db.table("flow_steps")
        .insert({
            "flow_id": body.flow_id,
            "type": body.type.value,
            "content": body.content,
            "delay_duration": body.delay_duration,
            "order_index": body.order_index,
        })
        .execute()
    )
    return result.data[0]


@router.delete("/flows/steps/{step_id}", status_code=204)
async def delete_step(step_id: str):
    """Remove um step."""
    db = get_supabase()
    db.table("flow_steps").delete().eq("id", step_id).execute()
    return None


# ========================
# MESSAGES
# ========================

@router.get("/messages/{contact_id}", response_model=list[MessageResponse])
async def list_messages(contact_id: str, limit: int = 50):
    """Lista as últimas mensagens de um contato."""
    db = get_supabase()
    result = (
        db.table("messages")
        .select("*")
        .eq("contact_id", contact_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    # Retorna em ordem cronológica
    data = result.data or []
    data.reverse()
    return data
