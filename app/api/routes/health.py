from fastapi import APIRouter, status

from app.db.session import check_database_connection

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", status_code=status.HTTP_200_OK)
def health_check() -> dict[str, str]:
    """Informa se a aplicação e o banco de dados estão disponíveis."""
    database_is_connected = check_database_connection()

    return {
        "status": "ok" if database_is_connected else "error",
        "app": "running",
        "database": "connected" if database_is_connected else "disconnected",
    }