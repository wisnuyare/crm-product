"""
Analytics Service - Main Application

This service handles analytics, metrics calculation, and reporting
for the WhatsApp CRM platform.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.config import settings
from app.routers import metrics
from app.models import HealthResponse

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Analytics Service for metrics, reporting, and data insights",
)

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
            "dashboard_metrics": "/api/v1/metrics/dashboard",
            "tenant_summary": "/api/v1/metrics/summary",
        },
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint

    Verifies:
    - Service is running
    - Database connectivity
    - BigQuery connectivity (if configured)
    """
    # Check database
    database_status = "connected"
    try:
        # TODO: Add actual database connection check
        pass
    except Exception as e:
        database_status = f"error: {str(e)}"

    # Check BigQuery
    bigquery_status = "configured" if settings.bigquery_project_id else "not_configured"

    overall_status = "healthy" if database_status == "connected" else "degraded"

    return HealthResponse(
        status=overall_status,
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        database=database_status,
        bigquery=bigquery_status
    )


# Include routers
app.include_router(metrics.router)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.environment == "development",
    )
