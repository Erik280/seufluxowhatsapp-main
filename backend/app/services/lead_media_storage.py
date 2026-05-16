"""
SeuFluxo WhatsApp — Lead Media Storage (Supabase Storage)
Responsável por armazenar MÍDIAS RECEBIDAS DE LEADS no Supabase Storage.
- Comprime imagens (JPEG quality=75) e áudios OGG → MP3 quando possível
- Gera Signed URLs com TTL de 7 dias
- MinIO continua sendo usado para a Media Library (mídias que a empresa envia)
"""

import io
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Tuple

from app.config import get_settings

logger = logging.getLogger("seufluxo.lead_media_storage")

# Bucket exclusivo para mídias temporárias de leads
LEAD_MEDIA_BUCKET = "lead-media"

# TTL em dias — arquivos são deletados pelo cron após este período
MEDIA_TTL_DAYS = 14


def _compress_image(file_bytes: bytes, content_type: str) -> Tuple[bytes, str, str]:
    """
    Comprime imagem usando Pillow.
    Retorna (bytes_comprimidos, novo_content_type, nova_extensão).
    Converte tudo para JPEG quality=75 (exceto PNG com transparência → mantém PNG com compressão).
    """
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(file_bytes))

        # Verificar se tem canal alpha (transparência)
        has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)

        output = io.BytesIO()

        if has_alpha:
            # Manter PNG mas otimizar
            img = img.convert("RGBA")
            img.save(output, format="PNG", optimize=True, compress_level=9)
            new_ct = "image/png"
            new_ext = "png"
        else:
            # Converter para JPEG com qualidade 75
            img = img.convert("RGB")
            img.save(output, format="JPEG", quality=75, optimize=True)
            new_ct = "image/jpeg"
            new_ext = "jpg"

        compressed = output.getvalue()

        # Só usar se realmente economizou (pelo menos 10%)
        if len(compressed) < len(file_bytes) * 0.95:
            savings_pct = (1 - len(compressed) / len(file_bytes)) * 100
            logger.info(f"[compress_image] Comprimiu {len(file_bytes)/1024:.1f}KB → {len(compressed)/1024:.1f}KB ({savings_pct:.0f}% menor)")
            return compressed, new_ct, new_ext

        logger.info("[compress_image] Compressão não gerou ganho, mantendo original")
        return file_bytes, content_type, content_type.split("/")[-1]

    except Exception as e:
        logger.warning(f"[compress_image] Falha na compressão, usando original: {e}")
        return file_bytes, content_type, content_type.split("/")[-1]


def _compress_audio(file_bytes: bytes, content_type: str) -> Tuple[bytes, str, str]:
    """
    Tenta comprimir áudio OGG via ffmpeg (se disponível).
    Caso ffmpeg não esteja disponível, retorna o original.
    OGG/Opus do WhatsApp já é bastante comprimido, então só tenta reduzir bitrate.
    """
    try:
        import subprocess
        import tempfile
        import os

        # Verificar se ffmpeg está disponível
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        if result.returncode != 0:
            return file_bytes, content_type, _ext_from_ct(content_type)

        # Usar arquivos temporários para ffmpeg
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp_in:
            tmp_in.write(file_bytes)
            tmp_in_path = tmp_in.name

        tmp_out_path = tmp_in_path.replace(".ogg", "_out.ogg")

        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", tmp_in_path,
                    "-c:a", "libopus",
                    "-b:a", "24k",       # 24kbps — suficiente para voz
                    "-vbr", "on",
                    tmp_out_path,
                ],
                capture_output=True,
                timeout=30,
            )

            if os.path.exists(tmp_out_path):
                with open(tmp_out_path, "rb") as f:
                    compressed = f.read()

                if len(compressed) < len(file_bytes) * 0.9:
                    savings_pct = (1 - len(compressed) / len(file_bytes)) * 100
                    logger.info(f"[compress_audio] OGG {len(file_bytes)/1024:.1f}KB → {len(compressed)/1024:.1f}KB ({savings_pct:.0f}% menor)")
                    return compressed, "audio/ogg", "ogg"

        finally:
            for p in [tmp_in_path, tmp_out_path]:
                try:
                    os.unlink(p)
                except Exception:
                    pass

    except FileNotFoundError:
        logger.debug("[compress_audio] ffmpeg não encontrado, mantendo áudio original")
    except Exception as e:
        logger.warning(f"[compress_audio] Erro: {e}, mantendo original")

    return file_bytes, content_type, _ext_from_ct(content_type)


