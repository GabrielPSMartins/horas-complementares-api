from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(request_logging_middleware)

app.include_router(api_router)