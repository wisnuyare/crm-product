"""
LLM Orchestration Service - Main Application

This service handles LLM prompt assembly, RAG context retrieval,
and OpenAI API interactions for the WhatsApp CRM platform.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from prometheus_fastapi_instrumentator import PrometheusFastApiInstrumentator
import sys

from app.config import settings
from app.routers import generate, chat

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
    endpoints = {
        "health": "/health",
        "generate": "/api/v1/llm/generate (legacy)",
        "stream": "/api/v1/llm/stream (legacy)",
    }

    # Add multi-agent endpoints if enabled
    if settings.use_multi_agent:
        endpoints["chat"] = "/api/v1/llm/chat (multi-agent) ✨"
        endpoints["chat_health"] = "/api/v1/llm/chat/health"

    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "multi_agent_enabled": settings.use_multi_agent,
        "endpoints": endpoints,
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

# Include multi-agent chat router if enabled
if settings.use_multi_agent:
    app.include_router(chat.router)
    print(f"✨ Multi-Agent System ENABLED - /api/v1/llm/chat and /api/v1/llm/v2/chat available")
else:
    print(f"ℹ️  Multi-Agent System DISABLED - Using legacy /api/v1/llm/generate")


@app.on_event("startup")
async def startup_event():
    """Print all registered routes on startup"""
    print("\n📍 Registered Routes:")
    for route in app.routes:
        if hasattr(route, "methods"):
            methods = ", ".join(route.methods)
            print(f"  {methods} {route.path}")
        else:
            print(f"  {route.path}")
    print("\n")


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.environment == "development",
    )
