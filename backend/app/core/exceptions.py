class DomainError(Exception):
    """
    Erro de regra de negócio lançado pela camada de serviço.

    Cada subclasse define o status HTTP correspondente; o handler global
    registrado em app.main converte a exceção em {"detail": mensagem}.
    Assim, os serviços não dependem do FastAPI e as rotas não precisam
    de blocos try/except repetidos.
    """

    status_code: int = 400


class NotFoundError(DomainError):
    """Recurso inexistente (solicitação, aluno, curso...)."""

    status_code = 404


class PermissionDeniedError(DomainError):
    """O usuário está autenticado, mas não pode agir sobre o recurso."""

    status_code = 403


class ConflictError(DomainError):
    """Conflito com o estado atual do recurso: dado duplicado ou transição de status inválida."""

    status_code = 409


class BusinessRuleError(DomainError):
    """Requisição bem formada que viola uma regra de negócio (limites de horas, campos obrigatórios)."""

    status_code = 422


class ExternalServiceError(DomainError):
    """Falha em um serviço externo do qual a API depende (armazenamento de arquivos)."""

    status_code = 503
