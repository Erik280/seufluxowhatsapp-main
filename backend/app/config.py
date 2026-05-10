"""
SeuFluxo WhatsApp — Configurações do Servidor
Carrega variáveis de ambiente via pydantic-settings.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Todas as variáveis de ambiente do backend."""

    # --- Supabase ---
    supabase_url: str
    supabase_key: str   # SERVICE_ROLE_KEY (bypass RLS)

    # --- Evolution API ---
    evolution_api_url: str
    evolution_api_global_key: str

    # --- MinIO ---
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "whatsapp-storage"
    minio_secure: bool = False
    minio_region: str = "us-east-1"

    # --- CORS ---
    cors_origins: str = "https://seufluxowhatsapp.transformafuturo.com.br,http://localhost:5173"

    # --- App ---
    app_env: str = "production"
    log_level: str = "info"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
