from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Sistema de Horas Complementares"
    app_version: str = "0.1.0"
    environment: str = "development"

    postgres_db: str
    postgres_user: str
    postgres_password: str
    postgres_host: str
    postgres_port: int

    database_url: str

    pgadmin_default_email: str
    pgadmin_default_password: str

    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    jwt_refresh_token_expire_days: int

    default_root_password: str
    default_coordinator_password: str


    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()