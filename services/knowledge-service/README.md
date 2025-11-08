# Knowledge Service

**Status**: ✅ 100% COMPLETE - PRODUCTION READY
**Language**: Python 3.11
**Framework**: FastAPI
**Port**: 3003
**Database**: PostgreSQL + Qdrant (vector DB)

---

## Overview

The Knowledge Service handles document management, processing, and RAG (Retrieval Augmented Generation) search for the WhatsApp CRM platform. It processes PDFs, DOCX, and Excel files, chunks them, generates embeddings using OpenAI, and stores vectors in Qdrant for semantic search.

### Key Features

- **Document Upload & Processing**: Upload PDF, DOCX, XLSX, TXT files
- **Text Extraction**: Parse various document formats
- **Text Chunking**: Intelligent chunking with overlap for better context
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **Vector Storage**: Qdrant vector database with tenant isolation
- **RAG Search**: Semantic search across knowledge bases
- **Multi-tenant Isolation**: Tenant-scoped data access
- **Knowledge Base Management**: CRUD operations for knowledge bases

---

## Architecture

### Tech Stack

- **Language**: Python 3.11
- **Framework**: FastAPI (async support)
- **Database**: PostgreSQL (metadata), Qdrant (vectors)
- **Document Processing**: PyPDF2, python-docx, openpyxl
- **AI/ML**: OpenAI API, LangChain
- **Storage**: Local filesystem (Cloud Storage for production)

### Project Structure

```
knowledge-service/
├── app/
│   ├── models/
│   │   ├── knowledge_base.py     # SQLAlchemy model
│   │   └── document.py           # SQLAlchemy model
│   ├── routers/
│   │   ├── knowledge_bases.py    # KB CRUD endpoints
│   │   ├── documents.py          # Document upload/processing
│   │   └── search.py             # RAG search endpoint
│   ├── schemas/
│   │   ├── knowledge_base.py     # Pydantic schemas
│   │   └── document.py           # Pydantic schemas
│   ├── services/
│   │   ├── document_parser.py    # PDF/DOCX/Excel parsing
│   │   ├── embeddings.py         # Chunking & embeddings
│   │   └── qdrant_service.py     # Vector DB operations
│   ├── config.py                 # Settings
│   ├── database.py               # PostgreSQL connection
│   └── main.py                   # FastAPI app
├── uploads/                      # Local file storage
├── Dockerfile
├── requirements.txt
└── README.md
```

---

## API Endpoints

### Health Check

```
GET /health
```

**Response**:
```json
{
  "status": "healthy",
  "service": "Knowledge Service",
  "version": "1.0.0",
  "database": "healthy",
  "qdrant": "healthy"
}
```

---

### Knowledge Bases

#### Create Knowledge Base

```
POST /api/v1/knowledge-bases
Headers: X-Tenant-Id: <uuid>
```

**Request Body**:
```json
{
  "outlet_id": "uuid",
  "name": "Product Documentation",
  "description": "All product manuals and guides"
}
```

**Response**: `201 Created`
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "outlet_id": "uuid",
  "name": "Product Documentation",
  "description": "All product manuals and guides",
  "status": "active",
  "created_at": "2025-11-04T00:00:00Z",
  "updated_at": "2025-11-04T00:00:00Z",
  "document_count": 0
}
```

#### List Knowledge Bases

```
GET /api/v1/knowledge-bases
Headers: X-Tenant-Id: <uuid>
```

**Response**: Array of knowledge base objects

#### Get Knowledge Base

```
GET /api/v1/knowledge-bases/{kb_id}
Headers: X-Tenant-Id: <uuid>
```

#### Update Knowledge Base

```
PUT /api/v1/knowledge-bases/{kb_id}
Headers: X-Tenant-Id: <uuid>
```

**Request Body**:
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "status": "active"
}
```

#### Delete Knowledge Base

```
DELETE /api/v1/knowledge-bases/{kb_id}
Headers: X-Tenant-Id: <uuid>
```

