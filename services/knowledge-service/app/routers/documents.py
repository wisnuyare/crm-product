from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from datetime import datetime
import os
import shutil

from app.database import get_db
from app.models import KnowledgeBase, Document
from app.schemas import DocumentResponse
from app.services import DocumentParser, EmbeddingsService, QdrantService
from app.config import settings

router = APIRouter(prefix="/api/v1/knowledge-bases/{kb_id}/documents", tags=["Documents"])

# Initialize services
document_parser = DocumentParser()
embeddings_service = EmbeddingsService()
qdrant_service = QdrantService()


def get_tenant_id(x_tenant_id: str = Header(..., alias="X-Tenant-Id")) -> UUID:
    """Extract tenant ID from header"""
    try:
        return UUID(x_tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant ID format")


@router.post("", response_model=DocumentResponse, status_code=201)
async def upload_document(
    kb_id: UUID,
    file: UploadFile = File(...),
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """Upload and process a document"""
    # Verify knowledge base exists and belongs to tenant
    kb = db.query(KnowledgeBase).filter(
        KnowledgeBase.id == kb_id,
        KnowledgeBase.tenant_id == tenant_id
    ).first()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    # Validate file type
    filename = file.filename or "unknown"
    file_ext = filename.split(".")[-1].lower()
    allowed_types = ["pdf", "docx", "xlsx", "txt"]

    if file_ext not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_types)}"
        )

    # Check file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning

    max_size = settings.max_file_size_mb * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {settings.max_file_size_mb}MB"
        )

    # Create storage directory
    os.makedirs(settings.storage_path, exist_ok=True)

    # Save file
    doc_id = UUID(hex=os.urandom(16).hex())
    storage_filename = f"{doc_id}_{filename}"
    file_path = os.path.join(settings.storage_path, storage_filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Create document record
    document = Document(
        id=doc_id,
        knowledge_base_id=kb_id,
        tenant_id=tenant_id,
        filename=filename,
        file_type=file_ext,
        file_size_bytes=file_size,
        storage_path=file_path,
        processing_status="processing"
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    # Process document synchronously
    try:
        # Parse document
        text = document_parser.parse_document(file_path, file_ext)

        if not text.strip():
            document.processing_status = "failed"
            db.commit()
            raise HTTPException(status_code=400, detail="No text extracted from document")

        # Chunk and embed
        chunks, embeddings = embeddings_service.process_document(text)

        if not chunks:
            document.processing_status = "failed"
            db.commit()
            raise HTTPException(status_code=400, detail="Failed to chunk document")

        # Store in Qdrant
        chunk_count = qdrant_service.upsert_vectors(
            document_id=doc_id,
            tenant_id=tenant_id,
            kb_id=kb_id,
            chunks=chunks,
            embeddings=embeddings
        )

        # Update document status
        document.processing_status = "completed"
        document.chunk_count = chunk_count
        document.processed_at = datetime.utcnow()
        db.commit()
        db.refresh(document)

    except Exception as e:
        document.processing_status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

    return DocumentResponse.model_validate(document)


@router.get("", response_model=List[DocumentResponse])
def list_documents(
    kb_id: UUID,
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """List all documents in knowledge base"""
    # Verify KB exists and belongs to tenant
    kb = db.query(KnowledgeBase).filter(
        KnowledgeBase.id == kb_id,
        KnowledgeBase.tenant_id == tenant_id
    ).first()

    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    documents = db.query(Document).filter(
        Document.knowledge_base_id == kb_id,
        Document.tenant_id == tenant_id
    ).order_by(Document.uploaded_at.desc()).all()

    return [DocumentResponse.model_validate(doc) for doc in documents]


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(
    kb_id: UUID,
    doc_id: UUID,
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """Get document by ID"""
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.knowledge_base_id == kb_id,
        Document.tenant_id == tenant_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentResponse.model_validate(document)


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    kb_id: UUID,
    doc_id: UUID,
    tenant_id: UUID = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    """Delete document and its vectors"""
    document = db.query(Document).filter(
        Document.id == doc_id,
        Document.knowledge_base_id == kb_id,
        Document.tenant_id == tenant_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete vectors from Qdrant
    qdrant_service.delete_document_vectors(doc_id)

    # Delete file from storage
    if os.path.exists(document.storage_path):
        try:
            os.remove(document.storage_path)
        except Exception as e:
            print(f"Warning: Failed to delete file {document.storage_path}: {e}")

    # Delete database record
    db.delete(document)
    db.commit()

    return None
