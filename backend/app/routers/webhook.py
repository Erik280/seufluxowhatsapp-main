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


def _get_or_create_default_stage(db, company_id: str) -> str | None:
    """
    Retorna o ID do stage padrão (is_default=True) da empresa.
    Se não existir, cria 'NOVOS LEADS' automaticamente.
    """
    res = (
        db.table("kanban_stages")
        .select("id")
        .eq("company_id", company_id)
        .eq("is_default", True)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]["id"]

    # Criar o stage padrão se não existir
    logger.info(f"[{company_id}] Criando stage padrão 'NOVOS LEADS'.")
    new_stage = db.table("kanban_stages").insert({
        "company_id": company_id,
        "name": "NOVOS LEADS",
        "color": "#00E5CC",
        "order_index": 0,
        "is_default": True,
        "is_protected": True,
        "entry_keywords": [],
    }).execute()
    return new_stage.data[0]["id"] if new_stage.data else None


def _should_trigger_flow(db, contact: dict, flow: dict) -> bool:
    """Verifica se o fluxo deve ser disparado baseado na regra trigger_once."""
    if not flow.get("trigger_once"):
        return True
    
    completed = contact.get("completed_flows") or []
    if flow["id"] in completed:
        return False
        
    # Marca como completado
    completed.append(flow["id"])
    db.table("contacts").update({"completed_flows": completed}).eq("id", contact["id"]).execute()
    contact["completed_flows"] = completed
    return True


def _find_keyword_stage(db, company_id: str, message_text: str) -> dict | None:
    """
    Verifica se o texto da mensagem contém alguma keyword de entrada
    configurada em um stage. Retorna o primeiro stage que der match.
    Ordem de prioridade: order_index ASC.
    """
    if not message_text:
        return None

    # Buscar todos os stages com keywords configuradas
    res = (
        db.table("kanban_stages")
        .select("id, name, entry_keywords, trigger_flow_id, is_trigger_enabled")
        .eq("company_id", company_id)
        .eq("is_default", False)      # Não aplicar ao stage padrão
        .order("order_index", desc=False)
        .execute()
    )

    if not res.data:
        return None

    msg_lower = message_text.lower()
    for stage in res.data:
        keywords = stage.get("entry_keywords") or []
        for kw in keywords:
            if kw and kw.lower() in msg_lower:
                logger.info(
                    f"[keyword-routing] Keyword '{kw}' encontrada → stage '{stage['name']}'"
                )
                return stage

    return None


