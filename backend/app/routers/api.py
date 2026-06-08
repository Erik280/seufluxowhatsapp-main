"""
SeuFluxo WhatsApp — API CRUD Routes
Endpoints para gerenciar contacts, flows, steps e messages.
"""

import logging
import uuid
import re
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from app.database import get_supabase
from app.services.storage import StorageService
from app.services.lead_media_storage import LeadMediaStorage
from app.models.schemas import (
    CompanyCreate, CompanyResponse,
    UserCreate, UserResponse,
    ContactCreate, ContactResponse, ContactStatusUpdate, ContactStageUpdate,
    FlowCreate, FlowResponse,
    StepCreate, StepResponse,
    MessageCreate, MessageResponse,
    EvolutionWebhookData,
    KanbanStageCreate, KanbanStageResponse,
    TagCreate, TagResponse, ScheduleMessageRequest,
    QuickReplyCreate, QuickReplyResponse
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


@router.post("/contacts", response_model=ContactResponse, status_code=201)
async def create_contact(body: ContactCreate):
    """Cria um novo contato manualmente."""
    db = get_supabase()
    
    # 1. Limpar telefone (apenas números)
    phone = re.sub(r"\D", "", body.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone number")
        
    # 2. Verificar se já existe
    check = db.table("contacts").select("*").eq("company_id", body.company_id).eq("phone", phone).execute()
    if check.data:
        # Se já existe, não é um erro para o usuário final, apenas retornamos o contato existente
        # para que o frontend abra a conversa.
        return check.data[0]
        
    # 3. Buscar stage padrão se não enviado
    stage_id = None
    stage_res = db.table("kanban_stages").select("id").eq("company_id", body.company_id).eq("is_default", True).limit(1).execute()
    if stage_res.data:
        stage_id = stage_res.data[0]["id"]

    # 4. Inserir
    result = (
        db.table("contacts")
        .insert({
            "company_id": body.company_id,
            "phone": phone,
            "name": body.name,
            "chat_status": body.chat_status.value,
            "stage_id": stage_id
        })
        .execute()
    )
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating contact")
        
    return result.data[0]


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


class PresenceRequest(BaseModel):
    company_id: str
    presence: str = "recording"  # 'composing' ou 'recording'

@router.post("/contacts/{contact_id}/presence")
async def send_contact_presence(contact_id: str, body: PresenceRequest):
    """Envia presença (digitando/gravando) para o contato via Evolution API."""
    db = get_supabase()
    
    # 1. Obter instância da empresa
    company_res = db.table("companies").select("evolution_instance, evolution_apikey").eq("id", body.company_id).execute()
    if not company_res.data:
        raise HTTPException(status_code=404, detail="Company not found")
    
    company = company_res.data[0]
    instance = company.get("evolution_instance")
    apikey = company.get("evolution_apikey")
    
    if not instance or not apikey:
        raise HTTPException(status_code=400, detail="Evolution API not configured")
    
    # 2. Obter telefone do contato
    contact_res = db.table("contacts").select("phone").eq("id", contact_id).execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    phone = contact_res.data[0]["phone"]
    
    # 3. Enviar presença
    from app.services.evolution import EvolutionAPI
    evolution = EvolutionAPI(instance, apikey)
    is_composing = body.presence == "composing"
    await evolution.send_presence(phone, composing=is_composing)
    
    return {"status": "ok", "presence": body.presence}

# ========================
# READ STATUS
# ========================

@router.post("/contacts/{contact_id}/read")
async def mark_contact_as_read(contact_id: str):
    """Zera o contador de mensagens não lidas de um contato."""
    db = get_supabase()
    result = (
        db.table("contacts")
        .update({"unread_count": 0})
        .eq("id", contact_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "ok", "contact_id": contact_id, "unread_count": 0}

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

class SendMessageRequest(BaseModel):
    contact_id: str
    company_id: str
    text: str
    user_id: Optional[str] = None  # ID do usuário que está enviando (para assinatura)

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
    
    # 3. Verificar assinatura do usuário que enviou
    final_text = body.text
    if body.user_id:
        user_res = db.table("users").select("signature").eq("id", body.user_id).execute()
        if user_res.data and user_res.data[0].get("signature"):
            final_text = f"{body.text}\n\n{user_res.data[0]['signature']}"
    
    # 4. Enviar a mensagem pela Evolution API
    from app.services.evolution import EvolutionAPI
    evolution = EvolutionAPI(instance, apikey)
    
    # Simular digitação
    await evolution.send_presence(phone, composing=True)
    
    # Enviar
    resp = await evolution.send_text(phone, final_text)
    
    if "error" in resp:
        raise HTTPException(status_code=500, detail=f"Evolution API Error: {resp['error']}")
        
    whatsapp_id = resp.get("key", {}).get("id")
        
    # 5. Salvar no banco (com assinatura já concatenada)
    msg_result = db.table("messages").insert({
        "company_id": body.company_id,
        "contact_id": body.contact_id,
        "direction": "out",
        "content": final_text,
        "whatsapp_id": whatsapp_id,
    }).execute()
    
    # 6. Atualizar contato
    db.table("contacts").update({
        "last_message": "now()",
        "last_message_content": body.text  # Armazena o texto original sem assinatura no preview
    }).eq("id", body.contact_id).execute()
    
    return msg_result.data[0] if msg_result.data else {"status": "sent"}


@router.post("/messages/send/media")
async def send_manual_media(
    contact_id: str = Form(...),
    company_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Envia mídia (imagem, áudio, vídeo) pelo painel.
    Agora usa Supabase Storage ( LeadMediaStorage ) para armazenamento efêmero (14 dias).
    """
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
    
    # 1. Determine media type
    content_type = file.content_type or ""
    if content_type.startswith("image/"):
        media_type = "image"
    elif content_type.startswith("audio/"):
        media_type = "audio"
    elif content_type.startswith("video/"):
        media_type = "video"
    else:
        media_type = "document"

    # 2. Upload to Supabase Storage (LeadMediaStorage) - EFÊMERO
    content = await file.read()
    
    import anyio
    storage = LeadMediaStorage()
    
    # Gerar um ID temporário para o path
    temp_msg_id = str(uuid.uuid4())
    
    # Executar upload (que tem compressão síncrona) em thread para não travar o loop
    storage_res = await anyio.to_thread.run_sync(
        storage.upload_lead_media,
        content,
        media_type,
        content_type,
        company_id,
        temp_msg_id
    )
    
    media_url = storage_res["signed_url"]
    storage_path = storage_res["storage_path"]
    expires_at = storage_res["expires_at"]

    # 3. Send via Evolution API
    from app.services.evolution import EvolutionAPI
    evolution = EvolutionAPI(instance, apikey)
    
    logger.info(f"Enviando mídia manual: {media_type} para {phone}. URL: {media_url}")
    
    if media_type == "audio":
        await evolution.send_presence(phone, composing=False)
        resp = await evolution.send_audio(phone, media_url)
    elif media_type == "image":
        resp = await evolution.send_image(phone, media_url)
    elif media_type == "video":
        resp = await evolution.send_video(phone, media_url)
    else:
        original_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', file.filename or "documento")
        resp = await evolution.send_document(phone, media_url, filename=original_filename)
        
    if "error" in resp:
        logger.error(f"Erro Evolution API: {resp['error']}")
        raise HTTPException(status_code=500, detail=f"Evolution API Error: {resp['error']}")
        
    whatsapp_id = resp.get("key", {}).get("id")
        
    # 4. Save to Database
    original_name = file.filename or "documento"
    content_text = f"[{media_type.upper()}] {original_name}"
    msg_result = db.table("messages").insert({
        "company_id": company_id,
        "contact_id": contact_id,
        "direction": "out",
        "content": content_text,
        "media_url": media_url,
        "media_type": media_type,
        "media_storage_path": storage_path,
        "media_expires_at": expires_at,
        "whatsapp_id": whatsapp_id
    }).execute()
    
    # 5. Atualizar contato
    db.table("contacts").update({
        "last_message": "now()",
        "last_message_content": f"[{media_type.capitalize()}]"
    }).eq("id", contact_id).execute()
    
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
    safe_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', file.filename)
    filename = f"{company_id}/lib_{uuid.uuid4()}_{safe_filename}"
    
    import anyio
    storage = StorageService()
    media_url = await anyio.to_thread.run_sync(
        storage.upload_file,
        content,
        filename,
        file.content_type
    )
    
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
        # Fallback para Base64 se a Evolution API não conseguir baixar a tempo (timeout de Axios)
        if "error" in resp and "Failed to fetch stream" in resp["error"]:
            logger.warning(f"Fallback Base64 para vídeo {media_url}")
            import httpx
            import base64
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    vid_res = await client.get(media_url)
                    vid_res.raise_for_status()
                    b64 = base64.b64encode(vid_res.content).decode("utf-8")
                    b64_url = f"data:video/mp4;base64,{b64}"
                    resp = await evolution.send_video(phone, b64_url)
            except Exception as e:
                logger.error(f"Erro no fallback Base64 do vídeo: {e}")
    else:
        # Documento (PDF, DOCX, etc.) da biblioteca
        resp = await evolution.send_document(phone, media_url, filename=media_name)
        
    if "error" in resp:
        logger.error(f"Erro Evolution API ao enviar mídia da biblioteca: {resp['error']}")
        raise HTTPException(status_code=500, detail=f"Evolution API Error: {resp['error']}")
        
    whatsapp_id = resp.get("key", {}).get("id")
        
    # 5. Salvar histórico
    msg_result = db.table("messages").insert({
        "company_id": body.company_id,
        "contact_id": body.contact_id,
        "direction": "out",
        "content": f"[{media_type.upper()}] {media_name}",
        "media_url": media_url,
        "media_type": media_type,
        "whatsapp_id": whatsapp_id
    }).execute()
    
    # 6. Atualizar contato
    db.table("contacts").update({
        "last_message": "now()",
        "last_message_content": f"[{media_type.capitalize()}]"
    }).eq("id", body.contact_id).execute()
    
    return msg_result.data[0] if msg_result.data else {"status": "sent"}


class SendMediaUrlRequest(BaseModel):
    contact_id: str
    company_id: str
    media_url: str
    media_type: str
    media_name: Optional[str] = "midia"

@router.post("/messages/send/media_url")
async def send_media_url(body: SendMediaUrlRequest):
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
    
    # 3. Enviar via Evolution API
    from app.services.evolution import EvolutionAPI
    evolution = EvolutionAPI(instance, apikey)
    
    logger.info(f"Enviando mídia por URL: {body.media_type} para {phone}. URL: {body.media_url}")
    
    if body.media_type == "audio":
        await evolution.send_presence(phone, composing=False)
        resp = await evolution.send_audio(phone, body.media_url)
    elif body.media_type == "image":
        resp = await evolution.send_image(phone, body.media_url)
    elif body.media_type == "video":
        resp = await evolution.send_video(phone, body.media_url)
        # Fallback para Base64 se falhar (Axios timeout no Evolution)
        if "error" in resp and "Failed to fetch stream" in resp["error"]:
            logger.warning(f"Fallback Base64 para vídeo por URL {body.media_url}")
            import httpx
            import base64
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    vid_res = await client.get(body.media_url)
                    vid_res.raise_for_status()
                    b64 = base64.b64encode(vid_res.content).decode("utf-8")
                    b64_url = f"data:video/mp4;base64,{b64}"
                    resp = await evolution.send_video(phone, b64_url)
            except Exception as e:
                logger.error(f"Erro no fallback Base64 do vídeo por URL: {e}")
    else:
        resp = await evolution.send_document(phone, body.media_url, filename=body.media_name or "documento")
        
    if "error" in resp:
        logger.error(f"Erro Evolution API ao enviar mídia por URL: {resp['error']}")
        raise HTTPException(status_code=500, detail=f"Evolution API Error: {resp['error']}")
        
    whatsapp_id = resp.get("key", {}).get("id")
        
    # 4. Salvar histórico
    content_text = f"[{body.media_type.upper()}] {body.media_name or 'Arquivo'}"
    msg_result = db.table("messages").insert({
        "company_id": body.company_id,
        "contact_id": body.contact_id,
        "direction": "out",
        "content": content_text,
        "media_url": body.media_url,
        "media_type": body.media_type,
        "whatsapp_id": whatsapp_id
    }).execute()
    
    # 5. Atualizar contato
    db.table("contacts").update({
        "last_message": "now()",
        "last_message_content": f"[{body.media_type.capitalize()}]"
    }).eq("id", body.contact_id).execute()
    
    return msg_result.data[0] if msg_result.data else {"status": "sent"}


from app.models.schemas import ReactMessageRequest

@router.post("/messages/{message_id}/react")
async def react_message(message_id: str, body: ReactMessageRequest):
    """Envia uma reação de mensagem via Evolution API e atualiza no banco."""
    db = get_supabase()
    
    # 1. Buscar a mensagem para obter o whatsapp_id, contact_id, company_id e direction
    msg_res = db.table("messages").select("*").eq("id", message_id).execute()
    if not msg_res.data:
        raise HTTPException(status_code=404, detail="Message not found")
    
    msg = msg_res.data[0]
    whatsapp_id = msg.get("whatsapp_id")
    direction = msg.get("direction")
    contact_id = msg.get("contact_id")
    company_id = msg.get("company_id")
    
    if not whatsapp_id:
        raise HTTPException(status_code=400, detail="This message does not have a WhatsApp ID to react to.")
    
    # 2. Obter dados da empresa (instância e apikey)
    company_res = db.table("companies").select("evolution_instance, evolution_apikey").eq("id", company_id).execute()
    if not company_res.data:
        raise HTTPException(status_code=404, detail="Company not found")
    
    company = company_res.data[0]
    instance = company.get("evolution_instance")
    apikey = company.get("evolution_apikey")
    
    if not instance or not apikey:
        raise HTTPException(status_code=400, detail="Evolution API not configured")
    
    # 3. Obter telefone do contato
    contact_res = db.table("contacts").select("phone").eq("id", contact_id).execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    phone = contact_res.data[0]["phone"]
    
    # 4. Chamar Evolution API
    from app.services.evolution import EvolutionAPI
    evolution = EvolutionAPI(instance, apikey)
    
    from_me = direction == "out"
    resp = await evolution.send_reaction(phone, whatsapp_id, from_me, body.reaction)
    
    if "error" in resp:
        raise HTTPException(status_code=500, detail=f"Evolution API Error: {resp['error']}")
    
    # 5. Salvar reação no banco de dados
    db.table("messages").update({
        "reaction": body.reaction or None
    }).eq("id", message_id).execute()
    
    return {"status": "ok", "reaction": body.reaction}


@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(message_id: str):
    """Apaga uma mensagem do banco de dados."""
    db = get_supabase()
    db.table("messages").delete().eq("id", message_id).execute()
    return None


from app.models.schemas import EditMessageRequest
from datetime import datetime, timezone

@router.patch("/messages/{message_id}/edit")
async def edit_message(message_id: str, body: EditMessageRequest):
    """
    Edita o conteúdo de uma mensagem de texto já enviada.
    Salva o conteúdo original, marca como editada e registra o horário da edição.
    Nota: A edição é apenas interna (painel); não altera a mensagem no WhatsApp do destinatário.
    """
    db = get_supabase()

    new_content = body.new_content.strip()
    if not new_content:
        raise HTTPException(status_code=400, detail="O novo conteúdo não pode ser vazio.")

    # 1. Buscar a mensagem atual
    msg_res = db.table("messages").select("*").eq("id", message_id).execute()
    if not msg_res.data:
        raise HTTPException(status_code=404, detail="Message not found")

    msg = msg_res.data[0]

    # 2. Apenas mensagens de texto (sem mídia) podem ser editadas
    if msg.get("media_type"):
        raise HTTPException(status_code=400, detail="Apenas mensagens de texto podem ser editadas.")

    # 3. Guardar conteúdo original (apenas na primeira edição)
    original_content = msg.get("original_content") or msg.get("content")

    # 4. Atualizar no banco
    update_data = {
        "content": new_content,
        "is_edited": True,
        "edited_at": datetime.now(timezone.utc).isoformat(),
        "original_content": original_content,
    }

    result = db.table("messages").update(update_data).eq("id", message_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao editar mensagem.")

    logger.info(f"Mensagem {message_id} editada. Original: '{original_content}' → Novo: '{new_content}'")
    return result.data[0]



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
    """Apaga um estágio do Kanban. Stages protegidos (is_protected=True) não podem ser apagados."""
    db = get_supabase()
    # Verificar se é protegido
    check = db.table("kanban_stages").select("is_protected, name").eq("id", stage_id).execute()
    if check.data and check.data[0].get("is_protected"):
        raise HTTPException(
            status_code=403,
            detail=f"O estágio '{check.data[0]['name']}' é protegido e não pode ser apagado."
        )
    db.table("kanban_stages").delete().eq("id", stage_id).execute()
    return None


class EnsureDefaultStageRequest(BaseModel):
    company_id: str

@router.post("/kanban_stages/ensure_default")
async def ensure_default_stage(body: EnsureDefaultStageRequest):
    """
    Garante que a empresa tenha um estágio padrão 'NOVOS LEADS'.
    Chamado no carregamento do Kanban para garantir consistência.
    """
    db = get_supabase()
    res = (
        db.table("kanban_stages")
        .select("*")
        .eq("company_id", body.company_id)
        .eq("is_default", True)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]  # Já existe

    # Criar
    new_stage = db.table("kanban_stages").insert({
        "company_id": body.company_id,
        "name": "NOVOS LEADS",
        "color": "#00E5CC",
        "order_index": 0,
        "is_default": True,
        "is_protected": True,
        "entry_keywords": [],
    }).execute()
    logger.info(f"[ensure_default_stage] NOVOS LEADS criado para empresa {body.company_id}")
    return new_stage.data[0]

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

from fastapi import BackgroundTasks

@router.patch("/contacts/{contact_id}/stage")
async def update_contact_stage(contact_id: str, body: ContactStageUpdate, background_tasks: BackgroundTasks):
    """
    Atualiza o estágio do Kanban de um contato.
    Se o novo estágio tiver is_trigger_enabled=true, muda o chat_status
    para 'bot' e dispara o fluxo de automação automaticamente.
    Se o novo estágio tiver tag_ids_to_add, adiciona as tags ao lead automaticamente.
    """
    try:
        db = get_supabase()

        # 1. Atualiza o stage_id do contato
        update_res = db.table("contacts").update({"stage_id": body.stage_id}).eq("id", contact_id).execute()
        if not update_res.data:
            raise HTTPException(status_code=404, detail="Contact not found")

        contact = update_res.data[0]

        # 2. Verifica se o novo estágio tem automações configuradas
        if body.stage_id:
            stage_res = (
                db.table("kanban_stages")
                .select("trigger_flow_id, is_trigger_enabled, tag_ids_to_add")
                .eq("id", body.stage_id)
                .execute()
            )

            if stage_res.data:
                stage = stage_res.data[0]

                # 2a. Aplicar tags automáticas ao lead (se configuradas)
                tag_ids_to_add = stage.get("tag_ids_to_add") or []
                if tag_ids_to_add:
                    logger.info(f"[Kanban] Aplicando tags automáticas ao contato {contact_id}: {tag_ids_to_add}")
                    for tag_id in tag_ids_to_add:
                        existing = (
                            db.table("contact_tags")
                            .select("contact_id")
                            .eq("contact_id", contact_id)
                            .eq("tag_id", tag_id)
                            .execute()
                        )
                        if not existing.data:
                            db.table("contact_tags").insert({
                                "contact_id": contact_id,
                                "tag_id": tag_id
                            }).execute()

                # 2b. Disparar fluxo de automação (se configurado)
                if stage.get("is_trigger_enabled") and stage.get("trigger_flow_id"):
                    flow_id = stage["trigger_flow_id"]
                    logger.info(
                        f"[Kanban] Fluxo trigger ativado: contato {contact_id} → estágio {body.stage_id} → fluxo {flow_id}"
                    )

                    db.table("contacts").update({"chat_status": "bot"}).eq("id", contact_id).execute()
                    contact["chat_status"] = "bot"

                    company_res = (
                        db.table("companies")
                        .select("evolution_instance, evolution_apikey")
                        .eq("id", contact["company_id"])
                        .execute()
                    )
                    if company_res.data:
                        company = company_res.data[0]
                        instance = company.get("evolution_instance")
                        apikey = company.get("evolution_apikey")

                        if instance and apikey:
                            from app.services.evolution import EvolutionAPI
                            from app.services.bot_engine import execute_flow

                            evolution = EvolutionAPI(instance, apikey)
                            background_tasks.add_task(
                                execute_flow,
                                company_id=contact["company_id"],
                                contact_id=contact_id,
                                contact_phone=contact["phone"],
                                flow_id=flow_id,
                                evolution=evolution,
                                contact=contact,
                            )
                            logger.info(f"[Kanban] execute_flow agendado para contato {contact_id}")
                        else:
                            logger.warning(f"[Kanban] Empresa {contact['company_id']} sem Evolution API configurada.")
                    else:
                        logger.warning(f"[Kanban] Empresa {contact['company_id']} não encontrada.")

        tags_res = (
            db.table("contact_tags")
            .select("tag_id, tags(id, name, color)")
            .eq("contact_id", contact_id)
            .execute()
        )
        contact["contact_tags"] = tags_res.data or []

        return contact
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro CRITICO no update_contact_stage: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



# ========================
# CRM — Edição de Dados do Lead
# ========================

class CRMUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    tag_ids: Optional[list[str]] = None  # lista de UUIDs de tags

from typing import Optional

@router.patch("/contacts/{contact_id}/crm")
async def update_contact_crm(contact_id: str, body: CRMUpdate):
    """Atualiza os campos CRM de um contato: nome, email, notes e tags."""
    db = get_supabase()

    # 1. Atualizar campos diretos
    update_data = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.email is not None:
        update_data["email"] = body.email
    if body.notes is not None:
        update_data["notes"] = body.notes

    if update_data:
        result = db.table("contacts").update(update_data).eq("id", contact_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Contact not found")

    # 2. Atualizar tags via junction table contact_tags
    if body.tag_ids is not None:
        # Remover todas as tags atuais
        db.table("contact_tags").delete().eq("contact_id", contact_id).execute()
        # Inserir as novas tags
        if body.tag_ids:
            rows = [{"contact_id": contact_id, "tag_id": tid} for tid in body.tag_ids]
            db.table("contact_tags").insert(rows).execute()

    # 3. Retornar contato atualizado com tags
    contact_res = db.table("contacts").select("*").eq("id", contact_id).execute()
    contact = contact_res.data[0] if contact_res.data else {}

    tags_res = (
        db.table("contact_tags")
        .select("tag_id, tags(id, name, color)")
        .eq("contact_id", contact_id)
        .execute()
    )
    contact["tags"] = [row["tags"] for row in (tags_res.data or []) if row.get("tags")]

    return contact


@router.get("/contacts/{contact_id}/crm")
async def get_contact_crm(contact_id: str):
    """Retorna dados completos do CRM de um contato (incluindo tags)."""
    db = get_supabase()

    contact_res = db.table("contacts").select("*").eq("id", contact_id).execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")

    contact = contact_res.data[0]

    tags_res = (
        db.table("contact_tags")
        .select("tag_id, tags(id, name, color)")
        .eq("contact_id", contact_id)
        .execute()
    )
    contact["tags"] = [row["tags"] for row in (tags_res.data or []) if row.get("tags")]

    return contact

@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(contact_id: str):
    """Apaga um contato completamente do sistema e todo o seu histórico."""
    db = get_supabase()
    result = db.table("contacts").delete().eq("id", contact_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    return None



# ========================
# Agendamento de Mensagens / Fluxos
# ========================

@router.post("/contacts/{contact_id}/schedule")
async def schedule_contact_message(contact_id: str, body: ScheduleMessageRequest):
    """
    Agenda uma mensagem ou um pequeno fluxo para um lead específico em uma data futura.
    Se 'save_as_flow' for verdadeiro ou passos forem fornecidos sem um 'flow_id', 
    cria um novo fluxo e agenda ele.
    """
    db = get_supabase()
    
    # 1. Recupera o contact e company
    contact_res = db.table("contacts").select("company_id").eq("id", contact_id).execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    company_id = contact_res.data[0]["company_id"]

    final_flow_id = body.flow_id

    # 2. Se não tem flow_id, mas tem steps, precisamos criar um fluxo na hora
    if not final_flow_id and body.steps:
        flow_name = body.flow_name if body.flow_name and body.save_as_flow else f"[Agendamento] {contact_id} - {body.scheduled_for.strftime('%Y-%m-%d %H:%M')}"
        
        flow_res = db.table("chat_flows").insert({
            "company_id": company_id,
            "name": flow_name,
            "trigger_keyword": "",
            "is_active": body.save_as_flow  # se não é pra salvar modelo, deixa inativo (oculto)
        }).execute()
        
        final_flow_id = flow_res.data[0]["id"]
        
        # Insere os steps
        steps_data = []
        for i, step in enumerate(body.steps):
            steps_data.append({
                "flow_id": final_flow_id,
                "type": step.type.value,
                "content": step.content or "",
                "delay_duration": step.delay_duration,
                "order_index": i
            })
        if steps_data:
            db.table("flow_steps").insert(steps_data).execute()

    # 3. Cria o agendamento
    try:
        db.table("scheduled_messages").insert({
            "company_id": company_id,
            "contact_id": contact_id,
            "flow_id": final_flow_id,
            "scheduled_for": body.scheduled_for.isoformat(),
            "status": "pending"
        }).execute()
    except Exception as e:
        logger.error(f"Erro ao agendar: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao agendar mensagem")

    return {"message": "Agendado com sucesso", "flow_id": final_flow_id}


# ========================
# Disparo Manual de Fluxo (sem gatilho)
# ========================

class TriggerFlowRequest(BaseModel):
    flow_id: str

@router.post("/contacts/{contact_id}/trigger-flow")
async def trigger_flow_for_contact(contact_id: str, body: TriggerFlowRequest, background_tasks: BackgroundTasks):
    """
    Dispara imediatamente um fluxo existente para um contato específico,
    sem precisar de gatilho (keyword ou estágio). Acionado manualmente pelo usuário.
    """
    db = get_supabase()

    # 1. Buscar dados do contato
    contact_res = db.table("contacts").select("*").eq("id", contact_id).execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    contact = contact_res.data[0]
    company_id = contact["company_id"]

    # 2. Verificar se o fluxo existe e pertence à empresa
    flow_res = db.table("chat_flows").select("id, name, is_active").eq("id", body.flow_id).eq("company_id", company_id).execute()
    if not flow_res.data:
        raise HTTPException(status_code=404, detail="Fluxo não encontrado ou não pertence a esta empresa")

    # 3. Buscar configuração da Evolution API
    company_res = db.table("companies").select("evolution_instance, evolution_apikey").eq("id", company_id).execute()
    if not company_res.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    company = company_res.data[0]
    instance = company.get("evolution_instance")
    apikey = company.get("evolution_apikey")

    if not instance or not apikey:
        raise HTTPException(status_code=400, detail="Evolution API não configurada para esta empresa")

    # 4. Disparar o fluxo em background
    from app.services.evolution import EvolutionAPI
    from app.services.bot_engine import execute_flow

    evolution = EvolutionAPI(instance, apikey)
    background_tasks.add_task(
        execute_flow,
        company_id=company_id,
        contact_id=contact_id,
        contact_phone=contact["phone"],
        flow_id=body.flow_id,
        evolution=evolution,
        contact=contact,
    )

    flow_name = flow_res.data[0]["name"]
    logger.info(f"[Manual Trigger] Fluxo '{flow_name}' ({body.flow_id}) disparado manualmente para contato {contact_id}")

    return {"message": f"Fluxo '{flow_name}' iniciado com sucesso para o contato.", "flow_id": body.flow_id}


# ========================
# TAGS
# ========================

class TagCreate(BaseModel):
    company_id: str
    name: str
    color: str = "#00FF88"

@router.get("/tags/{company_id}")
async def list_tags(company_id: str):
    """Lista todas as tags de uma empresa."""
    db = get_supabase()
    result = db.table("tags").select("*").eq("company_id", company_id).order("name").execute()
    return result.data or []

@router.post("/tags", status_code=201)
async def create_tag(body: TagCreate):
    """Cria uma nova tag."""
    db = get_supabase()
    result = db.table("tags").insert({
        "company_id": body.company_id,
        "name": body.name,
        "color": body.color,
    }).execute()
    return result.data[0]

@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: str):
    """Remove uma tag (e suas associações via CASCADE)."""
    db = get_supabase()
    db.table("contact_tags").delete().eq("tag_id", tag_id).execute()
    db.table("tags").delete().eq("id", tag_id).execute()
    return None


# ========================
# AGENDAMENTOS (Scheduled Messages)
# ========================

class ScheduledMessageCreate(BaseModel):
    company_id: str
    contact_id: str
    flow_id: Optional[str] = None
    content: Optional[str] = None
    scheduled_for: str  # ISO datetime string

@router.get("/scheduled/{company_id}")
async def list_scheduled(company_id: str):
    """Lista agendamentos de uma empresa."""
    db = get_supabase()
    result = (
        db.table("scheduled_messages")
        .select("*, contacts(name, phone)")
        .eq("company_id", company_id)
        .order("scheduled_for", desc=False)
        .execute()
    )
    return result.data or []

@router.post("/scheduled", status_code=201)
async def create_scheduled(body: ScheduledMessageCreate):
    """Cria um novo agendamento de mensagem."""
    db = get_supabase()
    if not body.flow_id and not body.content:
        raise HTTPException(status_code=400, detail="É necessário flow_id ou content.")

    result = db.table("scheduled_messages").insert({
        "company_id": body.company_id,
        "contact_id": body.contact_id,
        "flow_id": body.flow_id,
        "content": body.content,
        "scheduled_for": body.scheduled_for,
        "status": "pending",
    }).execute()
    return result.data[0]

@router.delete("/scheduled/{scheduled_id}", status_code=204)
async def cancel_scheduled(scheduled_id: str):
    """Cancela (marca como 'cancelled') um agendamento."""
    db = get_supabase()
    db.table("scheduled_messages").update({"status": "cancelled"}).eq("id", scheduled_id).execute()
    return None


# ========================
# CAMPANHAS
# ========================

class CampaignCreate(BaseModel):
    company_id: str
    name: str
    target_tag_ids: list[str] = []
    min_inactive_hours: int = 0
    message_variants: list[str] = []
    flow_id: Optional[str] = None
    interval_min_seconds: int = 30
    interval_max_seconds: int = 120
    scheduled_for: Optional[str] = None  # ISO datetime, None = imediato

@router.get("/campaigns/{company_id}")
async def list_campaigns(company_id: str):
    """Lista campanhas de uma empresa."""
    db = get_supabase()
    result = (
        db.table("campaigns")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []

@router.post("/campaigns", status_code=201)
async def create_campaign(body: CampaignCreate):
    """Cria uma nova campanha."""
    db = get_supabase()
    if not body.message_variants and not body.flow_id:
        raise HTTPException(status_code=400, detail="É necessário message_variants ou flow_id.")

    from datetime import datetime, timezone
    scheduled = body.scheduled_for or datetime.now(timezone.utc).isoformat()

    result = db.table("campaigns").insert({
        "company_id": body.company_id,
        "name": body.name,
        "target_tag_ids": body.target_tag_ids,
        "min_inactive_hours": body.min_inactive_hours,
        "message_variants": body.message_variants,
        "flow_id": body.flow_id,
        "interval_min_seconds": body.interval_min_seconds,
        "interval_max_seconds": body.interval_max_seconds,
        "status": "scheduled",
        "scheduled_for": scheduled,
    }).execute()
    return result.data[0]

@router.delete("/campaigns/{campaign_id}", status_code=204)
async def cancel_campaign(campaign_id: str):
    """Cancela uma campanha."""
    db = get_supabase()
    db.table("campaigns").update({"status": "cancelled"}).eq("id", campaign_id).execute()
    db.table("scheduled_messages").update({"status": "cancelled"}).eq("campaign_id", campaign_id).eq("status", "pending").execute()
    return None

# ========================
# Quick Replies
# ========================

@router.get("/quick-replies/{company_id}", response_model=list[QuickReplyResponse])
async def list_quick_replies(company_id: str):
    db = get_supabase()
    res = db.table("quick_replies").select("*").eq("company_id", company_id).order("shortcut").execute()
    return res.data or []

@router.post("/quick-replies", response_model=QuickReplyResponse, status_code=201)
async def create_quick_reply(body: QuickReplyCreate):
    db = get_supabase()
    
    # Check duplicate shortcut
    check = db.table("quick_replies").select("id").eq("company_id", body.company_id).eq("shortcut", body.shortcut).execute()
    if check.data:
        raise HTTPException(status_code=400, detail="Já existe uma resposta rápida com este atalho")
    
    content = body.content
    promoted_url = None
    promoted_type = None
    
    # Se o conteúdo parecer ser uma URL de mídia efêmera do Supabase Storage, 
    # precisamos "promovê-la" para o MinIO (Media Library) para que não expire.
    if "supabase.co/storage/v1/object/sign/lead-media" in content or "/storage/v1/object/public/lead-media" in content:
        try:
            logger.info(f"Promovendo mídia efêmera para Media Library: {content}")
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                media_resp = await client.get(content)
                if media_resp.status_code == 200:
                    media_bytes = media_resp.content
                    content_type = media_resp.headers.get("content-type", "application/octet-stream")
                    
                    # Upload para MinIO
                    from app.services.storage import StorageService
                    minio = StorageService()
                    
                    # Nome amigável
                    ext = content_type.split("/")[-1] if "/" in content_type else "bin"
                    filename = f"{body.company_id}/quick_{uuid.uuid4()}.{ext}"
                    
                    import anyio
                    new_url = await anyio.to_thread.run_sync(
                        minio.upload_file,
                        media_bytes,
                        filename,
                        content_type
                    )
                    
                    # Determine media type para salvar na biblioteca
                    media_type = "document"
                    if content_type.startswith("image/"): media_type = "image"
                    elif content_type.startswith("audio/"): media_type = "audio"
                    elif content_type.startswith("video/"): media_type = "video"
                    
                    # Salvar na biblioteca de mídias também para o usuário ver
                    db.table("media_library").insert({
                        "company_id": body.company_id,
                        "name": f"QR: {body.shortcut}",
                        "media_type": media_type,
                        "url": new_url
                    }).execute()
                    
                    content = new_url
                    promoted_url = new_url
                    promoted_type = media_type
                    logger.info(f"Mídia promovida com sucesso para {new_url}")
        except Exception as e:
            logger.error(f"Erro ao promover mídia para quick reply: {e}")
            # Se falhar a promoção, salvamos a URL original (pode expirar, mas é o fallback)
            pass

    res = db.table("quick_replies").insert({
        "company_id": body.company_id,
        "shortcut": body.shortcut,
        "content": content,
        "media_url": body.media_url or promoted_url,
        "media_type": body.media_type or promoted_type
    }).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Erro ao criar resposta rápida")
    return res.data[0]

@router.delete("/quick-replies/{reply_id}", status_code=204)
async def delete_quick_reply(reply_id: str):
    db = get_supabase()
    res = db.table("quick_replies").delete().eq("id", reply_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Resposta rápida não encontrada")
    return None

# ========================
# KNOWLEDGE BASE (RAG)
# ========================

class KnowledgeTextCreate(BaseModel):
    company_id: str
    title: str
    content: str

class KnowledgeResponse(BaseModel):
    id: str
    company_id: str
    title: str
    content: str
    created_at: str

@router.get("/knowledge/{company_id}", response_model=list[KnowledgeResponse])
async def list_knowledge(company_id: str):
    db = get_supabase()
    res = db.table("company_knowledge").select("id, company_id, title, content, created_at").eq("company_id", company_id).order("created_at", desc=True).execute()
    return res.data or []

@router.post("/knowledge/text", response_model=KnowledgeResponse, status_code=201)
async def create_knowledge_text(body: KnowledgeTextCreate):
    import os
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY não configurada no servidor. É necessária para gerar o vetor de conhecimento.")
        
    from langchain_openai import OpenAIEmbeddings
    try:
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        vector = embeddings.embed_query(body.content)
    except Exception as e:
        logger.error(f"Erro ao gerar embedding: {e}")
        raise HTTPException(status_code=500, detail="Erro ao gerar vetor de IA. Verifique sua chave da OpenAI.")

    db = get_supabase()
    res = db.table("company_knowledge").insert({
        "company_id": body.company_id,
        "title": body.title,
        "content": body.content,
        "embedding": vector
    }).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Erro ao salvar na base de dados.")
        
    # Remover o embedding da resposta para não travar o frontend com array gigante
    data = res.data[0]
    data.pop("embedding", None)
    return data

@router.post("/knowledge/pdf", status_code=201)
async def create_knowledge_pdf(
    company_id: str = Form(...),
    file: UploadFile = File(...)
):
    import os
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY não configurada no servidor.")
        
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="O arquivo deve ser um PDF.")
        
    content_bytes = await file.read()
    import io
    import pypdf
    from langchain_openai import OpenAIEmbeddings
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    
    # 1. Extrair texto do PDF
    try:
        pdf_reader = pypdf.PdfReader(io.BytesIO(content_bytes))
        full_text = ""
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"
    except Exception as e:
        logger.error(f"Erro ao ler PDF: {e}")
        raise HTTPException(status_code=400, detail="Não foi possível ler o texto deste PDF.")
        
    if not full_text.strip():
        raise HTTPException(status_code=400, detail="Nenhum texto extraído do PDF.")
        
    # 2. Dividir em pedaços (Chunks) se for muito grande
    splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=150)
    chunks = splitter.split_text(full_text)
    
    if not chunks:
        raise HTTPException(status_code=400, detail="Falha ao processar texto do PDF.")
        
    # 3. Gerar embeddings em lote
    try:
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        vectors = embeddings.embed_documents(chunks)
    except Exception as e:
        logger.error(f"Erro ao gerar embeddings do PDF: {e}")
        raise HTTPException(status_code=500, detail="Erro ao processar IA do documento.")
        
    # 4. Salvar no banco
    db = get_supabase()
    rows = []
    base_title = file.filename
    
    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        title = base_title if len(chunks) == 1 else f"{base_title} (Parte {i+1})"
        rows.append({
            "company_id": company_id,
            "title": title,
            "content": chunk,
            "embedding": vector
        })
        
    # Inserir em lotes ou de uma vez (Supabase aceita lista de dicts)
    res = db.table("company_knowledge").insert(rows).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Erro ao salvar conhecimentos no banco.")
        
    return {"message": f"PDF processado com sucesso. {len(chunks)} trechos extraídos."}

@router.delete("/knowledge/{knowledge_id}", status_code=204)
async def delete_knowledge(knowledge_id: str):
    db = get_supabase()
    res = db.table("company_knowledge").delete().eq("id", knowledge_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return None
