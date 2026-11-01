"""
Respostas de erro documentadas no OpenAPI (/docs).

Todas seguem o formato {"detail": "mensagem"} produzido pelos handlers
registrados em app.main, então um único schema descreve todas.
"""
from typing import Any

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    detail: str


_DESCRIPTIONS = {
    400: "Requisição inválida.",
    401: "Token ausente, inválido ou expirado.",
    403: "O perfil do usuário não tem acesso a este recurso.",
    404: "Recurso não encontrado.",
    409: "Conflito com o estado atual (dado duplicado ou transição de status inválida).",
    422: "Dados inválidos ou regra de negócio violada.",
    503: "Serviço externo indisponível (armazenamento de arquivos).",
}


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    return {
        code: {"model": ErrorResponse, "description": _DESCRIPTIONS[code]}
        for code in status_codes
    }
