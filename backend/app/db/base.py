from datetime import UTC, datetime

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    """
    Data e hora atuais em UTC, com fuso (timezone-aware).

    Usada como default de created_at/updated_at. Substitui datetime.utcnow,
    que está obsoleto e gera datetime sem fuso: gravado numa coluna
    TIMESTAMP WITH TIME ZONE, esse valor seria interpretado no fuso da
    sessão do banco e ficaria deslocado quando ele não fosse UTC.
    """
    return datetime.now(UTC)