def _ext_from_ct(content_type: str) -> str:
    """Determina extensão de arquivo a partir do content_type."""
    mapping = {
        "audio/ogg": "ogg",
        "audio/mpeg": "mp3",
        "audio/wav": "wav",
        "audio/webm": "webm",
        "video/mp4": "mp4",
        "video/webm": "webm",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "application/pdf": "pdf",
    }
    return mapping.get(content_type, content_type.split("/")[-1] if "/" in content_type else "bin")


def _compress_media(file_bytes: bytes, media_type: str, content_type: str) -> Tuple[bytes, str, str]:
    """
    Dispatcher de compressão baseado no tipo de mídia.
    Retorna (bytes, content_type, extensão) após compressão.
    """
    if media_type == "image":
        return _compress_image(file_bytes, content_type)
    elif media_type == "audio":
        return _compress_audio(file_bytes, content_type)
    else:
        # Vídeo e documentos: sem compressão (complexo demais sem ffmpeg dedicado)
        ext = _ext_from_ct(content_type)
        return file_bytes, content_type, ext


class LeadMediaStorage:
    """
    Serviço de armazenamento temporário de mídias de leads usando Supabase Storage.
    Comprime antes do upload e gera Signed URLs com TTL de 7 dias.
    """

    def __init__(self):
        self.settings = get_settings()
        self._client = None

    @property
    def client(self):
        """Lazy init do cliente Supabase (evita falha no startup se credenciais ausentes)."""
        if self._client is None:
            from supabase import create_client
            self._client = create_client(
                self.settings.supabase_url,
                self.settings.supabase_key,
            )
        return self._client

    def _ensure_bucket(self):
        """
        Garante que o bucket 'lead-media' existe.
        Cria como PRIVADO se não existir.
        """
        try:
            buckets = self.client.storage.list_buckets()
            existing = [b.name for b in buckets]
            if LEAD_MEDIA_BUCKET not in existing:
                self.client.storage.create_bucket(
                    LEAD_MEDIA_BUCKET,
                    options={
                        "public": False,
                        "allowed_mime_types": [
                            "image/jpeg", "image/png", "image/gif", "image/webp",
                            "audio/ogg", "audio/mpeg", "audio/wav", "audio/webm",
                            "video/mp4", "video/webm",
                            "application/pdf",
                            "application/octet-stream",
                        ],
                        "file_size_limit": 52428800,  # 50MB
                    }
                )
                logger.info(f"[LeadMediaStorage] Bucket '{LEAD_MEDIA_BUCKET}' criado com sucesso.")
        except Exception as e:
            logger.warning(f"[LeadMediaStorage] Não foi possível verificar/criar bucket: {e}")

    def upload_lead_media(
        self,
        file_bytes: bytes,
        media_type: str,
        content_type: str,
        company_id: str,
        message_id: str,
    ) -> dict:
        """
        Comprime e faz upload de mídia de lead para o Supabase Storage.

        Args:
            file_bytes: Conteúdo binário do arquivo
            media_type: 'audio' | 'image' | 'video' | 'document'
            content_type: MIME type original (ex: 'audio/ogg')
            company_id: UUID da empresa
            message_id: UUID da mensagem (para path único)

        Returns:
            dict com 'signed_url', 'storage_path', 'expires_at', 'original_size_kb', 'final_size_kb'
        """
        # self._ensure_bucket() # Removido para otimizar performance. Assume-se que o bucket já existe.

        original_size = len(file_bytes)

        # ── 1. Compressão ──────────────────────────────────────────────────────
        compressed_bytes, final_ct, ext = _compress_media(file_bytes, media_type, content_type)
        final_size = len(compressed_bytes)

        # ── 2. Montar path organizado por empresa e data ───────────────────────
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        storage_path = f"{company_id}/{today}/{media_type}/{message_id}.{ext}"

        # ── 3. Upload ──────────────────────────────────────────────────────────
        try:
            self.client.storage.from_(LEAD_MEDIA_BUCKET).upload(
                path=storage_path,
                file=compressed_bytes,
                file_options={
                    "content-type": final_ct,
                    "upsert": "false",
                },
            )
            logger.info(
                f"[LeadMediaStorage] Upload OK: {storage_path} "
                f"({original_size/1024:.1f}KB → {final_size/1024:.1f}KB)"
            )
        except Exception as e:
            logger.error(f"[LeadMediaStorage] Falha no upload: {e}")
            raise

        # ── 4. Gerar Signed URL (7 dias = 604800 segundos) ────────────────────
        expires_in_seconds = MEDIA_TTL_DAYS * 24 * 3600  # 604800
        expires_at = datetime.now(timezone.utc) + timedelta(days=MEDIA_TTL_DAYS)

        try:
            signed = self.client.storage.from_(LEAD_MEDIA_BUCKET).create_signed_url(
                path=storage_path,
                expires_in=expires_in_seconds,
            )
            signed_url = signed.get("signedURL") or signed.get("signed_url") or ""
        except Exception as e:
            logger.error(f"[LeadMediaStorage] Falha ao criar signed URL: {e}")
            signed_url = ""

        return {
            "signed_url": signed_url,
            "storage_path": storage_path,
            "expires_at": expires_at.isoformat(),
            "original_size_kb": round(original_size / 1024, 1),
            "final_size_kb": round(final_size / 1024, 1),
        }

    def delete_expired_media(self) -> int:
        """
        Remove arquivos do Supabase Storage cujo TTL expirou.
        Busca no banco de dados os registros de mensagens com media_expires_at < now()
        e deleta tanto o arquivo quanto atualiza o registro.

        Returns:
            Número de arquivos deletados.
        """
        from app.database import get_supabase
        db = get_supabase()

        now_iso = datetime.now(timezone.utc).isoformat()
        deleted_count = 0

        try:
            # Buscar mensagens com mídia expirada que ainda têm storage_path
            result = (
                db.table("messages")
                .select("id, media_storage_path")
                .lt("media_expires_at", now_iso)
                .not_.is_("media_storage_path", "null")
                .limit(200)
                .execute()
            )
            expired = result.data or []

            if not expired:
                logger.debug("[LeadMediaStorage] Nenhuma mídia expirada para deletar.")
                return 0

            logger.info(f"[LeadMediaStorage] {len(expired)} arquivo(s) expirado(s) para deletar.")

            paths_to_delete = [m["media_storage_path"] for m in expired if m.get("media_storage_path")]
            ids_to_clear = [m["id"] for m in expired]

            # Deletar em lote do Supabase Storage
            if paths_to_delete:
                try:
                    self.client.storage.from_(LEAD_MEDIA_BUCKET).remove(paths_to_delete)
                    deleted_count = len(paths_to_delete)
                    logger.info(f"[LeadMediaStorage] {deleted_count} arquivo(s) deletado(s) do Storage.")
                except Exception as e:
                    logger.error(f"[LeadMediaStorage] Erro ao deletar do Storage: {e}")

            # Limpar referências no banco (manter mensagem, zerar URLs de mídia)
            if ids_to_clear:
                db.table("messages").update({
                    "media_url": None,
                    "media_storage_path": None,
                    "media_expires_at": None,
                }).in_("id", ids_to_clear).execute()

        except Exception as e:
            logger.error(f"[LeadMediaStorage] Erro no cleanup: {e}")

        return deleted_count
