from fastapi import FastAPI

from app.api import api_router
from config.settings import settings


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API para gerenciamento de horas complementares de alunos.",
)

app.include_router(api_router)
