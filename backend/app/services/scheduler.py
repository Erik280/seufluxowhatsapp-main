"""
SeuFluxo WhatsApp — Motor de Agendamento e Campanhas
Usa APScheduler para verificar mensagens agendadas a cada 60 segundos.
Inclui suporte a cadências de remarketing e campanhas com variação de mensagem.
"""

import asyncio
import logging
import random
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.database import get_supabase
from app.services.evolution import EvolutionAPI
from app.services.bot_engine import execute_flow

logger = logging.getLogger("seufluxo.scheduler")

scheduler = AsyncIOScheduler(timezone="UTC")


# ── Job Principal: Processar Mensagens Agendadas ──────────────────────────────

async def process_scheduled_messages():
    """
    Verificado a cada 60 segundos.
    Busca todos os agendamentos pendentes com scheduled_for <= now() e processa.
    """
    db = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        result = (
            db.table("scheduled_messages")
            .select("*, contacts(phone, name, email), companies(evolution_instance, evolution_apikey)")
            .eq("status", "pending")
            .lte("scheduled_for", now_iso)
            .limit(50)  # processar em lotes de 50
            .execute()
        )
        pending = result.data or []
    except Exception as e:
        logger.error(f"Erro ao buscar agendamentos: {e}")
        return

    if not pending:
        return

    logger.info(f"[Scheduler] {len(pending)} agendamento(s) pendente(s) para processar.")

    for msg in pending:
        msg_id = msg["id"]
        contact = msg.get("contacts") or {}
        company = msg.get("companies") or {}
        contact_id = msg["contact_id"]
        company_id = msg["company_id"]
        flow_id = msg.get("flow_id")
        content = msg.get("content")
        instance = company.get("evolution_instance")
        apikey = company.get("evolution_apikey")
        phone = contact.get("phone")

        if not instance or not apikey or not phone:
            logger.warning(f"[Scheduler] Agendamento {msg_id} sem dados de Evolution. Pulando.")
            _mark_failed(db, msg_id)
            continue

        evolution = EvolutionAPI(instance=instance, apikey=apikey)

        try:
            if flow_id:
                # Disparar fluxo completo
                logger.info(f"[Scheduler] Executando fluxo {flow_id} para {phone}")
                await execute_flow(
                    company_id=company_id,
                    contact_id=contact_id,
                    contact_phone=phone,
                    flow_id=flow_id,
                    evolution=evolution,
                    contact=contact,
                )
            elif content:
                # Mensagem avulsa
                logger.info(f"[Scheduler] Enviando mensagem avulsa para {phone}")
                await evolution.send_presence(phone, composing=True)
                await asyncio.sleep(2)
                await evolution.send_text(phone, content)
                db.table("messages").insert({
                    "company_id": company_id,
                    "contact_id": contact_id,
                    "direction": "out",
                    "content": content,
                }).execute()

            # Marcar como enviado
            db.table("scheduled_messages").update({
                "status": "sent",
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", msg_id).execute()

        except Exception as e:
            logger.error(f"[Scheduler] Erro ao processar agendamento {msg_id}: {e}")
            _mark_failed(db, msg_id)


def _mark_failed(db, msg_id: str):
    try:
        db.table("scheduled_messages").update({"status": "failed"}).eq("id", msg_id).execute()
    except Exception:
        pass


# ── Job de Campanhas: Disparos em Massa ──────────────────────────────────────

async def process_campaigns():
    """
    Verificado a cada 60 segundos.
    Processa campanhas com status='scheduled' cujo scheduled_for <= now().
    Seleciona leads pelo filtro (tags + inatividade) e gera agendamentos individuais
    com intervalos aleatórios entre os envios para evitar detecção de spam.
    """
    db = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        result = (
            db.table("campaigns")
            .select("*")
            .eq("status", "scheduled")
            .lte("scheduled_for", now_iso)
            .execute()
        )
        campaigns = result.data or []
    except Exception as e:
        logger.error(f"Erro ao buscar campanhas: {e}")
        return

    for campaign in campaigns:
        campaign_id = campaign["id"]
        company_id = campaign["company_id"]
        target_tags = campaign.get("target_tags") or []
        min_inactive_h = campaign.get("min_inactive_hours") or 0
        variants = campaign.get("message_variants") or []
        flow_id = campaign.get("flow_id")
        interval_min = campaign.get("interval_min_seconds") or 30
        interval_max = campaign.get("interval_max_seconds") or 120

        if not variants and not flow_id:
            logger.warning(f"[Campaign {campaign_id}] Sem mensagens e sem fluxo. Cancelando.")
            db.table("campaigns").update({"status": "cancelled"}).eq("id", campaign_id).execute()
            continue

        logger.info(f"[Campaign {campaign_id}] Iniciando processamento...")

        # Marcar como running
        db.table("campaigns").update({"status": "running"}).eq("id", campaign_id).execute()

        # Buscar leads alvo usando junction table contact_tags
        query = (
            db.table("contacts")
            .select("id, phone, name, email")
            .eq("company_id", company_id)
        )

        contacts_result = query.execute()
        targets = contacts_result.data or []

        # Filtrar por tags via contact_tags junction
        if target_tags:
            # target_tags contém UUIDs de tags
            tagged_ids_result = (
                db.table("contact_tags")
                .select("contact_id")
                .in_("tag_id", target_tags)
                .execute()
            )
            tagged_ids = {row["contact_id"] for row in (tagged_ids_result.data or [])}
            targets = [c for c in targets if c["id"] in tagged_ids]


        if not targets:
            logger.info(f"[Campaign {campaign_id}] Nenhum lead alvo encontrado.")
            db.table("campaigns").update({
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "total_sent": 0,
            }).eq("id", campaign_id).execute()
            continue

        # Filtrar por inatividade mínima
        if min_inactive_h > 0:
            from datetime import timedelta
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=min_inactive_h)).isoformat()
            filtered = []
            for c in targets:
                contact_detail = db.table("contacts").select("last_message").eq("id", c["id"]).execute()
                if contact_detail.data:
                    last_msg = contact_detail.data[0].get("last_message")
                    if not last_msg or last_msg < cutoff:
                        filtered.append(c)
            targets = filtered

        logger.info(f"[Campaign {campaign_id}] {len(targets)} lead(s) alvo após filtros.")

        # Gerar agendamentos individuais com offsets aleatórios
        offset_seconds = 0
        scheduled_count = 0

        for contact in targets:
            # Escolher variação de mensagem aleatória
            content = random.choice(variants) if variants else None
            scheduled_time = (
                datetime.now(timezone.utc).replace(microsecond=0)
            )
            from datetime import timedelta
            scheduled_time = scheduled_time + timedelta(seconds=offset_seconds)

            try:
                db.table("scheduled_messages").insert({
                    "company_id": company_id,
                    "contact_id": contact["id"],
                    "flow_id": flow_id,
                    "content": content,
                    "scheduled_for": scheduled_time.isoformat(),
                    "status": "pending",
                    "campaign_id": campaign_id,
                }).execute()
                scheduled_count += 1
            except Exception as e:
                logger.error(f"[Campaign {campaign_id}] Erro ao criar agendamento: {e}")

            # Incrementar offset com intervalo aleatório
            offset_seconds += random.randint(interval_min, interval_max)

        # Marcar campanha como completed (os envios reais serão feitos pelo process_scheduled_messages)
        db.table("campaigns").update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "total_sent": scheduled_count,
        }).eq("id", campaign_id).execute()

        logger.info(f"[Campaign {campaign_id}] {scheduled_count} mensagens agendadas com sucesso.")


# ── Setup do Scheduler ───────────────────────────────────────────────────────

def start_scheduler():
    """Inicia o scheduler com os jobs registrados."""
    scheduler.add_job(
        process_scheduled_messages,
        trigger="interval",
        seconds=60,
        id="scheduled_messages",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        process_campaigns,
        trigger="interval",
        seconds=60,
        id="campaigns",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info("[Scheduler] Motor de agendamento iniciado — verificando a cada 60s.")


def stop_scheduler():
    """Para o scheduler no shutdown da aplicação."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Motor de agendamento encerrado.")
