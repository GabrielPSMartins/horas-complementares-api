import io
import uuid

import pytest
from fastapi import UploadFile
from sqlalchemy.orm import Session
from starlette.datastructures import Headers
from urllib3.exceptions import MaxRetryError

from app.main import app
from app.models.activity_attachment import ActivityAttachment
from app.models.activity_request import ActivityRequestStatus
from app.models.activity_type import ActivityType
from app.models.course import Course
from app.models.user import User, UserRole
from app.services.storage import UNAVAILABLE_MESSAGE, MinioStorageService, StorageError, get_storage_service
from tests.conftest import client_as, make_request, make_student, make_user


class OfflineMinioClient:
    """Simula o MinIO fora do ar: toda chamada falha na conexão, como o urllib3 faz."""

    def _fail(self, *args, **kwargs):
        raise MaxRetryError(pool=None, url="/certificates", reason="Connection refused")

    bucket_exists = make_bucket = put_object = presigned_get_object = _fail


def offline_storage() -> MinioStorageService:
    service = MinioStorageService()
    service.client = service.public_client = OfflineMinioClient()
    return service


def make_upload() -> UploadFile:
    return UploadFile(
        file=io.BytesIO(b"%PDF-1.4 teste"),
        filename="cert.pdf",
        headers=Headers({"content-type": "application/pdf"}),
    )


def test_upload_with_minio_offline_raises_storage_error() -> None:
    with pytest.raises(StorageError, match="indisponível"):
        offline_storage().upload_certificate(file=make_upload(), student_id=uuid.uuid4())


def test_download_url_with_minio_offline_raises_storage_error() -> None:
    with pytest.raises(StorageError, match="indisponível"):
        offline_storage().generate_download_url(object_name="certificates/x.pdf", file_name="x.pdf")


def test_download_route_with_minio_offline_returns_503(db: Session) -> None:
    coordinator = make_user(db, "coord", UserRole.COORDINATOR)
    course = Course(name="SI", code="SI", total_required_hours=200, max_extra_hours=10, coordinator_id=coordinator.id, is_active=True)
    db.add(course)
    db.flush()
    activity_type = ActivityType(course_id=course.id, name="Curso", description="", max_hours_per_request=50, requires_attachment=True, is_active=True)
    db.add(activity_type)
    db.flush()
    student = make_student(db, course, "Ana", "001", 3)
    activity_request = make_request(db, student, activity_type, ActivityRequestStatus.PENDING, None)
    attachment = ActivityAttachment(activity_request_id=activity_request.id, file_name="cert.pdf", file_url="certificates/x.pdf", content_type="application/pdf", size_bytes=14)
    db.add(attachment)
    db.commit()

    client = client_as(db, db.get(User, student.user_id))
    app.dependency_overrides[get_storage_service] = offline_storage

    response = client.get(f"/activity-requests/{activity_request.id}/attachments/{attachment.id}/download")

    assert response.status_code == 503
    assert response.json() == {"detail": UNAVAILABLE_MESSAGE}


class RecordingMinioClient:
    """Cliente MinIO simulado que registra as chamadas, para testar as regras do serviço."""

    def __init__(self, bucket_exists: bool = False, fail_remove: bool = False):
        self._bucket_exists = bucket_exists
        self.fail_remove = fail_remove
        self.calls: list[tuple] = []

    def bucket_exists(self, bucket):
        self.calls.append(("bucket_exists", bucket))
        return self._bucket_exists

    def make_bucket(self, bucket):
        self.calls.append(("make_bucket", bucket))

    def put_object(self, *, bucket_name, object_name, data, length, content_type):
        self.calls.append(("put_object", object_name, length, content_type, data.read()))

    def remove_object(self, bucket, name):
        if self.fail_remove:
            raise MaxRetryError(pool=None, url="/", reason="Connection refused")
        self.calls.append(("remove_object", name))

    def presigned_get_object(self, *, bucket_name, object_name, expires, response_headers):
        self.calls.append(("presigned", object_name, expires.total_seconds(), response_headers))
        return f"http://publico/{object_name}?assinado"


def storage_with(client: RecordingMinioClient, public_client: RecordingMinioClient | None = None) -> MinioStorageService:
    service = MinioStorageService()
    service.client = client
    service.public_client = public_client or client
    return service


def test_upload_creates_bucket_and_sanitizes_file_name() -> None:
    client = RecordingMinioClient(bucket_exists=False)
    student_id = uuid.uuid4()
    upload = UploadFile(file=io.BytesIO(b"%PDF-1.4 teste"), filename="../../etc/cert.pdf", headers=Headers({"content-type": "application/pdf"}))

    object_name = storage_with(client).upload_certificate(file=upload, student_id=student_id)

    assert object_name.startswith(f"certificates/{student_id}/") and object_name.endswith("_cert.pdf")
    assert ".." not in object_name
    assert client.calls[:2] == [("bucket_exists", "certificates"), ("make_bucket", "certificates")]
    assert client.calls[2] == ("put_object", object_name, 14, "application/pdf", b"%PDF-1.4 teste")


def test_upload_above_size_limit_is_rejected(monkeypatch) -> None:
    from app.services import storage as storage_module
    from app.services.storage import InvalidFileError

    monkeypatch.setattr(storage_module.settings, "upload_max_size_mb", 1)
    client = RecordingMinioClient(bucket_exists=True)
    big = UploadFile(file=io.BytesIO(b"%PDF-" + b"0" * (1024 * 1024)), filename="grande.pdf", headers=Headers({"content-type": "application/pdf"}))

    with pytest.raises(InvalidFileError, match="excede o limite de 1MB"):
        storage_with(client).upload_certificate(file=big, student_id=uuid.uuid4())

    assert not [c for c in client.calls if c[0] == "put_object"]


def test_download_url_is_signed_by_public_client_with_inline_file_name() -> None:
    internal, public = RecordingMinioClient(), RecordingMinioClient()

    url = storage_with(internal, public).generate_download_url(object_name="certificates/x.pdf", file_name='meu "cert".pdf')

    assert url == "http://publico/certificates/x.pdf?assinado"
    assert internal.calls == []
    assert public.calls == [("presigned", "certificates/x.pdf", 300.0, {"response-content-disposition": 'inline; filename="meu cert.pdf"'})]


def test_remove_certificate_ignores_storage_failures() -> None:
    ok, failing = RecordingMinioClient(), RecordingMinioClient(fail_remove=True)

    storage_with(ok).remove_certificate("certificates/a.pdf")
    storage_with(failing).remove_certificate("certificates/b.pdf")

    assert ok.calls == [("remove_object", "certificates/a.pdf")]
