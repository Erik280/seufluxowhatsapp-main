"""
SeuFluxo WhatsApp — Evolution API Client
Envia mensagens, áudios, imagens e eventos de presença (composing/recording).
"""

import httpx
import logging
from app.config import get_settings

logger = logging.getLogger("seufluxo.evolution")


class EvolutionAPI:
    """Client para a Evolution API v2."""

    def __init__(self, instance: str, apikey: str):
        self.instance = instance
        self.apikey = apikey
        self.settings = get_settings()
        self.base_url = self.settings.evolution_api_url.rstrip("/")
        self.headers = {
            "Content-Type": "application/json",
            "apikey": self.apikey,
        }

    async def _post(self, path: str, payload: dict) -> dict:
        """Faz POST genérico na Evolution API."""
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload, headers=self.headers)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            error_detail = e.response.text
            logger.error(f"Evolution API status error [{path}]: {e} - Response: {error_detail}")
            return {"error": f"{e} - {error_detail}"}
        except httpx.HTTPError as e:
            logger.error(f"Evolution API error [{path}]: {e}")
            return {"error": str(e)}

    # ── Presença (simula humano digitando/gravando) ──────────────

    async def send_presence(self, phone: str, composing: bool = True):
        """
        Envia evento de presença: 'composing' (digitando) ou 'recording' (gravando áudio).
        Isso aparece no WhatsApp do contato como '... digitando' ou '... gravando áudio'.
        """
        presence_type = "composing" if composing else "recording"
        return await self._post(
            f"/chat/sendPresence/{self.instance}",
            {
                "number": phone,
                "delay": 1200,
                "presence": presence_type,
            }
        )

    # ── Mensagens de Texto ───────────────────────────────────────

    async def send_text(self, phone: str, text: str) -> dict:
        """Envia mensagem de texto simples."""
        return await self._post(
            f"/message/sendText/{self.instance}",
            {
                "number": phone,
                "text": text,
            }
        )

    # ── Áudio (PTT — Push-to-Talk) ───────────────────────────────

    async def send_audio(self, phone: str, audio_url: str) -> dict:
        """Envia áudio como mensagem de voz (PTT)."""
        return await self._post(
            f"/message/sendWhatsAppAudio/{self.instance}",
            {
                "number": phone,
                "audio": audio_url,
                "ptt": True,
            }
        )

    # ── Imagem ───────────────────────────────────────────────────
 
    async def send_image(self, phone: str, image_url: str, caption: str = "") -> dict:
        """Envia imagem com legenda opcional."""
        filename = image_url.split("/")[-1]
        return await self._post(
            f"/message/sendMedia/{self.instance}",
            {
                "number": phone,
                "mediatype": "image",
                "media": image_url,
                "caption": caption,
                "fileName": filename
            }
        )
 
    # ── Vídeo ────────────────────────────────────────────────
 
    async def send_video(self, phone: str, video_url: str, caption: str = "") -> dict:
        """Envia vídeo com legenda opcional."""
        filename = video_url.split("/")[-1]
        return await self._post(
            f"/message/sendMedia/{self.instance}",
            {
                "number": phone,
                "mediatype": "video",
                "mimetype": "video/mp4",
                "media": video_url,
                "caption": caption,
                "fileName": filename
            }
        )

    # ── Documento (PDF, etc.) ────────────────────────────────

    async def send_document(self, phone: str, doc_url: str, filename: str = "", caption: str = "") -> dict:
        """Envia um documento (PDF, DOCX, etc.) como arquivo anexo."""
        safe_name = filename or doc_url.split("/")[-1]
        return await self._post(
            f"/message/sendMedia/{self.instance}",
            {
                "number": phone,
                "mediatype": "document",
                "mimetype": "application/pdf",
                "media": doc_url,
                "caption": caption,
                "fileName": safe_name,
            }
        )

    async def get_base64_from_message(self, message_obj: dict) -> dict:
        """Busca o base64 de uma mensagem de mídia (áudio, imagem, vídeo, documento)."""
        return await self._post(
            f"/chat/getBase64FromMediaMessage/{self.instance}",
            {
                "message": message_obj
            }
        )

    async def send_reaction(self, phone: str, message_id: str, from_me: bool, reaction: str) -> dict:
        """Envia ou remove uma reação em uma mensagem específica."""
        return await self._post(
            f"/message/sendReaction/{self.instance}",
            {
                "key": {
                    "remoteJid": f"{phone}@s.whatsapp.net",
                    "fromMe": from_me,
                    "id": message_id,
                },
                "reaction": reaction or "",
            }
        )

class EvolutionAdminAPI:
    """Client para gerenciar instâncias na Evolution API v2 (requer Global Key)."""

    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.evolution_api_url.rstrip("/")
        self.headers = {
            "Content-Type": "application/json",
            "apikey": self.settings.evolution_api_global_key,
        }

    async def _post(self, path: str, payload: dict) -> dict:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload, headers=self.headers)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            error_detail = e.response.text
            logger.error(f"Evolution Admin API status error [{path}]: {e} - Response: {error_detail}")
            return {"error": f"{e} - {error_detail}"}
        except httpx.HTTPError as e:
            logger.error(f"Evolution Admin API error [{path}]: {e}")
            return {"error": str(e)}

    async def _get(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.get(url, headers=self.headers)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            error_detail = e.response.text
            logger.error(f"Evolution Admin API status GET error [{path}]: {e} - Response: {error_detail}")
            return {"error": f"{e} - {error_detail}"}
        except httpx.HTTPError as e:
            logger.error(f"Evolution Admin API get error [{path}]: {e}")
            return {"error": str(e)}

    async def create_instance(self, instance_name: str, token: str) -> dict:
        """Cria uma nova instância."""
        return await self._post(
            "/instance/create",
            {
                "instanceName": instance_name,
                "token": token,
                "qrcode": True,
                "integration": "WHATSAPP-BAILEYS"
            }
        )

    async def connect_instance(self, instance_name: str) -> dict:
        """Retorna o QR Code em Base64 para conectar a instância."""
        return await self._get(f"/instance/connect/{instance_name}")

    async def connection_state(self, instance_name: str) -> dict:
        """Retorna o status da conexão (open, connecting, close)."""
        return await self._get(f"/instance/connectionState/{instance_name}")

    async def set_webhook(self, instance_name: str, webhook_url: str) -> dict:
        """Configura o webhook para a instância receber mensagens."""
        return await self._post(
            f"/webhook/set/{instance_name}",
            {
                "webhook": {
                    "enabled": True,
                    "url": webhook_url,
                    "webhookByEvents": False,
                    "events": [
                        "MESSAGES_UPSERT",
                        "MESSAGES_UPDATE",
                        "SEND_MESSAGE",
                        "CONNECTION_UPDATE"
                    ]
                }
            }
        )
