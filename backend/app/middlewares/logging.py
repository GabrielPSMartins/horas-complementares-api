import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

from app.core.request_context import request_id_var


logger = logging.getLogger(__name__)

# Um X-Request-ID enviado pelo cliente (ou por um proxy) é reaproveitado para
# permitir rastrear a mesma requisição de ponta a ponta; valores fora deste
# formato são trocados por um UUID novo para não poluir os logs.
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def _resolve_request_id(request: Request) -> str:
    incoming = request.headers.get("X-Request-ID", "")
    return incoming if _VALID_REQUEST_ID.fullmatch(incoming) else str(uuid.uuid4())


async def request_logging_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = _resolve_request_id(request)
    token = request_id_var.set(request_id)
    start_time = time.perf_counter()

    logger.info(
        "request_started | method=%s path=%s",
        request.method,
        request.url.path,
    )

    try:
        response = await call_next(request)

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        logger.info(
            "request_finished | method=%s path=%s status_code=%s duration_ms=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

        response.headers["X-Request-ID"] = request_id

        return response

    except Exception:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        logger.exception(
            "request_failed | method=%s path=%s duration_ms=%s",
            request.method,
            request.url.path,
            duration_ms,
        )

        raise

    finally:
        request_id_var.reset(token)