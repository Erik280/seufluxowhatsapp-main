"""
SeuFluxo WhatsApp — Webhook Router
Recebe mensagens do WhatsApp via Evolution API e processa via bot ou humano.
"""

import asyncio
import logging
from fastapi import APIRouter, Request, BackgroundTasks
from app.database import get_supabase
from app.services.evolution import EvolutionAPI
from app.services.bot_engine import execute_flow, find_matching_flow

logger = logging.getLogger("seufluxo.webhook")

router = APIRouter(prefix="/api/webhook", tags=["Webhook"])


@router.post("/evolution")
async def evolution_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Endpoint que recebe mensagens da Evolution API.

    Fluxo:
    1. Extrai dados da mensagem (remetente, texto, instância)
    2. Identifica a empresa pela instância
    3. Busca ou cria o contato
    4. Salva a mensagem recebida
    5. Verifica chat_status:
       - 'human' → apenas salva (Supabase Realtime entrega ao frontend)
       - 'bot'   → executa fluxo em background (asyncio.sleep não bloqueia)
    """
    try:
        payload = await request.json()
    except Exception:
        return {"status": "error", "message": "Invalid JSON"}

    # ── Validar evento ──
    event = payload.get("event")
    if event != "messages.upsert":
        # Ignora eventos que não são mensagens (ex: status, presence, etc.)
        return {"status": "ignored", "event": event}

    data = payload.get("data", {})
    instance_name = payload.get("instance")

    # ── Extrair dados da mensagem ──
    key = data.get("key", {})
    is_from_me = key.get("fromMe", False)
    if is_from_me:
        # Ignora mensagens enviadas por nós mesmos
        return {"status": "ignored", "reason": "fromMe"}

    remote_jid = key.get("remoteJid", "")
    # Extrair apenas o número (remove @s.whatsapp.net)
    phone = remote_jid.split("@")[0] if "@" in remote_jid else remote_jid

    if not phone or phone == "status":
        return {"status": "ignored", "reason": "invalid_phone"}

    # Texto da mensagem (pode vir em diferentes campos)
    message_obj = data.get("message", {})
    message_text = (
        message_obj.get("conversation")
        or message_obj.get("extendedTextMessage", {}).get("text")
        or ""
    )
    push_name = data.get("pushName", "")

    logger.info(f"[{instance_name}] Mensagem de {phone}: {message_text[:80]}")

    db = get_supabase()

    # ── 1. Identificar a empresa pela instância ──
    company_result = (
        db.table("companies")
        .select("*")
        .eq("evolution_instance", instance_name)
        .limit(1)
        .execute()
    )
    if not company_result.data:
        logger.warning(f"Instância '{instance_name}' não encontrada no banco.")
        return {"status": "error", "message": "Unknown instance"}

    company = company_result.data[0]
    company_id = company["id"]
    evolution_apikey = company.get("evolution_apikey", "")

    # ── 2. Buscar ou criar contato ──
    contact_result = (
        db.table("contacts")
        .select("*")
        .eq("company_id", company_id)
        .eq("phone", phone)
        .limit(1)
        .execute()
    )

    if contact_result.data:
        contact = contact_result.data[0]
        # Atualizar nome se veio pushName e não tinha
        if push_name and not contact.get("name"):
            db.table("contacts").update({"name": push_name}).eq("id", contact["id"]).execute()
            contact["name"] = push_name
    else:
        # Criar novo contato
        new_contact = (
            db.table("contacts")
            .insert({
                "company_id": company_id,
                "phone": phone,
                "name": push_name or None,
                "chat_status": "bot",
            })
            .execute()
        )
        contact = new_contact.data[0]

    contact_id = contact["id"]
    chat_status = contact.get("chat_status", "bot")

    # ── 3. Salvar mensagem recebida ──
    db.table("messages").insert({
        "company_id": company_id,
        "contact_id": contact_id,
        "direction": "in",
        "content": message_text or None,
    }).execute()

    # Atualizar last_message do contato
    db.table("contacts").update({
        "last_message": "now()",
    }).eq("id", contact_id).execute()

    # ── 4. Rotear conforme chat_status ──

    if chat_status == "human":
        # Modo humano: não faz nada — Supabase Realtime entrega ao frontend
        logger.info(f"[{phone}] Modo HUMANO — mensagem salva para atendente.")
        return {"status": "ok", "mode": "human"}

    else:
        # Modo bot: buscar fluxo e executar em background
        if message_text:
            flow = find_matching_flow(company_id, message_text)
            if flow:
                evo = EvolutionAPI(
                    instance=instance_name,
                    apikey=evolution_apikey,
                )
                background_tasks.add_task(
                    execute_flow,
                    company_id=company_id,
                    contact_id=contact_id,
                    contact_phone=phone,
                    flow_id=flow["id"],
                    evolution=evo,
                )
                logger.info(f"[{phone}] Modo BOT — fluxo '{flow['name']}' disparado em background.")
                return {"status": "ok", "mode": "bot", "flow": flow["name"]}

        logger.info(f"[{phone}] Modo BOT — nenhum fluxo encontrado para: '{message_text[:50]}'")
        return {"status": "ok", "mode": "bot", "flow": None}
