# Knowledge Base RAG Flow Testing Guide

**Purpose**: Test the complete RAG (Retrieval Augmented Generation) pipeline
**Status**: Ready for Testing
**Date Created**: 2025-11-13

---

## Prerequisites

### 1. Required Tools
- ✅ Docker Desktop installed and running
- ✅ OpenAI API Key (for embeddings generation)
- ✅ WSL2 (if on Windows)
- ✅ Node.js 22+ (for frontend)

### 2. Environment Setup

Check if your .env file has a real OpenAI API key:
```bash
grep "OPENAI_API_KEY" .env
```

If it shows `sk-your-openai-api-key`, you need to update it with a real key:
```bash
# Edit .env file
nano .env

# Update this line:
OPENAI_API_KEY=sk-proj-your-real-openai-key-here
```

---

## Testing Steps

### Step 1: Start Docker Services

```bash
# Navigate to docker directory
cd infrastructure/docker

# Start all services
docker-compose up -d

# Check services are running
docker-compose ps

# Expected output: All services should show "Up" status
# Key services for RAG:
# - crm-postgres (PostgreSQL)
# - crm-qdrant (Vector database)
# - crm-knowledge-service (Port 3003)
# - crm-tenant-service (Port 3001)
```

**Wait 30-60 seconds** for all services to fully initialize.

### Step 2: Verify Knowledge Service Health

```bash
# Check health endpoint
curl http://localhost:3003/health | jq

# Expected response:
# {
#   "status": "healthy",
#   "service": "Knowledge Service",
#   "version": "1.0.0",
#   "database": "healthy",
#   "qdrant": "healthy"
# }
```

If `qdrant: "unhealthy"`, wait a few more seconds and retry.

### Step 3: Start Frontend

```bash
# Open new terminal
cd frontend

# Install dependencies (if not done)
npm install

# Start dev server
npm run dev

# Expected: Frontend starts on http://localhost:5173
```

### Step 4: Login to Frontend

1. Open browser: http://localhost:5173
2. Login with your test credentials
3. Navigate to **Knowledge Base** page

### Step 5: Create Knowledge Base

**In the Frontend UI:**

1. Click **"+ New"** button in Knowledge Bases sidebar
2. Fill in form:
   - **Outlet**: Select your outlet
   - **Name**: "Test RAG KB"
   - **Description**: "Testing document upload and RAG retrieval"
3. Click **"Create"**
4. Verify: New KB appears in sidebar

**What's Happening:**
- Frontend calls: `POST /api/v1/knowledge-bases`
- PostgreSQL stores KB metadata
- KB is now ready to receive documents

### Step 6: Prepare Test Document

Create a simple test PDF or text file:

**Option A: Create a text file**
```bash
cat > test-document.txt <<EOF
# Product Information

## Pricing
Our product costs $99 per month.
Enterprise plans start at $499 per month.

## Features
- Real-time collaboration
- Advanced analytics
- 24/7 customer support
- API access

## Refund Policy
We offer a 30-day money-back guarantee.
Full refunds are available within 30 days of purchase.

## Support
Email: support@example.com
Phone: 1-800-123-4567
EOF
```

**Option B: Use an existing PDF**
- Any small PDF (< 10MB)
- Contains readable text (not scanned images)

### Step 7: Upload Document

**In the Frontend UI:**

1. Select your "Test RAG KB" from sidebar
2. Click **"Upload Document"** button
3. Select your test file
4. Click **Upload**

**Watch the processing status:**
- Initial: "Processing" (blue badge)
- After 5-30 seconds: "Completed" (green badge)
- If failed: "Failed" (red badge) - check logs

**What's Happening Behind the Scenes:**

```
1. File Upload
   ├─ Frontend: POST /api/v1/knowledge-bases/{kb_id}/documents
   ├─ Knowledge Service receives file
   └─ File saved to /app/uploads/

2. Document Parsing
   ├─ Extracts text from file (PDF/DOCX/TXT/XLSX)
   └─ Validates text extraction succeeded

3. Chunking
   ├─ Splits text into chunks (500 chars, 50 overlap)
   ├─ Creates smaller segments for embedding
   └─ Example: 1 page PDF → 5-10 chunks

4. Embedding Generation
   ├─ Calls OpenAI API: text-embedding-3-small
   ├─ Generates 1536-dimension vectors for each chunk
   └─ Cost: ~$0.00002 per 1000 tokens

5. Vector Storage
   ├─ Stores vectors in Qdrant
   ├─ Metadata: tenant_id, kb_id, doc_id, chunk_text
   └─ Enables similarity search

6. Database Update
   ├─ Updates document status: "completed"
   ├─ Records chunk_count
   └─ Sets processed_at timestamp
```

