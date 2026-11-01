from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.api.validation_errors import handle_validation_error
from app.core.exceptions import DomainError
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Request-ID"],
)

app.middleware("http")(request_logging_middleware)


app.add_exception_handler(RequestValidationError, handle_validation_error)


@app.exception_handler(DomainError)
def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})

app.include_router(api_router)