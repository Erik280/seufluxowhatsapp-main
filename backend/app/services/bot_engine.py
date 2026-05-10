"""
SeuFluxo WhatsApp — Motor de Atendimento Bot (CORE LOGIC)
Regra de Ouro: usa asyncio.sleep() para simular tempo humano de resposta
SEM bloquear o servidor FastAPI.
"""

import asyncio
import logging
from app.database import get_supabase
from app.services.evolution import EvolutionAPI

logger = logging.getLogger("seufluxo.bot_engine")


async def execute_flow(
    company_id: str,
    contact_id: str,
    contact_phone: str,
    flow_id: str,
    evolution: EvolutionAPI,
):
    """
    Executa um fluxo completo de atendimento automático.

    Para cada step:
    1. Envia presença (composing/recording) → o contato vê "... digitando"
    2. Aguarda delay_duration segundos (simula humano)
    3. Envia a mensagem (texto/áudio/imagem)
    4. Salva a mensagem enviada no banco
    """
    db = get_supabase()

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
        content = step["content"]
        delay = step.get("delay_duration", 3)

        # ── 1. Enviar presença (composing para texto/imagem, recording para áudio) ──
        is_audio = step_type == "audio"
        try:
            await evolution.send_presence(contact_phone, composing=not is_audio)
        except Exception as e:
            logger.error(f"Erro ao enviar presença: {e}")

        # ── 2. Simular tempo humano de digitação ──
        if delay > 0:
            await asyncio.sleep(delay)

        # ── 3. Enviar a mensagem ──
        try:
            if step_type == "text":
                await evolution.send_text(contact_phone, content)

            elif step_type == "audio":
                await evolution.send_audio(contact_phone, content)

            elif step_type == "image":
                await evolution.send_image(contact_phone, content)

            elif step_type == "video":
                await evolution.send_video(contact_phone, content)

        except Exception as e:
            logger.error(f"Erro ao enviar step [{step_type}]: {e}")
            continue

        # ── 4. Salvar mensagem enviada no banco ──
        try:
            db.table("messages").insert({
                "company_id": company_id,
                "contact_id": contact_id,
                "direction": "out",
                "content": content if step_type == "text" else None,
                "media_url": content if step_type != "text" else None,
                "media_type": step_type if step_type != "text" else None,
            }).execute()
        except Exception as e:
            logger.error(f"Erro ao salvar mensagem no banco: {e}")

    logger.info(f"Fluxo '{flow_id}' concluído para {contact_phone}")


def find_matching_flow(company_id: str, message_text: str) -> dict | None:
    """
    Busca um fluxo ativo cuja trigger_keyword bata com a mensagem recebida.
    Compara em lowercase para ser case-insensitive.
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
        keyword = (flow.get("trigger_keyword") or "").strip().lower()
        if keyword and keyword in normalized:
            return flow

    return None