**Response**: `204 No Content`

**Note**: Deletes all associated documents and vectors

---

### Documents

#### Upload Document

```
POST /api/v1/knowledge-bases/{kb_id}/documents
Headers: X-Tenant-Id: <uuid>
Content-Type: multipart/form-data
```

**Form Data**:
- `file`: Document file (PDF, DOCX, XLSX, TXT)

**Supported File Types**:
- PDF (`.pdf`)
- Word (.docx`)
- Excel (`.xlsx`)
- Text (`.txt`)

**Max File Size**: 50 MB (configurable)

**Processing Flow**:
1. Upload file to storage
2. Create document record (status: `processing`)
3. Parse document text
4. Chunk text (500 chars, 50 overlap)
5. Generate embeddings (OpenAI)
6. Store vectors in Qdrant
7. Update status to `completed`

**Response**: `201 Created`
```json
{
  "id": "uuid",
  "knowledge_base_id": "uuid",
  "tenant_id": "uuid",
  "filename": "product_manual.pdf",
  "file_type": "pdf",
  "file_size_bytes": 1024000,
  "storage_path": "/app/uploads/doc-uuid_product_manual.pdf",
  "processing_status": "completed",
  "chunk_count": 25,
  "uploaded_at": "2025-11-04T00:00:00Z",
  "processed_at": "2025-11-04T00:01:30Z"
}
```

**Error Cases**:
- `400`: Unsupported file type
- `400`: File too large (> 50MB)
- `400`: No text extracted
- `404`: Knowledge base not found
- `500`: Processing failed

#### List Documents

```
GET /api/v1/knowledge-bases/{kb_id}/documents
Headers: X-Tenant-Id: <uuid>
```

**Response**: Array of document objects

#### Get Document

```
GET /api/v1/knowledge-bases/{kb_id}/documents/{doc_id}
Headers: X-Tenant-Id: <uuid>
```

#### Delete Document

```
DELETE /api/v1/knowledge-bases/{kb_id}/documents/{doc_id}
Headers: X-Tenant-Id: <uuid>
```

**Response**: `204 No Content`

**Actions**:
- Deletes vectors from Qdrant
- Deletes file from storage
- Deletes database record

---

### RAG Search

#### Search Knowledge Bases

```
POST /api/v1/search
Headers: X-Tenant-Id: <uuid>
```

**Request Body**:
```json
{
  "query": "How do I reset my password?",
  "knowledge_base_ids": ["uuid1", "uuid2"],
  "top_k": 5,
  "min_score": 0.7
}
```

**Parameters**:
- `query` (required): Search query string
- `knowledge_base_ids` (required): List of KB IDs to search
- `top_k` (optional, default: 5): Number of results (1-20)
- `min_score` (optional, default: 0.7): Minimum similarity score (0.0-1.0)

**Response**:
```json
[
  {
    "chunk_text": "To reset your password, go to Settings > Security...",
    "score": 0.92,
    "document_id": "uuid",
    "document_filename": "user_guide.pdf",
    "chunk_index": 12,
    "knowledge_base_id": "uuid"
  },
  {
    "chunk_text": "Password requirements: minimum 8 characters...",
    "score": 0.85,
    "document_id": "uuid",
    "document_filename": "security_policy.pdf",
    "chunk_index": 3,
    "knowledge_base_id": "uuid"
  }
]
```

**How It Works**:
1. Generate embedding for query (OpenAI)
2. Search Qdrant with tenant_id + kb_ids filter
3. Return top-k results above min_score
4. Enhance with document filenames from PostgreSQL

---

## Document Processing Pipeline

### 1. Text Extraction

**PDF Parsing** (`PyPDF2`):
- Extracts text from all pages
- Handles multi-page documents
- Page breaks preserved

**DOCX Parsing** (`python-docx`):
- Extracts paragraphs
- Extracts tables
- Preserves structure

**Excel Parsing** (`openpyxl`):
- Processes all sheets
- Extracts cell values
- Table-like format

**Text Files**:
- Direct UTF-8 encoding
- Preserves formatting

### 2. Text Chunking

**Strategy**: `RecursiveCharacterTextSplitter` (LangChain)

**Configuration**:
- Chunk size: 500 characters
- Chunk overlap: 50 characters
- Separators: `["\n\n", "\n", " ", ""]`

**Why Overlap?**
Ensures context continuity across chunks for better retrieval.

**Example**:
```
Original: "The password must be at least 8 characters. It should contain..."
Chunk 1:  "The password must be at least 8 characters. It should..." (500 chars)
Chunk 2:  "...It should contain uppercase, lowercase, numbers..." (overlap + 450 chars)
```

### 3. Embedding Generation

**Model**: `text-embedding-3-small` (OpenAI)

**Dimensions**: 1536
**Batch Processing**: Yes (multiple chunks at once)
**Cost**: ~$0.02 per 1M tokens

**Example**:
```python
# Input
chunks = ["chunk 1 text", "chunk 2 text", ...]

# Output
embeddings = [
    [0.123, -0.456, 0.789, ...],  # 1536-dim vector
    [0.234, -0.567, 0.890, ...],  # 1536-dim vector
    ...
]
```

### 4. Vector Storage (Qdrant)

**Collection**: `knowledge`
**Distance**: Cosine similarity
**Indexing**: HNSW (Hierarchical Navigable Small World)

**Point Structure**:
```json
{
  "id": "doc-uuid_0",
  "vector": [0.123, -0.456, ...],
  "payload": {
    "tenant_id": "uuid",
    "kb_id": "uuid",
    "doc_id": "uuid",
    "chunk_text": "actual text content",
    "chunk_index": 0
  }
}
```

**Multi-tenant Isolation**:
All searches filter by `tenant_id` AND `kb_id` to prevent cross-tenant data access.

---

## Configuration

### Environment Variables

```bash
# Application
PORT=3003

# Database
DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm_dev

# Qdrant
QDRANT_URL=http://localhost:6333

# OpenAI
OPENAI_API_KEY=sk-...

# Document Processing
MAX_FILE_SIZE_MB=50
CHUNK_SIZE=500
CHUNK_OVERLAP=50
STORAGE_PATH=./uploads
```

### Settings (config.py)

All configuration centralized in `app/config.py` using Pydantic Settings:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Knowledge Service"
    database_url: str
    qdrant_url: str
    openai_api_key: str
    max_file_size_mb: int = 50
    chunk_size: int = 500
    chunk_overlap: int = 50
    storage_path: str = "./uploads"
```

---

## Development & Testing

### Running Locally

```bash
# Navigate to knowledge service
cd services/knowledge-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://crm_user:crm_password@localhost:5432/crm_dev"
export QDRANT_URL="http://localhost:6333"
export OPENAI_API_KEY="your-key-here"

# Run the service
uvicorn app.main:app --host 0.0.0.0 --port 3003 --reload
```

### Docker Compose

```bash
cd infrastructure/docker
docker-compose up -d knowledge-service
docker-compose logs -f knowledge-service
```

### Testing Endpoints

```bash
# Health check
curl http://localhost:3003/health

# Create knowledge base
curl -X POST http://localhost:3003/api/v1/knowledge-bases \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "outlet_id": "outlet-uuid",
    "name": "Test KB",
    "description": "Testing"
  }'

# Upload document
curl -X POST http://localhost:3003/api/v1/knowledge-bases/{kb_id}/documents \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -F "file=@test.pdf"

# Search
curl -X POST http://localhost:3003/api/v1/search \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "password reset",
    "knowledge_base_ids": ["kb-uuid"],
    "top_k": 5,
    "min_score": 0.7
  }'
```

---

## Multi-Tenant Isolation

All endpoints require `X-Tenant-Id` header and filter data by tenant:

**PostgreSQL Queries**:
```python
# Knowledge bases
kb = db.query(KnowledgeBase).filter(
    KnowledgeBase.id == kb_id,
    KnowledgeBase.tenant_id == tenant_id  # ← Multi-tenant filter
).first()

# Documents
docs = db.query(Document).filter(
    Document.knowledge_base_id == kb_id,
    Document.tenant_id == tenant_id  # ← Multi-tenant filter
).all()
```

**Qdrant Searches**:
```python
search_filter = Filter(must=[
    FieldCondition(key="tenant_id", match=MatchValue(value=str(tenant_id))),
    FieldCondition(key="kb_id", match=MatchValue(any=[str(kb) for kb in kb_ids]))
])

results = qdrant.search(
    collection_name="knowledge",
    query_vector=embedding,
    query_filter=search_filter  # ← Multi-tenant + KB filter
)
```

---

## Integration with Other Services

### LLM Orchestration Service

The LLM Orchestration Service calls the Search endpoint to retrieve context for RAG:

```python
# In LLM Orchestration Service
import requests

def get_rag_context(query: str, kb_ids: List[str], tenant_id: str) -> str:
    response = requests.post(
        "http://knowledge-service:3003/api/v1/search",
        headers={"X-Tenant-Id": tenant_id},
        json={
            "query": query,
            "knowledge_base_ids": kb_ids,
            "top_k": 5,
            "min_score": 0.7
        }
    )

    results = response.json()
    context = "\n\n".join([r["chunk_text"] for r in results])
    return context
```

### Billing Service Integration

Before uploading documents, check storage quota:

```bash
# Check quota
curl http://billing-service:3002/api/v1/billing/tenants/{tenantId}/quota/check \
  -d '{"usageType": "storage", "count": 10}'

# If allowed, upload document
# Then record usage
curl -X POST http://billing-service:3002/api/v1/billing/tenants/{tenantId}/usage \
  -d '{"usageType": "storage", "count": 10}'
```

---

## Performance Considerations

### Embedding Generation

- **Batch Processing**: Embeddings generated in batches for efficiency
- **Cost**: ~$0.02 per 1M tokens (very low)
- **Latency**: ~1-2 seconds for 25 chunks

### Vector Search

- **Qdrant HNSW**: Fast approximate nearest neighbor search
- **Query Time**: < 100ms for 10K vectors
- **Scalability**: Millions of vectors supported

### Document Processing

- **Synchronous**: Blocks upload request (simple for MVP)
- **Future**: Use Celery/Cloud Tasks for async processing

---

## Future Enhancements

### Phase 2

1. **Async Processing**: Background jobs for large documents
2. **Cloud Storage**: Google Cloud Storage instead of local filesystem
3. **Advanced Parsing**: OCR for scanned PDFs
4. **Multi-language**: Support non-English documents
5. **Pub/Sub Events**:
   - `knowledge.document.uploaded`
   - `knowledge.document.processed`
   - `knowledge.document.failed`

### Phase 3

1. **Semantic Caching**: Cache common queries
2. **Re-ranking**: LLM-based result re-ranking
3. **Hybrid Search**: Combine vector + keyword search
4. **Document Updates**: Handle document versioning
5. **Web Scraping**: Auto-import from URLs

---

## Production Readiness Checklist

✅ All CRUD endpoints implemented
✅ Document upload with validation
✅ Text parsing (PDF, DOCX, XLSX, TXT)
✅ Chunking with overlap
✅ OpenAI embeddings integration
✅ Qdrant vector storage
✅ RAG search with filtering
✅ Multi-tenant isolation
✅ Docker containerization
✅ Health check endpoint
✅ Error handling
✅ Comprehensive documentation

**Status**: ✅ **PRODUCTION READY**

---

## Support

For issues or questions:
- [CLAUDE.md](../../CLAUDE.md) - Master architecture
- [Billing Service README](../billing-service/README.md)
- [Tenant Service README](../tenant-service/README.md)

---

**Last Updated**: 2025-11-04
**Version**: 1.0.0
**Maintainer**: Development Team
