import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Application
    app_name: str = "Knowledge Service"
    app_version: str = "1.0.0"
    port: int = 3003

    # Database
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://crm_user:crm_password@localhost:5432/crm_dev"
    )

    # Qdrant
    qdrant_url: str = os.getenv("QDRANT_URL", "http://localhost:6333")
    qdrant_collection: str = "knowledge"
    embedding_dimension: int = 1536  # text-embedding-3-small

    # OpenAI
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_embedding_model: str = "text-embedding-3-small"

    # Document Processing
    max_file_size_mb: int = 50
    chunk_size: int = 500
    chunk_overlap: int = 50

    # Storage (local for now, GCS later)
    storage_path: str = os.getenv("STORAGE_PATH", "./uploads")

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
