from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Sistema de Horas Complementares"
    app_version: str = "0.1.0"
    environment: str = "development"

    database_url: str

    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Usada apenas pelo seed de desenvolvimento para criar o usuário ROOT.
    default_root_password: str = ""

    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_name: str = "certificates"
    minio_secure: bool = False
    # Endereço do MinIO acessível pelo navegador, usado nos links de download.
    # Necessário quando a API roda em container (ex.: endpoint "minio:9000",
    # endereço público "localhost:9000"); se vazio, usa minio_endpoint.
    minio_public_endpoint: str | None = None
    upload_max_size_mb: int = 10

    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # O mesmo .env alimenta o docker-compose (POSTGRES_*, PGADMIN_*...),
        # então variáveis que a API não usa são ignoradas.
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


settings = Settings()
