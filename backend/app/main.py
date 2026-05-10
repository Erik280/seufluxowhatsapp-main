"""
SeuFluxo WhatsApp — FastAPI Server
Backend principal para o sistema de automação WhatsApp.
"""

# Trigger build
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routers import webhook, api, evolution_router


# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-28s │ %(levelname)-7s │ %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seufluxo")


# ── Lifespan ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / Shutdown do servidor."""
    settings = get_settings()
    logger.info("═" * 60)
    logger.info("  SeuFluxo WhatsApp API — Iniciando...")
    logger.info(f"  Ambiente: {settings.app_env}")
    logger.info(f"  Supabase: {settings.supabase_url}")
    logger.info(f"  Evolution: {settings.evolution_api_url}")
    logger.info("═" * 60)
    yield
    logger.info("SeuFluxo WhatsApp API — Encerrado.")


# ── App ──
app = FastAPI(
    title="SeuFluxo WhatsApp API",
    description="Backend para automação de atendimento via WhatsApp com fluxos indetectáveis.",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──
app.include_router(webhook.router)
app.include_router(api.router)
app.include_router(evolution_router.router)


# ── Health Check ──
@app.get("/api/health", tags=["System"])
async def health():
    return {
        "status": "ok",
        "service": "seufluxo-whatsapp-api",
        "version": "2.0.0",
    }
