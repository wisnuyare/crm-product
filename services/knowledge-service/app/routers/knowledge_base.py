
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.database import get_db
from app.models import KnowledgeBase
from app.schemas import KnowledgeBaseCreate, KnowledgeBaseUpdate, KnowledgeBaseResponse

router = APIRouter()

@router.post("/", response_model=KnowledgeBaseResponse, status_code=201)
def create_knowledge_base(
    kb_create: KnowledgeBaseCreate,
    tenant_id: UUID, # This will be extracted from JWT in a real scenario
    db: Session = Depends(get_db)
):
    db_kb = KnowledgeBase(**kb_create.dict(), tenant_id=tenant_id)
    db.add(db_kb)
    db.commit()
    db.refresh(db_kb)
    return db_kb

@router.get("/", response_model=List[KnowledgeBaseResponse])
def get_knowledge_bases(
    tenant_id: UUID, # This will be extracted from JWT
    db: Session = Depends(get_db)
):
    kbs = db.query(KnowledgeBase).filter(KnowledgeBase.tenant_id == tenant_id).all()
    return kbs

@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
def get_knowledge_base(
    kb_id: UUID,
    tenant_id: UUID, # This will be extracted from JWT
    db: Session = Depends(get_db)
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.tenant_id == tenant_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    return kb

@router.put("/{kb_id}", response_model=KnowledgeBaseResponse)
def update_knowledge_base(
    kb_id: UUID,
    kb_update: KnowledgeBaseUpdate,
    tenant_id: UUID, # This will be extracted from JWT
    db: Session = Depends(get_db)
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.tenant_id == tenant_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    
    update_data = kb_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(kb, key, value)
    
    db.commit()
    db.refresh(kb)
    return kb

@router.delete("/{kb_id}", status_code=204)
def delete_knowledge_base(
    kb_id: UUID,
    tenant_id: UUID, # This will be extracted from JWT
    db: Session = Depends(get_db)
):
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.tenant_id == tenant_id).first()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    
    # Associated documents will be deleted by cascade
    db.delete(kb)
    db.commit()
    return

