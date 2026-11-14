"""
Tipos e validadores reutilizáveis para a entrada de dados.

Os textos são normalizados (espaços nas pontas removidos) antes de validar
o tamanho, para que um valor composto só de espaços seja recusado.
"""
import re
from typing import Annotated

from pydantic import AfterValidator, StringConstraints


def _validate_cpf(value: str) -> str:
    if not re.fullmatch(r"[\d.\-\s]+", value):
        raise ValueError("CPF inválido.")

    digits = re.sub(r"\D", "", value)

    if len(digits) != 11 or digits == digits[0] * 11:
        raise ValueError("CPF inválido.")

    for position in (9, 10):
        total = sum(int(digits[i]) * (position + 1 - i) for i in range(position))
        check_digit = (total * 10) % 11 % 10
        if check_digit != int(digits[position]):
            raise ValueError("CPF inválido.")

    return digits


Cpf = Annotated[str, StringConstraints(strip_whitespace=True), AfterValidator(_validate_cpf)]
"""CPF com ou sem pontuação; validado pelos dígitos verificadores e devolvido só com números."""

RegistrationNumber = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=3, max_length=50, pattern=r"^[A-Za-z0-9._-]+$"),
]
"""Matrícula: de 3 a 50 caracteres, apenas letras, números, ponto, hífen e sublinhado."""

PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
