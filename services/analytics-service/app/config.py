"""
Configuration for Analytics Service
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings"""

    # App
    app_name: str = "Analytics Service"
    app_version: str = "1.0.0"
    port: int = 3007
    environment: str = "development"

    # Database (PostgreSQL)
    database_url: str = "postgresql://crm_user:crm_password@localhost:5432/crm_dev"

    # BigQuery
    bigquery_project_id: Optional[str] = None
    bigquery_dataset: str = "crm_analytics"
    google_application_credentials: Optional[str] = None

    # Service URLs
    tenant_service_url: str = "http://tenant-service:3001"
    conversation_service_url: str = "http://conversation-service:3004"

    # Cache
    redis_url: Optional[str] = "redis://localhost:6379"
    cache_ttl_seconds: int = 300  # 5 minutes

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
