import logging
import sys

from app.core.request_context import RequestIdFilter


LOG_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | request_id=%(request_id)s | %(message)s"


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())

    logging.basicConfig(
        level=logging.INFO,
        format=LOG_FORMAT,
        handlers=[handler],
    )

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
