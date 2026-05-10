"""
SeuFluxo WhatsApp — Conexão com Supabase
Usa a lib oficial supabase-py com SERVICE_ROLE_KEY para bypass do RLS.
"""

from supabase import create_client, Client
from app.config import get_settings


_client: Client | None = None


def get_supabase() -> Client:
    """Retorna o client Supabase (singleton)."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client
