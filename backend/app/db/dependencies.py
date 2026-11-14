from collections.abc import Generator

from sqlalchemy.orm import Session

from app.db.session import SessionLocal


def get_db() -> Generator[Session, None, None]:
    """
    Abre uma sessão por requisição. Se a requisição terminar com exceção,
    desfaz o que não foi confirmado antes de fechar a sessão, para que
    nenhuma alteração parcial seja reaproveitada.
    """
    db = SessionLocal()

    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
