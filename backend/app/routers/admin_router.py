"""
SeuFluxo WhatsApp — Admin Router
Endpoints para gestão de equipe (departments, users) exclusivos para role=admin.
Usa a Supabase Admin API (SERVICE_ROLE_KEY) para criar usuários no auth.users.
"""

import logging
import httpx
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from pydantic import BaseModel

from app.database import get_supabase
from app.config import get_settings
from app.models.schemas import (
    DepartmentCreate, DepartmentResponse,
    AdminUserCreate, UserResponse, UserRole
)

logger = logging.getLogger("seufluxo.admin")

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ========================
# Helper: Verificar admin
# ========================

async def _get_admin_user(x_user_id: str):
    """Busca o usuário pelo id e verifica se tem role admin."""
    db = get_supabase()
    result = (
        db.table("users")
        .select("id, company_id, role")
        .eq("id", x_user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")
    user = result.data
    if user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas admins podem acessar esta rota.")
    return user


# ========================
# COMPANY INFO
# ========================

@router.get("/company-info")
async def get_company_info(x_user_id: str = Header(..., alias="x-user-id")):
    """Retorna informações da empresa: max_users, contagem de usuários ativos e departamentos."""
    admin = await _get_admin_user(x_user_id)
    db = get_supabase()

    company_res = db.table("companies").select("id, name, max_users").eq("id", admin["company_id"]).execute()
    if not company_res.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    company = company_res.data[0]

    active_users = (
        db.table("users")
        .select("id", count="exact")
        .eq("company_id", admin["company_id"])
        .eq("is_active", True)
        .execute()
    )
    dept_count = (
        db.table("departments")
        .select("id", count="exact")
        .eq("company_id", admin["company_id"])
        .execute()
    )

    return {
        "company_id": company["id"],
        "company_name": company.get("name"),
        "max_users": company["max_users"],
        "active_users": active_users.count or 0,
        "departments_count": dept_count.count or 0,
    }



# ========================
# DEPARTMENTS
# ========================

@router.get("/departments", response_model=list[DepartmentResponse])
async def list_departments(x_user_id: str = Header(..., alias="x-user-id")):
    """Lista todos os departamentos da empresa do admin autenticado."""
    admin = await _get_admin_user(x_user_id)
    db = get_supabase()
    result = (
        db.table("departments")
        .select("*")
        .eq("company_id", admin["company_id"])
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


@router.post("/departments", response_model=DepartmentResponse, status_code=201)
async def create_department(body: DepartmentCreate, x_user_id: str = Header(..., alias="x-user-id")):
    """Cria um novo departamento para a empresa."""
    admin = await _get_admin_user(x_user_id)

    if body.company_id != admin["company_id"]:
        raise HTTPException(status_code=403, detail="Empresa inválida.")

    db = get_supabase()
    result = (
        db.table("departments")
        .insert({"company_id": admin["company_id"], "name": body.name})
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao criar departamento.")
    return result.data[0]


@router.patch("/departments/{department_id}")
async def update_department(
    department_id: str,
    body: dict,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Atualiza o nome de um departamento."""
    admin = await _get_admin_user(x_user_id)
    db = get_supabase()

    # Garantir que pertence à empresa do admin
    check = db.table("departments").select("company_id").eq("id", department_id).execute()
    if not check.data or check.data[0]["company_id"] != admin["company_id"]:
        raise HTTPException(status_code=404, detail="Departamento não encontrado.")

    allowed = {k: v for k, v in body.items() if k in ("name",)}
    result = db.table("departments").update(allowed).eq("id", department_id).execute()
    return result.data[0]


@router.delete("/departments/{department_id}", status_code=204)
async def delete_department(
    department_id: str,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Remove um departamento."""
    admin = await _get_admin_user(x_user_id)
    db = get_supabase()

    check = db.table("departments").select("company_id").eq("id", department_id).execute()
    if not check.data or check.data[0]["company_id"] != admin["company_id"]:
        raise HTTPException(status_code=404, detail="Departamento não encontrado.")

    db.table("departments").delete().eq("id", department_id).execute()
    return None


# ========================
# USERS (Team Management)
# ========================

@router.get("/users", response_model=list[UserResponse])
async def list_team_users(x_user_id: str = Header(..., alias="x-user-id")):
    """Lista todos os usuários (agentes/managers) da empresa."""
    admin = await _get_admin_user(x_user_id)
    db = get_supabase()
    result = (
        db.table("users")
        .select("*")
        .eq("company_id", admin["company_id"])
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_team_user(body: AdminUserCreate, x_user_id: str = Header(..., alias="x-user-id")):
    """
    Cria um novo usuário (agent/manager) na empresa via Supabase Admin API.
    Valida o limite de licenças (companies.max_users) antes de criar.
    """
    admin = await _get_admin_user(x_user_id)
    db = get_supabase()
    settings = get_settings()

    # 1. Validar que o company_id bate com o admin
    if body.company_id != admin["company_id"]:
        raise HTTPException(status_code=403, detail="Empresa inválida.")

    # 2. Verificar limite de licenças
    company_res = db.table("companies").select("max_users").eq("id", admin["company_id"]).execute()
    if not company_res.data:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    max_users = company_res.data[0]["max_users"]

    count_res = (
        db.table("users")
        .select("id", count="exact")
        .eq("company_id", admin["company_id"])
        .eq("is_active", True)
        .execute()
    )
    current_count = count_res.count or 0

    if current_count >= max_users:
        raise HTTPException(
            status_code=400,
            detail=f"Limite de licenças atingido ({current_count}/{max_users} usuários). "
                   f"Faça upgrade do plano para adicionar mais atendentes."
        )

    # 3. Criar usuário no Supabase Auth via Admin API (usa service_role_key)
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
                "email_confirm": True,  # Confirmar e-mail automaticamente
            }
        )

    if auth_resp.status_code not in (200, 201):
        err = auth_resp.json()
        msg = err.get("msg") or err.get("message") or "Erro ao criar usuário no Auth."
        raise HTTPException(status_code=400, detail=msg)

    auth_user = auth_resp.json()
    auth_id = auth_user["id"]

    # 4. Inserir na tabela public.users com company_id correto
    insert_data = {
        "id": auth_id,
        "auth_id": auth_id,
        "company_id": admin["company_id"],
        "email": body.email,
        "name": body.name or body.email.split("@")[0],
        "role": body.role.value,
        "department_id": body.department_id,
        "is_active": True,
    }

    user_res = db.table("users").insert(insert_data).execute()
    if not user_res.data:
        raise HTTPException(status_code=500, detail="Usuário criado no Auth, mas falha ao salvar no banco.")

    logger.info(f"[Admin] Usuário criado: {body.email} | role={body.role.value} | company={admin['company_id']}")
    return user_res.data[0]


@router.patch("/users/{user_id}")
async def update_team_user(
    user_id: str,
    body: dict,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Atualiza dados de um usuário da equipe (role, department_id, name, is_active)."""
    admin = await _get_admin_user(x_user_id)
    db = get_supabase()

    # Garantir que pertence à empresa
    check = db.table("users").select("company_id").eq("id", user_id).execute()
    if not check.data or check.data[0]["company_id"] != admin["company_id"]:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    allowed_fields = {"name", "role", "department_id", "is_active", "signature"}
    update_data = {k: v for k, v in body.items() if k in allowed_fields}

    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar.")

    result = db.table("users").update(update_data).eq("id", user_id).execute()
    return result.data[0]


@router.delete("/users/{user_id}", status_code=204)
async def delete_team_user(
    user_id: str,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """Desativa um usuário da equipe (soft delete via is_active=False)."""
    admin = await _get_admin_user(x_user_id)
    db = get_supabase()

    # Garantir que pertence à empresa e não é o próprio admin
    check = db.table("users").select("company_id, role").eq("id", user_id).execute()
    if not check.data or check.data[0]["company_id"] != admin["company_id"]:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if user_id == x_user_id:
        raise HTTPException(status_code=400, detail="Não é possível desativar sua própria conta.")

    db.table("users").update({"is_active": False}).eq("id", user_id).execute()
    return None


# ========================
# ASSIGN CONTACT
# ========================

class AssignContactRequest(BaseModel):
    assigned_to: Optional[str] = None  # user_id do atendente (None = desatribuir)
    department_id: Optional[str] = None


@router.patch("/contacts/{contact_id}/assign")
async def assign_contact(
    contact_id: str,
    body: AssignContactRequest,
    x_user_id: str = Header(..., alias="x-user-id")
):
    """
    Atribui um contato a um atendente e/ou departamento.
    Acessível para admin e manager.
    """
    admin = await _get_admin_user(x_user_id)
    db = get_supabase()

    # Verificar se o contato pertence à empresa
    check = db.table("contacts").select("company_id").eq("id", contact_id).execute()
    if not check.data or check.data[0]["company_id"] != admin["company_id"]:
        raise HTTPException(status_code=404, detail="Contato não encontrado.")

    update_data = {}
    if body.assigned_to is not None:
        update_data["assigned_to"] = body.assigned_to
    if body.department_id is not None:
        update_data["department_id"] = body.department_id

    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar.")

    result = db.table("contacts").update(update_data).eq("id", contact_id).execute()
    return result.data[0]
