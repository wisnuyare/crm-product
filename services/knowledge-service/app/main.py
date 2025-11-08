from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.config import settings
from app.database import engine, Base
from app.routers import knowledge_bases, documents, search
from app.services import QdrantService

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Knowledge Service for RAG-powered document search and management"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
def health_check():
    """Health check endpoint"""
    try:
        # Check database
        from app.database import SessionLocal
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    # Check Qdrant
    try:
        qdrant = QdrantService()
        qdrant_info = qdrant.get_collection_info()
        qdrant_status = "healthy" if qdrant_info.get("status") == "ok" else "unhealthy"
    except Exception as e:
        qdrant_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy" if db_status == "healthy" and qdrant_status == "healthy" else "degraded",
        "service": settings.app_name,
        "version": settings.app_version,
        "database": db_status,
        "qdrant": qdrant_status
    }

# Include routers
app.include_router(knowledge_bases.router)
app.include_router(documents.router)
app.include_router(search.router)

# Root endpoint
@app.get("/")
def root():
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=True
    )
