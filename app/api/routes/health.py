from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.db.session import check_database_connection


router = APIRouter(prefix="/health", tags=["Health"])


class HealthCheckResponse(BaseModel):
    status: str
    app: str
    database: str


@router.get("", response_model=HealthCheckResponse)
def health_check(response: Response) -> HealthCheckResponse:
    """Verifica se a aplicação e suas dependências principais estão disponíveis."""
    database_is_connected = check_database_connection()

    if not database_is_connected:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthCheckResponse(
        status="ok" if database_is_connected else "error",
        app="running",
        database="connected" if database_is_connected else "disconnected",
    )