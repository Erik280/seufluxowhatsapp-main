"""
SeuFluxo WhatsApp — Motor de Atendimento Bot (CORE LOGIC)
Regra de Ouro: usa asyncio.sleep() para simular tempo humano de resposta
SEM bloquear o servidor FastAPI.

Suporta variáveis mágicas nos textos: {{nome}}, {{telefone}}, {{email}}
Step types: text, audio, image, video, delay, composing, recording
"""

import asyncio
import logging
from app.database import get_supabase
from app.services.evolution import EvolutionAPI

logger = logging.getLogger("seufluxo.bot_engine")


# ── Variáveis Mágicas ────────────────────────────────────────────────────────

def substitute_variables(text: str, contact: dict) -> str:
    """
    Substitui variáveis mágicas no texto com dados reais do contato.

    Variáveis disponíveis:
        {{nome}}      → contact["name"]
        {{telefone}}  → contact["phone"]
        {{email}}     → contact["email"]
    """
    if not text:
        return text

    name = contact.get("name") or "Cliente"
    phone = contact.get("phone") or ""
    email = contact.get("email") or ""

    text = text.replace("{{nome}}", name)
    text = text.replace("{{name}}", name)
    text = text.replace("{{telefone}}", phone)
    text = text.replace("{{phone}}", phone)
    text = text.replace("{{email}}", email)

    return text


# ── Executor de Fluxo ────────────────────────────────────────────────────────

async def execute_flow(
    company_id: str,
    contact_id: str,
    contact_phone: str,
    flow_id: str,
    evolution: EvolutionAPI,
    contact: dict | None = None,
):
    """
    Executa um fluxo completo de atendimento automático passo a passo.

    Tipos de step suportados:
    - text       → envia presença composing + texto (com variáveis)
    - audio      → envia presença recording + áudio PTT (URL ou biblioteca)
    - image      → envia presença composing + imagem
    - video      → envia presença composing + vídeo
    - delay      → pausa silenciosa (sem enviar nada)
    - composing  → envia apenas o evento "digitando..." por N segundos
    - recording  → envia apenas o evento "gravando áudio..." por N segundos
    """
    db = get_supabase()

    # Buscar dados do contato para substituição de variáveis
    if contact is None:
        contact_res = db.table("contacts").select("*").eq("id", contact_id).execute()
        contact = contact_res.data[0] if contact_res.data else {}

    # Busca todos os steps do fluxo, ordenados
    result = (
        db.table("flow_steps")
        .select("*")
        .eq("flow_id", flow_id)
        .order("order_index", desc=False)
        .execute()
    )
    steps = result.data or []

    if not steps:
        logger.warning(f"Fluxo {flow_id} não possui steps. Abortando.")
        return

    logger.info(f"Executando fluxo '{flow_id}' com {len(steps)} steps para {contact_phone}")

    for step in steps:
        step_type = step["type"]
        raw_content = step.get("content") or ""
        delay = step.get("delay_duration", 3)
        media_library_id = step.get("media_library_id")

        # Substituir variáveis no conteúdo de texto
        content = substitute_variables(raw_content, contact)

        # Se o step referencia a biblioteca de mídia, buscar a URL real
        if media_library_id:
            try:
                media_res = db.table("media_library").select("url").eq("id", media_library_id).execute()
                if media_res.data:
                    content = media_res.data[0]["url"]
            except Exception as e:
                logger.error(f"Erro ao buscar mídia da biblioteca [{media_library_id}]: {e}")

        # ── Processar cada tipo de step ──────────────────────────────────────

        if step_type == "delay":
            # Pausa silenciosa — não envia nada
            logger.info(f"  [delay] {delay}s silencioso")
            if delay > 0:
                await asyncio.sleep(delay)
            continue

        elif step_type == "composing":
            # Apenas envia presença "digitando..." por N segundos
            logger.info(f"  [composing] {delay}s digitando...")
            try:
                await evolution.send_presence(contact_phone, composing=True)
            except Exception as e:
                logger.error(f"Erro ao enviar presença composing: {e}")
            if delay > 0:
                await asyncio.sleep(delay)
            continue

        elif step_type == "recording":
            # Apenas envia presença "gravando áudio..." por N segundos
            logger.info(f"  [recording] {delay}s gravando áudio...")
            try:
                await evolution.send_presence(contact_phone, composing=False)
            except Exception as e:
                logger.error(f"Erro ao enviar presença recording: {e}")
            if delay > 0:
                await asyncio.sleep(delay)
            continue

        # Para os demais tipos: enviar presença → aguardar delay → enviar mensagem

        # ── 1. Presença ──
        is_audio = step_type == "audio"
        try:
            await evolution.send_presence(contact_phone, composing=not is_audio)
        except Exception as e:
            logger.error(f"Erro ao enviar presença [{step_type}]: {e}")

        # ── 2. Delay ──
        if delay > 0:
            await asyncio.sleep(delay)

        # ── 3. Enviar mensagem ──
        try:
            if step_type == "text":
                logger.info(f"  [text] → {content[:60]}")
                await evolution.send_text(contact_phone, content)

            elif step_type == "audio":
                logger.info(f"  [audio PTT] → {content[:60]}")
                await evolution.send_audio(contact_phone, content)

            elif step_type == "image":
                logger.info(f"  [image] → {content[:60]}")
                await evolution.send_image(contact_phone, content)

            elif step_type == "video":
                logger.info(f"  [video] → {content[:60]}")
                await evolution.send_video(contact_phone, content)

        except Exception as e:
            logger.error(f"Erro ao enviar step [{step_type}]: {e}")
            continue

        # ── 4. Salvar mensagem no banco ──
        try:
            db.table("messages").insert({
                "company_id": company_id,
                "contact_id": contact_id,
                "direction": "out",
                "content": content if step_type == "text" else f"[{step_type.upper()}] enviado via fluxo.",
                "media_url": content if step_type != "text" else None,
                "media_type": step_type if step_type != "text" else None,
            }).execute()
        except Exception as e:
            logger.error(f"Erro ao salvar mensagem no banco: {e}")

    logger.info(f"Fluxo '{flow_id}' concluído para {contact_phone}")


# ── Busca de Fluxo por Keywords ──────────────────────────────────────────────

def find_matching_flow(company_id: str, message_text: str) -> dict | None:
    """
    Busca um fluxo ativo cujas keywords batam com a mensagem recebida.
    Suporta:
    - Campo legado `trigger_keyword` (string única)
    - Campo novo `keywords` (array de strings)
    Comparação case-insensitive.
    """
    db = get_supabase()

    result = (
        db.table("chat_flows")
        .select("*")
        .eq("company_id", company_id)
        .eq("is_active", True)
        .execute()
    )
    flows = result.data or []

    normalized = message_text.strip().lower()

    for flow in flows:
        # Verificar keywords[] (novo)
        keywords = flow.get("keywords") or []
        for kw in keywords:
            if kw and kw.strip().lower() in normalized:
                return flow

        # Fallback para trigger_keyword legado (string única)
        legacy_kw = (flow.get("trigger_keyword") or "").strip().lower()
        if legacy_kw and legacy_kw in normalized:
            return flow

    return None
