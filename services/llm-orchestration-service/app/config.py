"""
Configuration for LLM Orchestration Service
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings"""

    # App
    app_name: str = "LLM Orchestration Service"
    app_version: str = "1.0.0"
    port: int = 3005
    environment: str = "development"

    # OpenAI
    openai_api_key: str
    openai_model: str = "gpt-4o-mini"
    openai_max_tokens: int = 4000
    openai_temperature: float = 0.7

    # Service URLs
    knowledge_service_url: str = "http://knowledge-service:3003"
    conversation_service_url: str = "http://conversation-service:3004"
    tenant_service_url: str = "http://tenant-service:3001"
    booking_service_url: str = "http://booking-service:3008"

    # RAG Settings
    rag_top_k: int = 5
    rag_min_score: float = 0.5

    # Context Settings
    conversation_history_limit: int = 4
    max_context_length: int = 4000

    # Cost Tracking (per 1K tokens)
    gpt4o_mini_input_cost: float = 0.00015  # $0.15 per 1M tokens
    gpt4o_mini_output_cost: float = 0.0006  # $0.60 per 1M tokens

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
