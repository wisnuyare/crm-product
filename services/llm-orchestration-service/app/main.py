"""
LLM Orchestration Service - Main Application

This service handles LLM prompt assembly, RAG context retrieval,
and OpenAI API interactions for the WhatsApp CRM platform.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from prometheus_fastapi_instrumentator import PrometheusFastApiInstrumentator

from app.config import settings
from app.routers import generate

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="LLM Orchestration Service for RAG-powered conversational AI",
)

# Instrument for Prometheus
PrometheusFastApiInstrumentator().instrument(app).expose(app)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "endpoints": {
            "health": "/health",
            "generate": "/api/v1/llm/generate",
            "stream": "/api/v1/llm/stream",
        },
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint

    Verifies:
    - Service is running
    - OpenAI API key is configured
    - Dependent service URLs are configured
    """
    # Check OpenAI API key
    openai_configured = bool(settings.openai_api_key)

    # Check service URLs
    services_configured = all(
        [
            settings.knowledge_service_url,
            settings.conversation_service_url,
            settings.tenant_service_url,
        ]
    )

    status = "healthy" if (openai_configured and services_configured) else "degraded"

    return {
        "status": status,
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "openai_configured": openai_configured,
        "services_configured": services_configured,
        "model": settings.openai_model,
    }


# Include routers
app.include_router(generate.router)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.environment == "development",
    )
