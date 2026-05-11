import io
import httpx
import logging
from PIL import Image
from app.services.storage import StorageService
from app.database import get_supabase
from datetime import datetime, timezone

logger = logging.getLogger("seufluxo.thumbnail")

async def sync_contact_profile_picture(company_id: str, contact_id: str, phone: str, evolution_client):
    """
    Sincroniza a foto de perfil de um contato a partir do WhatsApp.
    1. Busca a URL da foto na Evolution API.
    2. Baixa a foto, redimensiona para 128x128px, salva como WebP 80.
    3. Faz upload para o MinIO.
    4. Atualiza avatar_url no banco de dados.
    """
    db = get_supabase()
    
    try:
        # Passo A: Busca a URL da foto do perfil
        # A Evolution API tem um endpoint para isso: /chat/fetchProfilePictureUrl/{instance}
        resp = await evolution_client._post(
            f"/chat/fetchProfilePictureUrl/{evolution_client.instance}",
            {"number": phone}
        )
        
        profile_url = resp.get("profilePictureUrl")
        
        if not profile_url:
            logger.info(f"[{phone}] Nenhuma foto de perfil encontrada.")
            # Atualizar avatar_updated_at para não tentar de novo logo
            db.table("contacts").update({
                "avatar_updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", contact_id).execute()
            return
            
        # Passo B: Fazer o download da imagem
        async with httpx.AsyncClient(timeout=15.0) as client:
            img_resp = await client.get(profile_url)
            img_resp.raise_for_status()
            image_data = img_resp.content
            
        # Processamento com Pillow
        img = Image.open(io.BytesIO(image_data))
        
        # Redimensionar (Thumbnail 128x128) usando cover/crop para ficar quadrado
        # O WhatsApp já manda quadrado normalmente, mas por garantia
        img.thumbnail((128, 128), Image.Resampling.LANCZOS)
        
        # Criar imagem final 128x128 com background branco
        background = Image.new('RGB', (128, 128), (255, 255, 255))
        bg_w, bg_h = background.size
        img_w, img_h = img.size
        offset = ((bg_w - img_w) // 2, (bg_h - img_h) // 2)
        
        if img.mode == 'RGBA':
            background.paste(img, offset, img)
        else:
            background.paste(img, offset)
        
        # Salvar para BytesIO como WebP
        out_bytes = io.BytesIO()
        background.save(out_bytes, format="WEBP", quality=80)
        webp_data = out_bytes.getvalue()
        
        # Passo C: Upload para o MinIO
        storage = StorageService()
        filename = f"thumbnails/{company_id}/{phone}.webp"
        
        public_url = storage.upload_file(webp_data, filename, "image/webp")
        
        # Passo D: Atualizar no banco
        db.table("contacts").update({
            "avatar_url": public_url,
            "avatar_updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", contact_id).execute()
        
        logger.info(f"[{phone}] Thumbnail atualizado com sucesso: {public_url}")
        
    except Exception as e:
        logger.error(f"[{phone}] Erro ao sincronizar foto de perfil: {e}")
        # Ainda atualizamos o updated_at para não ficar em loop infinito tentando
        db.table("contacts").update({
            "avatar_updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", contact_id).execute()
