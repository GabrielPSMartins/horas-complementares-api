"""
Identificador da requisição atual (X-Request-ID), disponível para os logs.

O middleware de logging define o valor no início de cada requisição; o
filtro abaixo o injeta em todo registro de log, inclusive nos emitidos
pelos serviços, para que uma ação de negócio possa ser ligada à requisição
que a originou.
"""
import logging
from contextvars import ContextVar


request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True
