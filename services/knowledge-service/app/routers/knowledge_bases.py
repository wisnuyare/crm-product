from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.database import get_db
from app.models import KnowledgeBase
from app.schemas import KnowledgeBaseCreate, KnowledgeBaseUpdate, KnowledgeBaseResponse

router = APIRouter(prefix="/api/v1/knowledge-bases", tags=["Knowledge Bases"])


def get_tenant_id(x_tenant_id: str = Header(..., alias="X-Tenant-Id")) -> UUID:
    """Extract tenant ID from header"""
    try:
        return UUID(x_tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant ID format")


@router.post("", response_model=KnowledgeBaseResponse, status_code=201)
def create_knowledge_base(
    kb: KnowledgeBaseCreate,
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """Create a new knowledge base"""
    # TODO: Check quota with Billing Service

    new_kb = KnowledgeBase(
        tenant_id=tenant_id,
        outlet_id=kb.outlet_id,
        name=kb.name,
        description=kb.description
    )

    db.add(new_kb)
    db.commit()
    db.refresh(new_kb)

    # Add document count
    response = KnowledgeBaseResponse.model_validate(new_kb)
    response.document_count = 0

    return response


@router.get("", response_model=List[KnowledgeBaseResponse])
def list_knowledge_bases(
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """List all knowledge bases for tenant"""
    kbs = db.query(KnowledgeBase).filter(
        KnowledgeBase.tenant_id == tenant_id
    ).order_by(KnowledgeBase.created_at.desc()).all()

    # Add document counts
    responses = []
    for kb in kbs:
        response = KnowledgeBaseResponse.model_validate(kb)
        response.document_count = len(kb.documents)
        responses.append(response)

    return responses


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
def get_knowledge_base(
    kb_id: UUID,
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """Get knowledge base by ID"""
    kb = db.query(KnowledgeBase).filter(
        KnowledgeBase.id == kb_id,
        KnowledgeBase.tenant_id == tenant_id
    ).first()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    response = KnowledgeBaseResponse.model_validate(kb)
    response.document_count = len(kb.documents)

    return response


@router.put("/{kb_id}", response_model=KnowledgeBaseResponse)
def update_knowledge_base(
    kb_id: UUID,
    updates: KnowledgeBaseUpdate,
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """Update knowledge base"""
    kb = db.query(KnowledgeBase).filter(
        KnowledgeBase.id == kb_id,
        KnowledgeBase.tenant_id == tenant_id
    ).first()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # Update fields
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(kb, field, value)

    db.commit()
    db.refresh(kb)

    response = KnowledgeBaseResponse.model_validate(kb)
    response.document_count = len(kb.documents)

    return response


@router.delete("/{kb_id}", status_code=204)
def delete_knowledge_base(
    kb_id: UUID,
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """Delete knowledge base and all associated documents"""
    kb = db.query(KnowledgeBase).filter(
        KnowledgeBase.id == kb_id,
        KnowledgeBase.tenant_id == tenant_id
    ).first()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # TODO: Delete vectors from Qdrant for all documents
    # TODO: Delete files from storage

    db.delete(kb)
    db.commit()

    return None
