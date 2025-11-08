from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class DocumentResponse(BaseModel):
    id: UUID
    knowledge_base_id: UUID
    tenant_id: UUID
    filename: str
    file_type: str
    file_size_bytes: int
    storage_path: str
    processing_status: str
    chunk_count: int
    uploaded_at: datetime
    processed_at: Optional[datetime]

    class Config:
        from_attributes = True


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    knowledge_base_ids: List[UUID] = Field(..., description="List of knowledge base IDs to search")
    top_k: int = Field(5, ge=1, le=20, description="Number of results to return")
    min_score: float = Field(0.7, ge=0.0, le=1.0, description="Minimum similarity score")


class SearchResult(BaseModel):
    chunk_text: str
    score: float
    document_id: UUID
    document_filename: str
    chunk_index: int
    knowledge_base_id: UUID
