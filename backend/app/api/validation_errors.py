"""
Converte os erros de validação do FastAPI/Pydantic em uma mensagem legível.

Por padrão o FastAPI devolve "detail" como uma lista de objetos; o frontend
exibe "detail" como texto. Aqui "detail" vira uma frase em português sobre o
primeiro campo inválido, e a lista original continua disponível em "errors".
"""
from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

FIELD_LABELS = {
    "title": "O título",
    "location": "O local",
    "description": "A descrição",
    "requested_hours": "As horas solicitadas",
    "accepted_hours": "As horas aprovadas",
    "activity_date": "A data da atividade",
    "activity_type_id": "O tipo de atividade",
    "file": "O certificado",
    "rejection_reason": "O motivo da rejeição",
    "status": "O status",
    "first_name": "O nome",
    "last_name": "O sobrenome",
    "email": "O e-mail",
    "cpf": "O CPF",
    "registration_number": "A matrícula",
    "current_semester": "O semestre",
    "enrollment_date": "A data de ingresso",
    "course_id": "O curso",
}


def _describe(error: dict) -> str:
    field = next((str(part) for part in reversed(error.get("loc", ())) if isinstance(part, str)), "")
    label = FIELD_LABELS.get(field, f"O campo '{field}'" if field else "A requisição")
    ctx = error.get("ctx") or {}
    kind = error.get("type", "")

    if kind == "missing":
        return f"{label} é obrigatório."
    if kind == "string_too_short":
        if ctx.get("min_length") == 1:
            return f"{label} é obrigatório."
        return f"{label} deve ter pelo menos {ctx.get('min_length')} caracteres."
    if kind == "string_too_long":
        return f"{label} deve ter no máximo {ctx.get('max_length')} caracteres."
    if kind == "string_pattern_mismatch":
        return f"{label} contém caracteres inválidos."
    if kind in ("greater_than", "greater_than_equal", "less_than", "less_than_equal"):
        limit = next(iter(ctx.values()), "")
        comparison = {
            "greater_than": "maior que",
            "greater_than_equal": "maior ou igual a",
            "less_than": "menor que",
            "less_than_equal": "no máximo",
        }[kind]
        return f"{label} deve ser {comparison} {limit}."
    if kind == "value_error":
        # Mensagens dos validadores do projeto (ex.: "CPF inválido.").
        return str(ctx.get("error") or error.get("msg", "")).removeprefix("Value error, ")
    return f"{label} é inválido."


def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    detail = _describe(errors[0]) if errors else "Dados inválidos."
    return JSONResponse(
        status_code=422,
        content={"detail": detail, "errors": jsonable_encoder(errors)},
    )