### Step 8: Verify Document Processing

**Check document details in UI:**
- Status: "Completed" ✅
- Chunk count: Should show number (e.g., "8 chunks")
- File size: Matches uploaded file

**Verify via Docker logs:**
```bash
# View Knowledge Service logs
docker-compose logs -f knowledge-service

# Look for:
# - "Parsing document..."
# - "Generated X chunks"
# - "Generated X embeddings"
# - "Stored X vectors in Qdrant"
# - "Document processing completed"
```

**Verify in Qdrant:**
```bash
# Check Qdrant collection
curl http://localhost:6333/collections/knowledge | jq

# Expected response:
# {
#   "result": {
#     "name": "knowledge",
#     "vectors_count": <number of chunks>,
#     "points_count": <number of chunks>,
#     "status": "green"
#   }
# }
```

### Step 9: Test RAG Search (API)

Now test if we can retrieve relevant chunks based on a query.

**Test Query 1: Pricing Information**
```bash
# Get your tenant ID and KB ID from frontend URL or database
# Example: http://localhost:5173/knowledge-base?kb=abc-123

TENANT_ID="your-tenant-id-here"
KB_ID="your-kb-id-here"

# Perform search
curl -X POST http://localhost:3003/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -d '{
    "query": "What is the pricing?",
    "knowledge_base_ids": ["'$KB_ID'"],
    "top_k": 3,
    "min_score": 0.3
  }' | jq
```

**Expected Response:**
```json
[
  {
    "chunk_text": "Our product costs $99 per month. Enterprise plans start at $499 per month.",
    "document_id": "...",
    "document_filename": "test-document.txt",
    "score": 0.85,
    "kb_id": "...",
    "chunk_index": 2
  },
  {
    "chunk_text": "# Pricing\nOur product costs $99 per month...",
    "document_id": "...",
    "document_filename": "test-document.txt",
    "score": 0.78,
    "kb_id": "...",
    "chunk_index": 1
  }
]
```

**Test Query 2: Refund Policy**
```bash
curl -X POST http://localhost:3003/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -d '{
    "query": "What is your refund policy?",
    "knowledge_base_ids": ["'$KB_ID'"],
    "top_k": 3,
    "min_score": 0.3
  }' | jq
```

**Expected**: Returns chunks about 30-day money-back guarantee.

### Step 10: Test Multi-Tenant Isolation

**CRITICAL SECURITY TEST**

```bash
# Try to search with a DIFFERENT tenant ID
WRONG_TENANT_ID="00000000-0000-0000-0000-000000000000"

curl -X POST http://localhost:3003/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $WRONG_TENANT_ID" \
  -d '{
    "query": "pricing",
    "knowledge_base_ids": ["'$KB_ID'"],
    "top_k": 3,
    "min_score": 0.3
  }' | jq
```

**Expected Result:** Empty array `[]` or 404 error.
**Why:** Qdrant filters by tenant_id - no cross-tenant data leakage.

---

## Verification Checklist

### ✅ Document Upload
- [ ] Document uploads successfully
- [ ] Status changes from "Processing" → "Completed"
- [ ] Chunk count is displayed (> 0)
- [ ] File size is correct

### ✅ Chunking & Embeddings
- [ ] Qdrant shows vectors_count > 0
- [ ] Knowledge Service logs show "Generated X chunks"
- [ ] Knowledge Service logs show "Stored X vectors"
- [ ] No errors in docker-compose logs

### ✅ RAG Search
- [ ] Search returns relevant results
- [ ] Score values are between 0.0 and 1.0
- [ ] Higher scores for more relevant chunks
- [ ] Chunk text contains query-related content
- [ ] Document filename is correct

### ✅ Multi-Tenant Isolation
- [ ] Wrong tenant_id returns no results
- [ ] Only documents from correct tenant are retrieved
- [ ] No access to other tenants' data

### ✅ Performance
- [ ] Document processing completes in < 1 minute
- [ ] Search responds in < 2 seconds
- [ ] Embeddings generation cost is reasonable

---

## Troubleshooting

### Issue: Document stuck in "Processing"

**Check logs:**
```bash
docker-compose logs knowledge-service | tail -50
```

**Common causes:**
1. **OpenAI API key invalid**
   - Error: "Authentication failed"
   - Fix: Update .env with valid key, restart service

