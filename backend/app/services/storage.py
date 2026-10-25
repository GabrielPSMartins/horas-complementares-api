import uuid
from datetime import timedelta
from pathlib import Path
from typing import BinaryIO

from fastapi import UploadFile
from minio import Minio
from minio.error import S3Error

from config.settings import settings


ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}

DOWNLOAD_URL_EXPIRES_SECONDS = 300


class StorageError(Exception):
    pass


class InvalidFileError(Exception):
    pass


class MinioStorageService:
    def __init__(self) -> None:
        self.client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self.bucket_name = settings.minio_bucket_name

    def ensure_bucket_exists(self) -> None:
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
        except S3Error as exc:
            raise StorageError("Erro ao verificar/criar bucket no MinIO.") from exc

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
        except S3Error as exc:
            raise StorageError("Erro ao enviar arquivo para o MinIO.") from exc

        return object_name

    def generate_download_url(
        self,
        *,
        object_name: str,
        file_name: str,
        expires_in_seconds: int = DOWNLOAD_URL_EXPIRES_SECONDS,
    ) -> str:
        safe_file_name = file_name.replace('"', "")

        try:
            return self.client.presigned_get_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                expires=timedelta(seconds=expires_in_seconds),
                response_headers={
                    "response-content-disposition": (
                        f'inline; filename="{safe_file_name}"'
                    ),
                },
            )
        except S3Error as exc:
            raise StorageError("Erro ao gerar link de download no MinIO.") from exc

    def _validate_file(self, file: UploadFile) -> None:
        if not file.filename:
            raise InvalidFileError("Arquivo não informado.")

        if file.content_type not in ALLOWED_CONTENT_TYPES:
            raise InvalidFileError(
                "Tipo de arquivo inválido. Envie PDF, JPG, PNG ou WEBP."
            )

    def _get_file_size(self, file: BinaryIO) -> int:
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)

        return file_size


def get_storage_service() -> MinioStorageService:
    return MinioStorageService()