from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class KnowledgeBaseCreate(BaseModel):
    outlet_id: UUID = Field(..., description="Outlet ID this knowledge base belongs to")
    name: str = Field(..., min_length=1, max_length=255, description="Name of the knowledge base")
    description: Optional[str] = Field(None, description="Description of the knowledge base")


class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(active|inactive)$")


class KnowledgeBaseResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    outlet_id: UUID
    name: str
    description: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime
    document_count: Optional[int] = 0

    class Config:
        from_attributes = True
