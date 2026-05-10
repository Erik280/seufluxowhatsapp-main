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

from pydantic import BaseModel

class SendMessageRequest(BaseModel):
    contact_id: str
    company_id: str
    text: str

@router.post("/messages/send")
async def send_manual_message(body: SendMessageRequest):
    """Envia uma mensagem manual (texto) pelo painel e salva no banco."""
    db = get_supabase()
    
    # 1. Obter os dados da empresa (instância e apikey)
    company_res = db.table("companies").select("evolution_instance, evolution_apikey").eq("id", body.company_id).execute()
    if not company_res.data:
        raise HTTPException(status_code=404, detail="Company not found")
        
    company = company_res.data[0]
    instance = company.get("evolution_instance")
    apikey = company.get("evolution_apikey")
    
    if not instance or not apikey:
        raise HTTPException(status_code=400, detail="Evolution API not configured for this company")
        
    # 2. Obter os dados do contato (telefone)
    contact_res = db.table("contacts").select("phone").eq("id", body.contact_id).execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
        
    phone = contact_res.data[0]["phone"]
    
    # 3. Enviar a mensagem pela Evolution API
    from app.services.evolution import EvolutionAPI
    evolution = EvolutionAPI(instance, apikey)
    
    # Simular digitação
    await evolution.send_presence(phone, composing=True)
    
    # Enviar
    resp = await evolution.send_text(phone, body.text)
    
    if "error" in resp:
        raise HTTPException(status_code=500, detail=f"Evolution API Error: {resp['error']}")
        
    # 4. Salvar no banco
    msg_result = db.table("messages").insert({
        "company_id": body.company_id,
        "contact_id": body.contact_id,
        "direction": "out",
        "content": body.text,
    }).execute()
    
    return msg_result.data[0] if msg_result.data else {"status": "sent"}

from fastapi import UploadFile, File, Form
from app.services.storage import StorageService
import uuid

@router.post("/messages/send/media")
async def send_manual_media(
    contact_id: str = Form(...),
    company_id: str = Form(...),
    file: UploadFile = File(...)
):
    """Envia mídia (imagem, áudio, vídeo) pelo painel e salva no banco."""
    db = get_supabase()
    
    company_res = db.table("companies").select("evolution_instance, evolution_apikey").eq("id", company_id).execute()
    if not company_res.data:
        raise HTTPException(status_code=404, detail="Company not found")
        
    company = company_res.data[0]
    instance = company.get("evolution_instance")
    apikey = company.get("evolution_apikey")
    
    contact_res = db.table("contacts").select("phone").eq("id", contact_id).execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
        
    phone = contact_res.data[0]["phone"]
    
    # 1. Upload to MinIO
    content = await file.read()
    import re
    safe_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', file.filename)
    filename = f"{company_id}/{uuid.uuid4()}_{safe_filename}"
    
    storage = StorageService()
    media_url = storage.upload_file(content, filename, file.content_type)
    
    # 2. Determine media type
    content_type = file.content_type or ""
    if content_type.startswith("image/"):
        media_type = "image"
    elif content_type.startswith("audio/"):
        media_type = "audio"
    elif content_type.startswith("video/"):
        media_type = "video"
    else:
        media_type = "document"

    # 3. Send via Evolution API
    from app.services.evolution import EvolutionAPI
    evolution = EvolutionAPI(instance, apikey)
    
    if media_type == "audio":
        await evolution.send_presence(phone, composing=False)
        resp = await evolution.send_audio(phone, media_url)
    elif media_type == "image":
        resp = await evolution.send_image(phone, media_url)
    elif media_type == "video":
        resp = await evolution.send_video(phone, media_url)
    else:
        # evolution wrapper might not support generic document yet, fallback to text or add generic sendMedia
        raise HTTPException(status_code=400, detail="Unsupported media type")
        
    if "error" in resp:
        raise HTTPException(status_code=500, detail=f"Evolution API Error: {resp['error']}")
        
    # 4. Save to Database
    msg_result = db.table("messages").insert({
        "company_id": company_id,
        "contact_id": contact_id,
        "direction": "out",
        "content": f"[{media_type.upper()}] enviado.",
        "media_url": media_url,
        "media_type": media_type
    }).execute()
    
    return msg_result.data[0] if msg_result.data else {"status": "sent"}

