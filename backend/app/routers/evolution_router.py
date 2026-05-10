from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any
from app.services.evolution import EvolutionAdminAPI

router = APIRouter(prefix="/api/evolution", tags=["Evolution"])

class CreateInstanceRequest(BaseModel):
    instance_name: str
    token: str

@router.post("/create", response_model=Dict[str, Any])
async def create_instance(request: CreateInstanceRequest):
    """
    Cria uma nova instância na Evolution API.
    """
    admin_api = EvolutionAdminAPI()
    response = await admin_api.create_instance(request.instance_name, request.token)
    
    if "error" in response:
        raise HTTPException(status_code=400, detail=response["error"])
        
    # Configura o Webhook automaticamente
    webhook_url = "https://apiseufluxowhatsapp.transformafuturo.com.br/api/webhook/evolution"
    await admin_api.set_webhook(request.instance_name, webhook_url)
    
    return response

@router.get("/connect/{instance_name}", response_model=Dict[str, Any])
async def connect_instance(instance_name: str):
    """
    Gera o QR Code para conectar a instância.
    """
    admin_api = EvolutionAdminAPI()
    response = await admin_api.connect_instance(instance_name)
    
    if "error" in response:
        raise HTTPException(status_code=400, detail=response["error"])
        
    return response

@router.get("/status/{instance_name}", response_model=Dict[str, Any])
async def connection_status(instance_name: str):
    """
    Verifica o status da conexão da instância.
    """
    admin_api = EvolutionAdminAPI()
    response = await admin_api.connection_state(instance_name)
    
    if "error" in response:
        raise HTTPException(status_code=400, detail=response["error"])
        
    return response

@router.delete("/delete/{instance_name}", response_model=Dict[str, Any])
async def delete_instance(instance_name: str):
    """
    Deleta a instância na Evolution API.
    """
    admin_api = EvolutionAdminAPI()
    
    # 1. Fazemos logout primeiro (para desconectar o celular)
    url_logout = f"{admin_api.base_url}/instance/logout/{instance_name}"
    url_delete = f"{admin_api.base_url}/instance/delete/{instance_name}"
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Ignoramos erro de logout caso já esteja desconectado
            await client.delete(url_logout, headers=admin_api.headers)
            
            # 2. Deleta a instância
            resp = await client.delete(url_delete, headers=admin_api.headers)
            resp.raise_for_status()
            return {"success": True, "detail": "Instance deleted"}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=str(e))
