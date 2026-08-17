from fastapi import FastAPI

from app.api.router import api_router
from app.middlewares.logging import request_logging_middleware
from config.logging import configure_logging
from config.settings import settings


configure_logging()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API para gerenciamento de horas complementares de alunos do curso de Sistemas de Informação.",
)

app.middleware("http")(request_logging_middleware)

app.include_router(api_router)