2. **Qdrant not ready**
   - Error: "Connection refused to Qdrant"
   - Fix: Wait 30s, restart: `docker-compose restart qdrant knowledge-service`

3. **File parsing failed**
   - Error: "No text extracted"
   - Fix: Try a different file format (PDF → TXT)

### Issue: Search returns empty results

**Check:**
1. Document status is "Completed" (not "Processing" or "Failed")
2. Chunk count > 0
3. Qdrant has vectors: `curl http://localhost:6333/collections/knowledge/points/scroll | jq`
4. min_score is not too high (try 0.0 for testing)
5. Tenant ID matches

### Issue: "Qdrant: unhealthy" in health check

**Fix:**
```bash
# Restart Qdrant
docker-compose restart qdrant

# Wait 30 seconds
sleep 30

# Check again
curl http://localhost:3003/health | jq
```

### Issue: OpenAI API errors

**Error: Rate limit exceeded**
- Cause: Too many requests
- Fix: Wait 1 minute, try again

**Error: Insufficient quota**
- Cause: OpenAI account has no credits
- Fix: Add credits at platform.openai.com/account/billing

---

## Expected Costs

**For testing with 10 documents (each ~1000 words):**

| Operation | Tokens | Cost |
|-----------|--------|------|
| Embeddings (upload) | ~100,000 | $0.002 |
| Embeddings (search queries) | ~1,000 | $0.00002 |
| **Total** | | **~$0.002** |

*Costs are minimal for testing. Production usage with 1000s of documents will be higher.*

---

## Next Steps After Successful Test

1. ✅ Mark "Test Knowledge Base RAG flow" as completed in gap analysis
2. Test RAG integration with LLM Orchestration Service
3. Test RAG context injection into conversation responses
4. Test with multiple document types (PDF, DOCX, XLSX)
5. Load test with 50+ documents

---

## Architecture Diagram

```
┌─────────────┐
│   Frontend  │
│  (React)    │
└──────┬──────┘
       │ POST /api/v1/knowledge-bases/{kb_id}/documents
       ↓
┌──────────────────────────────────────────────────────────┐
│           Knowledge Service (FastAPI)                    │
├──────────────────────────────────────────────────────────┤
│  1. Document Upload → Save to /app/uploads/              │
│  2. Parse Document → Extract text                        │
│  3. Chunk Text → RecursiveCharacterTextSplitter          │
│  4. Generate Embeddings → OpenAI API                     │
│  5. Store Vectors → Qdrant                               │
│  6. Update Database → PostgreSQL                         │
└──────┬───────────────────────────┬───────────────────────┘
       │                           │
       ↓                           ↓
┌──────────────┐          ┌──────────────┐
│  PostgreSQL  │          │    Qdrant    │
│  (Metadata)  │          │   (Vectors)  │
└──────────────┘          └──────────────┘
```

**Search Flow:**
```
┌─────────────┐
│   Query     │ "What is the pricing?"
└──────┬──────┘
       │ POST /api/v1/search
       ↓
┌──────────────────────────┐
│  Knowledge Service       │
│  1. Generate query vector│ → OpenAI API
│  2. Search Qdrant        │ → Top K similar vectors
│  3. Fetch metadata       │ → PostgreSQL
│  4. Return results       │
└──────┬───────────────────┘
       ↓
┌──────────────────────────┐
│  Search Results          │
│  [                       │
│    {chunk: "...",        │
│     score: 0.85,         │
│     document: "..."}     │
│  ]                       │
└──────────────────────────┘
```

---

## Success Criteria

✅ **RAG Flow is Working** when:

1. Documents upload and process to "Completed" status
2. Qdrant contains vectors for uploaded documents
3. Search queries return relevant chunks with scores > 0.5
4. Multi-tenant isolation is enforced (no cross-tenant access)
5. Processing time < 1 minute per document
6. No errors in service logs

**When all criteria are met, update MISSING_FEATURES_ANALYSIS.md:**
- Knowledge Base RAG Testing: ❌ → ✅
- Backend Integration: 60% → 70%
- Overall: 78% → 80%

---

## Support

**Issues with testing?**
- Check docker-compose logs: `docker-compose logs -f`
- Review service health: `curl http://localhost:3003/health`
- Verify .env has real OpenAI API key
- Ensure Docker Desktop is running
- Check port conflicts: `netstat -ano | findstr "3003"`

**Still stuck?**
- Review Knowledge Service code: `services/knowledge-service/app/`
- Check Qdrant admin UI: `http://localhost:6333/dashboard`
- Verify PostgreSQL connection: `docker-compose exec postgres psql -U crm_user -d crm_dev`
