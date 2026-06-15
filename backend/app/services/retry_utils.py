"""
SeuFluxo WhatsApp — Utilitário de Retry para Envios via Evolution API

Estratégia:
- Até MAX_ATTEMPTS tentativas por envio
- Delay aleatório entre MIN_DELAY e MAX_DELAY segundos entre cada tentativa
- Distingue erros retryáveis (timeout, 5xx, stream) de não-retryáveis (4xx)
- Lança RetryExhaustedError se todas as tentativas falharem
"""

import asyncio
import logging
import random
from typing import Callable, Awaitable

logger = logging.getLogger("seufluxo.retry")

# ── Configurações ────────────────────────────────────────────────────────────

MAX_ATTEMPTS   = 4    # Número máximo de tentativas
MIN_DELAY      = 0    # Segundos mínimos de espera entre tentativas
MAX_DELAY      = 10   # Segundos máximos de espera entre tentativas

# Fragmentos de erro que indicam que vale tentar novamente
RETRYABLE_ERRORS = [
    "Failed to fetch stream",
    "timeout",
    "Timeout",
    "connect",
    "Connection",
    "503",
    "502",
    "500",
    "429",
    "Internal Server Error",
    "Service Unavailable",
    "Bad Gateway",
]


class RetryExhaustedError(Exception):
    """Levantada quando todas as tentativas de envio foram esgotadas."""
    def __init__(self, step_type: str, last_error: str, attempts: int):
        self.step_type  = step_type
        self.last_error = last_error
        self.attempts   = attempts
        super().__init__(
            f"[{step_type}] Falhou após {attempts} tentativa(s). Último erro: {last_error}"
        )


def _is_retryable(error_str: str) -> bool:
    """Decide se o erro justifica uma nova tentativa."""
    return any(fragment.lower() in error_str.lower() for fragment in RETRYABLE_ERRORS)


async def send_with_retry(
    send_fn: Callable[[], Awaitable[dict]],
    step_type: str = "unknown",
    max_attempts: int = MAX_ATTEMPTS,
    min_delay: int = MIN_DELAY,
    max_delay: int = MAX_DELAY,
) -> dict:
    """
    Executa send_fn() com retry automático.

    Parâmetros:
        send_fn       — função assíncrona sem argumentos que retorna dict
        step_type     — nome do tipo de step (para logging)
        max_attempts  — máximo de tentativas
        min_delay     — mínimo de segundos entre tentativas
        max_delay     — máximo de segundos entre tentativas

    Retorna:
        dict com resposta de sucesso da Evolution API

    Levanta:
        RetryExhaustedError — se todas as tentativas falharem
    """
    last_error = "Erro desconhecido"

    for attempt in range(1, max_attempts + 1):
        try:
            result = await send_fn()

            # Verifica se a resposta contém um campo "error"
            if "error" in result:
                error_msg = str(result["error"])
                last_error = error_msg

                if not _is_retryable(error_msg):
                    # Erro não-retryável (ex: número inválido) — falha imediata
                    logger.error(
                        f"[retry] [{step_type}] Tentativa {attempt}/{max_attempts}: "
                        f"Erro não-retryável, abortando. Erro: {error_msg}"
                    )
                    raise RetryExhaustedError(step_type, error_msg, attempt)

                if attempt < max_attempts:
                    delay = random.uniform(min_delay, max_delay)
                    logger.warning(
                        f"[retry] [{step_type}] Tentativa {attempt}/{max_attempts} falhou. "
                        f"Erro: {error_msg[:120]} | Aguardando {delay:.1f}s antes de tentar novamente..."
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"[retry] [{step_type}] Todas as {max_attempts} tentativas esgotadas. "
                        f"Último erro: {error_msg[:120]}"
                    )
                    raise RetryExhaustedError(step_type, error_msg, attempt)
            else:
                # Sucesso!
                if attempt > 1:
                    logger.info(
                        f"[retry] [{step_type}] Sucesso na tentativa {attempt}/{max_attempts}!"
                    )
                return result

        except RetryExhaustedError:
            raise

        except Exception as exc:
            last_error = str(exc)

            if attempt < max_attempts:
                delay = random.uniform(min_delay, max_delay)
                logger.warning(
                    f"[retry] [{step_type}] Tentativa {attempt}/{max_attempts} — exceção: {exc} | "
                    f"Aguardando {delay:.1f}s..."
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    f"[retry] [{step_type}] Todas as {max_attempts} tentativas esgotadas "
                    f"com exceção. Último erro: {exc}"
                )
                raise RetryExhaustedError(step_type, last_error, attempt)

    # Nunca deve chegar aqui, mas por segurança:
    raise RetryExhaustedError(step_type, last_error, max_attempts)