@router.post("/evolution")
async def evolution_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Endpoint que recebe mensagens da Evolution API.

    Fluxo:
    1. Extrai dados da mensagem (remetente, texto, instância)
    2. Identifica a empresa pela instância
    3. Busca ou cria o contato
       - Novos contatos entram no stage 'NOVOS LEADS' (is_default=True)
    4. Verifica se a mensagem contém uma keyword de entrada de algum stage:
       - Se sim: move o lead para o stage correspondente + dispara fluxo (se configurado)
       - Se não: verifica chat_status e roteia normalmente
    5. Salva a mensagem recebida
    """
    try:
        payload = await request.json()
    except Exception:
        return {"status": "error", "message": "Invalid JSON"}

    # ── Validar evento ──
    event = payload.get("event")
    if event != "messages.upsert":
        return {"status": "ignored", "event": event}

    data = payload.get("data", {})
    instance_name = payload.get("instance")

    # ── Extrair dados da mensagem ──
    key = data.get("key", {})
    is_from_me = key.get("fromMe", False)

    remote_jid = key.get("remoteJid", "")
    phone = remote_jid.split("@")[0] if "@" in remote_jid else remote_jid

    if not phone or phone == "status":
        return {"status": "ignored", "reason": "invalid_phone"}

    message_obj = data.get("message", {})
    message_text = (
        message_obj.get("conversation")
        or message_obj.get("extendedTextMessage", {}).get("text")
        or ""
    )
    push_name = data.get("pushName", "")

    logger.info(f"[{instance_name}] {'→ enviada' if is_from_me else '← recebida'} {phone}: {message_text[:80]}")

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

    # ── 2. Mensagens enviadas por mim (WhatsApp Web / App) ──
    if is_from_me:
        # Salvar apenas se o contato JÁ EXISTE no sistema
        contact_result = (
            db.table("contacts")
            .select("id")
            .eq("company_id", company_id)
            .eq("phone", phone)
            .limit(1)
            .execute()
        )
        if contact_result.data and message_text:
            contact_id = contact_result.data[0]["id"]
            db.table("messages").insert({
                "company_id": company_id,
                "contact_id": contact_id,
                "direction": "out",
                "content": message_text,
            }).execute()
            db.table("contacts").update({"last_message": "now()"}).eq("id", contact_id).execute()
            logger.info(f"[fromMe] Mensagem salva para contato {phone} (direction=out)")
            return {"status": "ok", "mode": "from_me_saved"}

        return {"status": "ignored", "reason": "fromMe_no_contact_or_empty"}

    # ── 3. Buscar o stage padrão da empresa ──
    default_stage_id = _get_or_create_default_stage(db, company_id)

    # ── 4. Buscar ou criar contato ──
    contact_result = (
        db.table("contacts")
        .select("*")
        .eq("company_id", company_id)
        .eq("phone", phone)
        .limit(1)
        .execute()
    )

    is_new_contact = False

    if contact_result.data:
        contact = contact_result.data[0]
        # Atualizar nome se veio pushName e não tinha
        if push_name and not contact.get("name"):
            db.table("contacts").update({"name": push_name}).eq("id", contact["id"]).execute()
            contact["name"] = push_name
    else:
        # Criar novo contato → sempre entra no stage padrão NOVOS LEADS
        new_contact = (
            db.table("contacts")
            .insert({
                "company_id": company_id,
                "phone": phone,
                "name": push_name or None,
                "chat_status": "human",
                "stage_id": default_stage_id,   # ← NOVOS LEADS
            })
            .execute()
        )
        contact = new_contact.data[0]
        is_new_contact = True
        logger.info(f"[{phone}] Novo lead criado → stage NOVOS LEADS ({default_stage_id})")

    contact_id = contact["id"]
    chat_status = contact.get("chat_status", "human")
    
    # ── 4a. Agendar sincronização de avatar (a cada 14 dias ou se não existir) ──
    avatar_updated_at = contact.get("avatar_updated_at")
    should_sync_avatar = False
    
    if is_new_contact or not avatar_updated_at:
        should_sync_avatar = True
    else:
        from datetime import datetime, timezone
        # Parse ISO format string from Supabase
        # Handling the 'Z' format correctly
        updated_str = avatar_updated_at.replace('Z', '+00:00')
        try:
            last_updated = datetime.fromisoformat(updated_str)
            days_since_update = (datetime.now(timezone.utc) - last_updated).days
            if days_since_update >= 14:
                should_sync_avatar = True
        except ValueError:
            # Fallback for parsing errors
            should_sync_avatar = True
            
    if should_sync_avatar:
        from app.services.thumbnail import sync_contact_profile_picture
        evo_client = EvolutionAPI(instance=instance_name, apikey=evolution_apikey)
        background_tasks.add_task(
            sync_contact_profile_picture,
            company_id=company_id,
            contact_id=contact_id,
            phone=phone,
            evolution_client=evo_client
        )

    # ── 4. Salvar mensagem recebida ──
    db.table("messages").insert({
        "company_id": company_id,
        "contact_id": contact_id,
        "direction": "in",
        "content": message_text or None,
    }).execute()

    # Atualizar last_message do contato
    db.table("contacts").update({"last_message": "now()"}).eq("id", contact_id).execute()

    # ── 5. Verificar roteamento por keyword ──
    # (Aplica a todos os status: se o lead enviar uma keyword, ele entra no fluxo)
    if message_text:
        keyword_stage = _find_keyword_stage(db, company_id, message_text)

        if keyword_stage and keyword_stage["id"] != contact.get("stage_id"):
            target_stage_id = keyword_stage["id"]

            # Mover para o stage da keyword
            db.table("contacts").update({
                "stage_id": target_stage_id,
                "chat_status": "bot",
            }).eq("id", contact_id).execute()
            contact["stage_id"] = target_stage_id

            logger.info(
                f"[{phone}] Roteado por keyword → stage '{keyword_stage['name']}'"
            )

            # Disparar fluxo automático do stage (se configurado)
            if keyword_stage.get("is_trigger_enabled") and keyword_stage.get("trigger_flow_id"):
                flow_id = keyword_stage["trigger_flow_id"]
                
                # Fetch flow to check trigger_once
                flow_res = db.table("chat_flows").select("id, name, trigger_once").eq("id", flow_id).execute()
                
                if flow_res.data:
                    stage_flow = flow_res.data[0]
                    if _should_trigger_flow(db, contact, stage_flow):
                        evo = EvolutionAPI(instance=instance_name, apikey=evolution_apikey)
                        background_tasks.add_task(
                            execute_flow,
                            company_id=company_id,
                            contact_id=contact_id,
                            contact_phone=phone,
                            flow_id=flow_id,
                            evolution=evo,
                            contact=contact,
                        )
                        logger.info(
                            f"[{phone}] Fluxo '{flow_id}' disparado por keyword routing."
                        )
                    else:
                        logger.info(f"[{phone}] Fluxo '{flow_id}' ignorado (trigger_once).")
                return {
                    "status": "ok",
                    "mode": "keyword_routed",
                    "stage": keyword_stage["name"],
                }

            return {
                "status": "ok",
                "mode": "keyword_routed",
                "stage": keyword_stage["name"],
                "flow": None,
            }

    # ── 6. Verificar Fluxos por Keyword Direto ──
    if message_text:
        flow = find_matching_flow(company_id, message_text)
        if flow:
            if _should_trigger_flow(db, contact, flow):
                # Se o lead estava como humano, o disparo da keyword ativa o bot
                if chat_status == "human":
                    db.table("contacts").update({"chat_status": "bot"}).eq("id", contact_id).execute()
                    chat_status = "bot"
                    
                evo = EvolutionAPI(instance=instance_name, apikey=evolution_apikey)
                background_tasks.add_task(
                    execute_flow,
                    company_id=company_id,
                    contact_id=contact_id,
                    contact_phone=phone,
                    flow_id=flow["id"],
                    evolution=evo,
                    contact=contact,
                )
                logger.info(f"[{phone}] Modo BOT — fluxo '{flow['name']}' disparado.")
            else:
                logger.info(f"[{phone}] Modo BOT — fluxo '{flow['name']}' ignorado (trigger_once).")
            return {"status": "ok", "mode": "bot", "flow": flow["name"]}

    # ── 7. Rotear conforme chat_status ──

    if chat_status == "human":
        logger.info(f"[{phone}] Modo HUMANO — mensagem salva para atendente.")
        return {"status": "ok", "mode": "human"}

    else:
        logger.info(f"[{phone}] Modo BOT — nenhum fluxo para: '{message_text[:50]}'")
        return {"status": "ok", "mode": "bot", "flow": None}