# ========================
# MEDIA LIBRARY
# ========================

from pydantic import BaseModel
from typing import Optional

class MediaLibraryResponse(BaseModel):
    id: str
    company_id: str
    name: str
    media_type: str
    url: str
    created_at: str

@router.get("/media/{company_id}", response_model=list[MediaLibraryResponse])
async def list_media(company_id: str):
    """Lista as mídias salvas na biblioteca da empresa."""
    db = get_supabase()
    result = (
        db.table("media_library")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []

@router.post("/media", response_model=MediaLibraryResponse, status_code=201)
async def upload_media_to_library(
    company_id: str = Form(...),
    name: str = Form(...),
    file: UploadFile = File(...)
):
    """Faz upload de uma mídia para o MinIO e salva na biblioteca."""
    db = get_supabase()
    
    # 1. Upload to MinIO
    content = await file.read()
    
    # Sanitizar nome do arquivo (remover espaços e caracteres especiais)
    import re
    safe_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', file.filename)
    filename = f"{company_id}/lib_{uuid.uuid4()}_{safe_filename}"
    
    storage = StorageService()
    media_url = storage.upload_file(content, filename, file.content_type)
    
    # 2. Determine media type
    content_type = file.content_type or ""
    if content_type.startswith("image/"):
        media_type = "image"
    elif content_type.startswith("audio/"):
        media_type = "audio"
    elif content_type.startswith("video/"):
        media_type = "video"
    else:
        media_type = "document"

    # 3. Save to database
    result = db.table("media_library").insert({
        "company_id": company_id,
        "name": name,
        "media_type": media_type,
        "url": media_url
    }).execute()
    
    return result.data[0]

@router.delete("/media/{media_id}", status_code=204)
async def delete_media_from_library(media_id: str):
    """Deleta uma mídia da biblioteca."""
    db = get_supabase()
    db.table("media_library").delete().eq("id", media_id).execute()
    # Opcional: deletar arquivo físico do MinIO aqui se desejado
    return None

class SendMediaLibraryRequest(BaseModel):
    contact_id: str
    company_id: str
    media_id: str

@router.post("/messages/send/media_library")
async def send_media_library(body: SendMediaLibraryRequest):
    """Envia uma mídia da biblioteca para um contato."""
    db = get_supabase()
    
    # 1. Validar empresa
    company_res = db.table("companies").select("evolution_instance, evolution_apikey").eq("id", body.company_id).execute()
    if not company_res.data:
        raise HTTPException(status_code=404, detail="Company not found")
        
    company = company_res.data[0]
    instance = company.get("evolution_instance")
    apikey = company.get("evolution_apikey")
    
    # 2. Validar contato
    contact_res = db.table("contacts").select("phone").eq("id", body.contact_id).execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
        
    phone = contact_res.data[0]["phone"]
    
    # 3. Buscar a mídia na biblioteca
    media_res = db.table("media_library").select("*").eq("id", body.media_id).execute()
    if not media_res.data:
        raise HTTPException(status_code=404, detail="Media not found in library")
        
    media = media_res.data[0]
    media_url = media["url"]
    media_type = media["media_type"]
    media_name = media["name"]

    # 4. Enviar via Evolution API
    from app.services.evolution import EvolutionAPI
    evolution = EvolutionAPI(instance, apikey)
    
    logger.info(f"Enviando mídia da biblioteca: {media_type} para {phone}. URL: {media_url}")
    
    if media_type == "audio":
        await evolution.send_presence(phone, composing=False) # recording
        resp = await evolution.send_audio(phone, media_url)
    elif media_type == "image":
        resp = await evolution.send_image(phone, media_url)
    elif media_type == "video":
        resp = await evolution.send_video(phone, media_url)
    else:
        raise HTTPException(status_code=400, detail="Unsupported media type")
        
    if "error" in resp:
        logger.error(f"Erro Evolution API ao enviar mídia da biblioteca: {resp['error']}")
        raise HTTPException(status_code=500, detail=f"Evolution API Error: {resp['error']}")
        
    # 5. Salvar histórico
    msg_result = db.table("messages").insert({
        "company_id": body.company_id,
        "contact_id": body.contact_id,
        "direction": "out",
        "content": f"[{media_type.upper()}] {media_name}",
        "media_url": media_url,
        "media_type": media_type
    }).execute()
    
    return msg_result.data[0] if msg_result.data else {"status": "sent"}

# ========================
# KANBAN STAGES & TAGS
# ========================
from app.models.schemas import (
    KanbanStageCreate, KanbanStageResponse,
    TagCreate, TagResponse, ContactStageUpdate
)

@router.post("/kanban_stages", response_model=KanbanStageResponse, status_code=201)
async def create_kanban_stage(body: KanbanStageCreate):
    db = get_supabase()
    result = db.table("kanban_stages").insert(body.model_dump()).execute()
    return result.data[0]

@router.patch("/kanban_stages/{stage_id}")
async def update_kanban_stage(stage_id: str, body: dict):
    """Atualiza o nome, cor ou trigger_flow_id do estágio."""
    db = get_supabase()
    result = db.table("kanban_stages").update(body).eq("id", stage_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Stage not found")
    return result.data[0]

@router.delete("/kanban_stages/{stage_id}", status_code=204)
async def delete_kanban_stage(stage_id: str):
    db = get_supabase()
    db.table("kanban_stages").delete().eq("id", stage_id).execute()
    return None

@router.post("/tags", response_model=TagResponse, status_code=201)
async def create_tag(body: TagCreate):
    db = get_supabase()
    result = db.table("tags").insert(body.model_dump()).execute()
    return result.data[0]

@router.patch("/tags/{tag_id}")
async def update_tag(tag_id: str, body: dict):
    db = get_supabase()
    result = db.table("tags").update(body).eq("id", tag_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tag not found")
    return result.data[0]

@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: str):
    db = get_supabase()
    db.table("tags").delete().eq("id", tag_id).execute()
    return None

@router.patch("/contacts/{contact_id}/stage")
async def update_contact_stage(contact_id: str, body: ContactStageUpdate):
    """
    Atualiza o estágio do Kanban de um contato.
    Se o novo estágio tiver um trigger_flow_id, dispara o fluxo de atendimento.
    """
    db = get_supabase()
    
    # Atualiza o stage_id
    update_res = db.table("contacts").update({"stage_id": body.stage_id}).eq("id", contact_id).execute()
    if not update_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
        
    contact = update_res.data[0]
    
    # Verifica se há um gatilho de fluxo associado ao estágio
    if body.stage_id:
        stage_res = db.table("kanban_stages").select("trigger_flow_id").eq("id", body.stage_id).execute()
        if stage_res.data and stage_res.data[0].get("trigger_flow_id"):
            flow_id = stage_res.data[0]["trigger_flow_id"]
            
            # Buscar informações da empresa para EvolutionAPI
            company_res = db.table("companies").select("evolution_instance, evolution_apikey").eq("id", contact["company_id"]).execute()
            if company_res.data:
                company = company_res.data[0]
                instance = company.get("evolution_instance")
                apikey = company.get("evolution_apikey")
                
                if instance and apikey:
                    from app.services.evolution import EvolutionAPI
                    from app.services.bot_engine import execute_flow
                    import asyncio
                    
                    evolution = EvolutionAPI(instance, apikey)
                    
                    # Roda o fluxo em background para não travar a requisição
                    asyncio.create_task(execute_flow(
                        company_id=contact["company_id"],
                        contact_id=contact_id,
                        contact_phone=contact["phone"],
                        flow_id=flow_id,
                        evolution=evolution
                    ))
                    
    return contact
