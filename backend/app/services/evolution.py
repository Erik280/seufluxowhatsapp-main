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
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload, headers=self.headers)
                resp.raise_for_status()
                return resp.json()
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
            f"/chat/updatePresence/{self.instance}",
            {
                "number": phone,
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
            }
        )

    # ── Imagem ───────────────────────────────────────────────────

    async def send_image(self, phone: str, image_url: str, caption: str = "") -> dict:
        """Envia imagem com legenda opcional."""
        return await self._post(
            f"/message/sendMedia/{self.instance}",
            {
                "number": phone,
                "mediatype": "image",
                "media": image_url,
                "caption": caption,
            }
        )
