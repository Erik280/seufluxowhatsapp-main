from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any
from app.services.evolution import EvolutionAdminAPI

router = APIRouter(prefix="/evolution", tags=["Evolution"])

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
