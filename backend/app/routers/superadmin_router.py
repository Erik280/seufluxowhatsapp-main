"""
SeuFluxo WhatsApp — SuperAdmin Router
Endpoints exclusivos para role=superadmin.
Controle global de todas as empresas: criar, listar, atualizar limites.
"""

import logging
import httpx
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from pydantic import BaseModel

from app.database import get_supabase
from app.config import get_settings

logger = logging.getLogger("seufluxo.superadmin")

router = APIRouter(prefix="/api/superadmin", tags=["SuperAdmin"])


# ========================
# Helper: Verificar superadmin
# ========================

async def _get_superadmin(x_user_id: str):
    """Verifica se o usuário é superadmin."""
    db = get_supabase()
    result = (
        db.table("users")
        .select("id, company_id, role, name, email")
        .eq("id", x_user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    user = result.data
    if user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas superadmins.")
    return user


# ========================
# COMPANIES — CRUD Global
# ========================

@router.get("/companies")
async def list_all_companies(x_user_id: str = Header(..., alias="x-user-id")):
    """Lista todas as empresas cadastradas com stats (usuários, departamentos)."""
    await _get_superadmin(x_user_id)
    db = get_supabase()

    companies_res = db.table("companies").select("*").order("created_at", desc=False).execute()
    companies = companies_res.data or []

    # Enriquecer com contagem de usuários e departamentos por empresa
    enriched = []
    for company in companies:
        cid = company["id"]

        users_res = (
            db.table("users")
            .select("id, is_active", count="exact")
            .eq("company_id", cid)
            .execute()
        )
        active_users = sum(1 for u in (users_res.data or []) if u.get("is_active"))
        total_users = users_res.count or 0

        dept_res = (
            db.table("departments")
            .select("id", count="exact")
            .eq("company_id", cid)
            .execute()
        )

        contacts_res = (
            db.table("contacts")
            .select("id", count="exact")
            .eq("company_id", cid)
            .execute()
        )

        enriched.append({
            **company,
            "total_users": total_users,
            "active_users": active_users,
            "departments_count": dept_res.count or 0,
            "contacts_count": contacts_res.count or 0,
        })

    return enriched


@router.post("/companies", status_code=201)
async def create_company(
    body: dict,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Cria uma nova empresa."""
    await _get_superadmin(x_user_id)
    db = get_supabase()

    allowed = {"name", "evolution_instance", "evolution_apikey", "max_users"}
    insert_data = {k: v for k, v in body.items() if k in allowed}

    if "name" not in insert_data:
        raise HTTPException(status_code=400, detail="Campo 'name' é obrigatório.")

    if "max_users" not in insert_data:
        insert_data["max_users"] = 5  # padrão

    result = db.table("companies").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao criar empresa.")

    logger.info(f"[SuperAdmin] Empresa criada: {insert_data.get('name')} | max_users={insert_data.get('max_users')}")
    return result.data[0]


@router.patch("/companies/{company_id}")
async def update_company(
    company_id: str,
    body: dict,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Atualiza dados de uma empresa (nome, max_users, evolution_instance, evolution_apikey)."""
    await _get_superadmin(x_user_id)
    db = get_supabase()

    allowed = {"name", "evolution_instance", "evolution_apikey", "max_users"}
    update_data = {k: v for k, v in body.items() if k in allowed}

    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar.")

    result = db.table("companies").update(update_data).eq("id", company_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    logger.info(f"[SuperAdmin] Empresa {company_id} atualizada: {update_data}")
    return result.data[0]


@router.delete("/companies/{company_id}", status_code=204)
async def delete_company(
    company_id: str,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Remove uma empresa (cuidado: cascade delete nos dados relacionados)."""
    await _get_superadmin(x_user_id)
    db = get_supabase()

    db.table("companies").delete().eq("id", company_id).execute()
    logger.warning(f"[SuperAdmin] Empresa {company_id} REMOVIDA.")
    return None


# ========================
# USERS — Visão Global
# ========================

@router.get("/companies/{company_id}/users")
async def list_company_users(
    company_id: str,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Lista todos os usuários de uma empresa específica."""
    await _get_superadmin(x_user_id)
    db = get_supabase()

    result = (
        db.table("users")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


@router.patch("/companies/{company_id}/users/{user_id}")
async def update_company_user(
    company_id: str,
    user_id: str,
    body: dict,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Atualiza dados de qualquer usuário (superadmin pode cruzar empresas)."""
    await _get_superadmin(x_user_id)
    db = get_supabase()

    allowed = {"name", "role", "is_active", "department_id", "signature"}
    update_data = {k: v for k, v in body.items() if k in allowed}

    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar.")

    result = db.table("users").update(update_data).eq("id", user_id).eq("company_id", company_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return result.data[0]


# ========================
# CRIAR USUÁRIO ADMIN em qualquer empresa
# ========================

class CreateAdminUserRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    company_id: str
    role: str = "admin"


@router.post("/companies/{company_id}/users", status_code=201)
async def create_user_in_company(
    company_id: str,
    body: CreateAdminUserRequest,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Cria um usuário (ex: admin) em qualquer empresa via Supabase Admin API."""
    await _get_superadmin(x_user_id)
    db = get_supabase()
    settings = get_settings()

    # Verificar empresa
    company_check = db.table("companies").select("id, name").eq("id", company_id).execute()
    if not company_check.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    # Criar no Supabase Auth
    supabase_admin_url = f"{settings.supabase_url}/auth/v1/admin/users"
    async with httpx.AsyncClient(timeout=30.0) as client:
        auth_resp = await client.post(
            supabase_admin_url,
            headers={
                "apikey": settings.supabase_key,
                "Authorization": f"Bearer {settings.supabase_key}",
                "Content-Type": "application/json",
            },
            json={
                "email": body.email,
                "password": body.password,
                "email_confirm": True,
            }
        )

    if auth_resp.status_code not in (200, 201):
        err = auth_resp.json()
        msg = err.get("msg") or err.get("message") or "Erro ao criar usuário no Auth."
        raise HTTPException(status_code=400, detail=msg)

    auth_user = auth_resp.json()
    auth_id = auth_user["id"]

    user_res = db.table("users").insert({
        "id": auth_id,
        "auth_id": auth_id,
        "company_id": company_id,
        "email": body.email,
        "name": body.name or body.email.split("@")[0],
        "role": body.role,
        "is_active": True,
    }).execute()

    if not user_res.data:
        raise HTTPException(status_code=500, detail="Usuário criado no Auth, mas falha ao salvar no banco.")

    logger.info(f"[SuperAdmin] Usuário {body.email} criado na empresa {company_id}")
    return user_res.data[0]


# ========================
# STATS GLOBAIS
# ========================

@router.get("/stats")
async def get_global_stats(x_user_id: str = Header(..., alias="x-user-id")):
    """Retorna estatísticas globais do sistema para o dashboard do superadmin."""
    await _get_superadmin(x_user_id)
    db = get_supabase()

    companies_count = db.table("companies").select("id", count="exact").execute()
    users_count = db.table("users").select("id", count="exact").eq("is_active", True).execute()
    contacts_count = db.table("contacts").select("id", count="exact").execute()
    messages_count = db.table("messages").select("id", count="exact").execute()

    return {
        "total_companies": companies_count.count or 0,
        "total_active_users": users_count.count or 0,
        "total_contacts": contacts_count.count or 0,
        "total_messages": messages_count.count or 0,
    }
