from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.database import get_db
from app.models import Document
from app.schemas import SearchRequest, SearchResult
from app.services import EmbeddingsService, QdrantService

router = APIRouter(prefix="/api/v1/search", tags=["Search"])

# Initialize services
embeddings_service = EmbeddingsService()
qdrant_service = QdrantService()


def get_tenant_id(x_tenant_id: str = Header(..., alias="X-Tenant-Id")) -> UUID:
    """Extract tenant ID from header"""
    try:
        return UUID(x_tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant ID format")


@router.post("", response_model=List[SearchResult])
def search_knowledge_bases(
    search_request: SearchRequest,
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """
    Search across knowledge bases using RAG (Retrieval Augmented Generation).

    This endpoint generates an embedding for the query and searches for similar
    chunks in the specified knowledge bases using Qdrant vector database.
    """
    # Generate embedding for query
    try:
        query_vector = embeddings_service.generate_embedding(search_request.query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate query embedding: {str(e)}")

    # Search in Qdrant with tenant and KB filtering
    try:
        results = qdrant_service.search(
            query_vector=query_vector,
            tenant_id=tenant_id,
            kb_ids=search_request.knowledge_base_ids,
            top_k=search_request.top_k,
            min_score=search_request.min_score
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    # Enhance results with document filenames from database
    if results:
        doc_ids = list(set([UUID(r["document_id"]) for r in results]))
        documents = db.query(Document).filter(
            Document.id.in_(doc_ids),
            Document.tenant_id == tenant_id
        ).all()

        doc_map = {str(doc.id): doc.filename for doc in documents}

        for result in results:
            result["document_filename"] = doc_map.get(result["document_id"], "Unknown")

    # Convert to SearchResult models
    search_results = [SearchResult(**r) for r in results]

    return search_results
