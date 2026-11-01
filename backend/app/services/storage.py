import logging
import uuid
from datetime import timedelta
from pathlib import Path
from typing import BinaryIO

from fastapi import UploadFile
from minio import Minio
from minio.error import S3Error
from urllib3.exceptions import HTTPError as ConnectionFailure

from app.core.exceptions import DomainError, ExternalServiceError
from config.settings import settings


logger = logging.getLogger(__name__)

# S3Error: o MinIO respondeu com erro. ConnectionFailure: o MinIO não respondeu
# (fora do ar, endereço errado), que antes escapava como erro 500 genérico.
STORAGE_ERRORS = (S3Error, ConnectionFailure)

UNAVAILABLE_MESSAGE = (
    "Serviço de armazenamento de arquivos indisponível no momento. "
    "Tente novamente em instantes."
)

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}


def _matches_signature(content_type: str, header: bytes) -> bool:
    """Confere a assinatura (magic bytes) do início do arquivo com o tipo declarado."""
    if content_type == "application/pdf":
        return header.startswith(b"%PDF-")
    if content_type == "image/png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return header.startswith(b"\xff\xd8\xff")
    if content_type == "image/webp":
        return header[:4] == b"RIFF" and header[8:12] == b"WEBP"
    return False

DOWNLOAD_URL_EXPIRES_SECONDS = 300
MINIO_DEFAULT_REGION = "us-east-1"


class StorageError(ExternalServiceError):
    pass


class InvalidFileError(DomainError):
    pass


class MinioStorageService:
    def __init__(self) -> None:
        self.client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        # A assinatura do link inclui o host, então o link de download precisa
        # ser gerado com o endereço que o navegador acessa. A região é fixada
        # para que a assinatura seja calculada localmente, sem consultar esse
        # endereço (que pode não ser acessível de dentro do container).
        self.public_client = (
            Minio(
                endpoint=settings.minio_public_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure,
                region=MINIO_DEFAULT_REGION,
            )
            if settings.minio_public_endpoint
            else self.client
        )
        self.bucket_name = settings.minio_bucket_name

    def ensure_bucket_exists(self) -> None:
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
        except STORAGE_ERRORS as exc:
            raise StorageError(UNAVAILABLE_MESSAGE) from exc

    def upload_certificate(
        self,
        *,
        file: UploadFile,
        student_id: uuid.UUID,
    ) -> str:
        self._validate_file(file)

        self.ensure_bucket_exists()

        file_size = self._get_file_size(file.file)
        max_size_bytes = settings.upload_max_size_mb * 1024 * 1024

        if file_size > max_size_bytes:
            raise InvalidFileError(
                f"Arquivo excede o limite de {settings.upload_max_size_mb}MB."
            )

        safe_filename = Path(file.filename or "certificate").name
        object_name = f"certificates/{student_id}/{uuid.uuid4()}_{safe_filename}"

        try:
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                data=file.file,
                length=file_size,
                content_type=file.content_type,
            )
        except STORAGE_ERRORS as exc:
            raise StorageError(UNAVAILABLE_MESSAGE) from exc

        return object_name

    def remove_certificate(self, object_name: str) -> None:
        """
        Remove um certificado já enviado. Usado para desfazer o upload quando
        a gravação no banco falha; por isso não lança exceção, apenas registra
        no log os casos em que o arquivo não pôde ser removido.
        """
        try:
            self.client.remove_object(self.bucket_name, object_name)
        except STORAGE_ERRORS:
            logger.exception("certificate_cleanup_failed | object_name=%s", object_name)

    def generate_download_url(
        self,
        *,
        object_name: str,
        file_name: str,
        expires_in_seconds: int = DOWNLOAD_URL_EXPIRES_SECONDS,
    ) -> str:
        safe_file_name = file_name.replace('"', "")

        try:
            return self.public_client.presigned_get_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                expires=timedelta(seconds=expires_in_seconds),
                response_headers={
                    "response-content-disposition": (
                        f'inline; filename="{safe_file_name}"'
                    ),
                },
            )
        except STORAGE_ERRORS as exc:
            raise StorageError(UNAVAILABLE_MESSAGE) from exc

    def _validate_file(self, file: UploadFile) -> None:
        if not file.filename:
            raise InvalidFileError("Arquivo não informado.")

        if file.content_type not in ALLOWED_CONTENT_TYPES:
            raise InvalidFileError(
                "Tipo de arquivo inválido. Envie PDF, JPG, PNG ou WEBP."
            )

        # O content_type é informado pelo cliente e pode ser falsificado;
        # por isso o conteúdo do arquivo também é verificado.
        header = file.file.read(12)
        file.file.seek(0)

        if not _matches_signature(file.content_type, header):
            raise InvalidFileError(
                "O conteúdo do arquivo não corresponde ao tipo informado. "
                "Envie PDF, JPG, PNG ou WEBP."
            )

    def _get_file_size(self, file: BinaryIO) -> int:
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)

        return file_size


def get_storage_service() -> MinioStorageService:
    return MinioStorageService()