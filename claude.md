# WhatsApp CRM Microservices Architecture - Master Reference

**Project**: Multi-tenant SaaS CRM with LLM-powered WhatsApp customer service
**Target Platform**: Google Cloud Platform (GCP)
**Development Tool**: Claude Code with WSL2 on Windows
**Initial Scale**: 2 tenants, 30-100 messages/day per outlet
**Target Growth**: 50+ tenants, 10,000 messages/day

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack Decisions](#technology-stack-decisions)
3. [Service Specifications](#service-specifications)
4. [Database Architecture](#database-architecture)
5. [Development Environment Setup](#development-environment-setup)
6. [Local Development Workflow](#local-development-workflow)
7. [Deployment Strategy](#deployment-strategy)
8. [Security & Compliance](#security--compliance)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SYSTEMS                         │
├─────────────────────────────────────────────────────────────────┤
│  [WhatsApp Cloud API] ←→ [Customers]                            │
│  [Firebase Auth] ←→ [Tenant Users/Admins]                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   API GATEWAY (Cloud Endpoints)                 │
│  - Firebase JWT validation                                       │
│  - Rate limiting per tenant                                      │
│  - Request routing                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      MICROSERVICES LAYER                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Tenant Service   │  │ Billing Service  │  │ Knowledge    │ │
│  │ (Node.js/NestJS) │  │ (Go/Gin)         │  │ Service      │ │
│  │ - Multi-tenant   │  │ - Subscriptions  │  │ (Python/     │ │
│  │ - Auth + RBAC    │  │ - Quota mgmt     │  │ FastAPI)     │ │
│  │ - Outlet mgmt    │  │ - Usage tracking │  │ - RAG        │ │
│  └──────────────────┘  └──────────────────┘  │ - Embeddings │ │
│                                                └──────────────┘ │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Conversation     │  │ LLM Orchestration│  │ Message      │ │
│  │ Service          │  │ Service          │  │ Sender       │ │
│  │ (Node.js/Express)│  │ (Python/FastAPI) │  │ (Go/Gin)     │ │
│  │ - State mgmt     │  │ - RAG pipeline   │  │ - WhatsApp   │ │
│  │ - WebSocket      │  │ - GPT-4o-mini    │  │ - Delivery   │ │
│  │ - Handoff logic  │  │ - Streaming      │  │ - Retry      │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │ Analytics Service│                                           │
│  │ (Python/FastAPI) │                                           │
│  │ - Metrics        │                                           │
│  │ - Reports        │                                           │
│  └──────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT BUS (Google Pub/Sub)                   │
│  Topics:                                                         │
│  - whatsapp.incoming.messages                                    │
│  - whatsapp.outgoing.messages                                    │
│  - knowledge.document.uploaded                                   │
│  - billing.quota.warning                                         │
│  - conversation.completed                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  [Cloud SQL PostgreSQL]  [Firestore]  [Qdrant]  [Cloud Storage]│
│  [BigQuery]              [Redis]                                │
└─────────────────────────────────────────────────────────────────┘
```

### Core Design Principles

1. **Polyglot Microservices**: Right language for each service's needs
2. **Multi-tenant Isolation**: Shared database with tenant_id filtering
3. **Event-Driven Communication**: Pub/Sub for async operations
4. **Cloud-Native**: GCP services (Cloud Run, Cloud SQL, Pub/Sub)
5. **Security First**: Firebase Auth, IAM, encryption at rest/transit

---

## Technology Stack Decisions

### Programming Languages & Frameworks

| Service                  | Language | Framework           | Rationale                                                                                |
| ------------------------ | -------- | ------------------- | ---------------------------------------------------------------------------------------- |
| **Tenant Service**       | Node.js  | NestJS              | Excellent DI container, modular architecture, TypeScript safety for multi-tenant context |
| **Billing Service**      | Go       | Gin                 | 5,000+ req/sec performance, type safety for financial operations, compiled reliability   |
| **Knowledge Service**    | Python   | FastAPI             | AI/ML ecosystem (LangChain, LlamaIndex), async support for embeddings                    |
| **Conversation Service** | Node.js  | Express + Socket.IO | Event-driven I/O perfect for WebSocket, Redis pub/sub for horizontal scaling             |
| **LLM Orchestration**    | Python   | FastAPI             | LangChain/LlamaIndex integration, streaming with async generators                        |
| **Message Sender**       | Go       | Gin                 | High throughput (1,000+ msg/sec), low memory footprint for workers                       |
| **Analytics Service**    | Python   | FastAPI             | Pandas/NumPy for transformations, ML integration potential                               |

### Infrastructure & Tools

**Cloud Platform**: Google Cloud Platform (GCP)

- **Region**: asia-southeast2 (Jakarta) for data residency
- **Compute**: Cloud Run (serverless containers)
- **Database**: Cloud SQL (PostgreSQL)
- **Message Queue**: Cloud Pub/Sub
- **Storage**: Cloud Storage
- **Analytics**: BigQuery
- **Auth**: Firebase Authentication
- **Monitoring**: Prometheus + Grafana + OpenTelemetry

**Development**:

- **OS**: Windows with WSL2 (Ubuntu)
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **IaC**: Terraform (planned)
- **Version Control**: Git (multi-repo strategy)

**Databases**:

- **Transactional**: PostgreSQL (Cloud SQL)
- **Real-time State**: Firestore
- **Caching**: Redis
- **Vector Search**: Qdrant (self-hosted on Cloud Run)
- **Analytics**: BigQuery

---

## Service Specifications

### 1. Tenant Service (Node.js + NestJS)

**Port**: 3001  
**Database**: PostgreSQL  
**Cache**: Redis

**Responsibilities**:

- Tenant CRUD operations
- Outlet management (1:many with tenant)
- WABA (WhatsApp Business API) configuration
- Firebase Auth integration
- LLM tone configuration
- User & role management

**Key APIs**:

```
POST   /api/v1/tenants
GET    /api/v1/tenants/:tenantId
PUT    /api/v1/tenants/:tenantId
POST   /api/v1/tenants/:tenantId/outlets
PUT    /api/v1/tenants/:tenantId/llm-config
GET    /api/v1/tenants/:tenantId/users
```

**Database Schema**:

```sql
-- Tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'active',
  llm_tone JSONB DEFAULT '{"tone": "professional"}',
  contact_email VARCHAR(255),
  firebase_tenant_id VARCHAR(255)
);

-- Outlets table (1:many with tenant)
CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  waba_phone_number VARCHAR(50) UNIQUE NOT NULL,
  waba_phone_number_id VARCHAR(255) NOT NULL,
  waba_business_account_id VARCHAR(255) NOT NULL,
  waba_access_token TEXT NOT NULL, -- encrypted
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'active'
);

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  firebase_uid VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'agent', -- admin, agent, viewer
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- Indexes
CREATE INDEX idx_outlets_tenant ON outlets(tenant_id);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_firebase ON users(firebase_uid);
```

**Docker Configuration**:

```dockerfile
# Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:22-alpine
RUN addgroup -g 1001 nodejs && adduser -S nodejs -u 1001
WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
USER nodejs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node healthcheck.js || exit 1
CMD ["node", "dist/main.js"]
```

---

### 2. Billing Service (Go + Gin)

**Port**: 3002  
**Database**: PostgreSQL  
**Cache**: Redis

**Responsibilities**:

- Subscription management (Starter/Growth/Enterprise tiers)
- Usage tracking (message counts, API calls)
- Quota enforcement (hard limits + 5% overage)
- Deposit management
- Invoice generation (manual for now)

**Subscription Tiers**:

```go
type SubscriptionTier struct {
    Name                string
    MonthlyPrice        float64
    MessageQuota        int
    OutletLimit         int
    KnowledgeBaseLimit  int
    StorageLimitMB      int
    OverageRate         float64
}

var Tiers = map[string]SubscriptionTier{
    "starter": {
        Name:               "Starter",
        MonthlyPrice:       99.00,
        MessageQuota:       500,
        OutletLimit:        1,
        KnowledgeBaseLimit: 1,
        StorageLimitMB:     50,
        OverageRate:        0.10,
    },
    "growth": {
        Name:               "Growth",
        MonthlyPrice:       299.00,
        MessageQuota:       2000,
        OutletLimit:        3,
        KnowledgeBaseLimit: 3,
        StorageLimitMB:     200,
        OverageRate:        0.08,
    },
    "enterprise": {
        Name:               "Enterprise",
        MonthlyPrice:       799.00,
        MessageQuota:       10000,
        OutletLimit:        10,
        KnowledgeBaseLimit: -1, // unlimited
        StorageLimitMB:     1024,
        OverageRate:        0.05,
    },
}
```

**Key APIs**:

```
GET    /api/v1/billing/tenants/:tenantId/quota
POST   /api/v1/billing/tenants/:tenantId/usage
GET    /api/v1/billing/tenants/:tenantId/subscription
PUT    /api/v1/billing/tenants/:tenantId/subscription
POST   /api/v1/billing/tenants/:tenantId/deposit
GET    /api/v1/billing/tenants/:tenantId/invoices
```

**Quota Enforcement Logic**:

1. Check current usage vs quota
2. If at 100%: Publish `billing.quota.warning` event
3. If > 100% and < 105%: Check deposit balance
4. If deposit available: Charge overage, continue
5. If no deposit or > 105%: Publish `billing.service.suspended`, return 429

---

### 3. Knowledge Service (Python + FastAPI)

**Port**: 3003  
**Database**: PostgreSQL (metadata), Cloud Storage (documents), Qdrant (vectors)

**Responsibilities**:

- Knowledge base CRUD (1:many with tenant)
- Document upload (PDF, Docs, Excel)
- Document parsing & chunking
- Embedding generation (text-embedding-3-small)
- Vector storage in Qdrant

**Key APIs**:

```
POST   /api/v1/knowledge-bases
GET    /api/v1/knowledge-bases/:kbId
POST   /api/v1/knowledge-bases/:kbId/documents
GET    /api/v1/knowledge-bases/:kbId/documents
DELETE /api/v1/knowledge-bases/:kbId/documents/:docId
```

**RAG Pipeline**:

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import OpenAIEmbeddings
from qdrant_client import QdrantClient

async def process_document(doc_id: str, file_path: str, tenant_id: str, kb_id: str):
    # 1. Parse document
    text = await parse_document(file_path)

    # 2. Chunk text
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        length_function=len,
    )
    chunks = text_splitter.split_text(text)

    # 3. Generate embeddings
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    vectors = await embeddings.aembed_documents(chunks)

    # 4. Store in Qdrant
    qdrant = QdrantClient(url=QDRANT_URL)
    points = [
        {
            "id": f"{doc_id}_{i}",
            "vector": vector,
            "payload": {
                "tenant_id": tenant_id,
                "kb_id": kb_id,
                "doc_id": doc_id,
                "chunk_text": chunk,
                "chunk_index": i,
            }
        }
        for i, (chunk, vector) in enumerate(zip(chunks, vectors))
    ]
    qdrant.upsert(collection_name="knowledge", points=points)
```

**Qdrant Configuration**:

```python
from qdrant_client.models import Distance, VectorParams

# Create collection on startup
qdrant.create_collection(
    collection_name="knowledge",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
)

# Always filter by tenant_id for multi-tenancy
results = qdrant.search(
    collection_name="knowledge",
    query_vector=query_embedding,
    query_filter={"must": [{"key": "tenant_id", "match": {"value": tenant_id}}]},
    limit=5,
)
```

---

### 4. Conversation Service (Node.js + Express + Socket.IO)

**Port**: 3004  
**Database**: PostgreSQL (history), Firestore (real-time state)  
**Cache**: Redis

**Responsibilities**:

- Conversation state management
- Message history storage (3-4 bubble context)
- Human handoff logic
- Conversation routing (outlet → WABA)
- Real-time dashboard updates via WebSocket

**Key APIs**:

```
GET    /api/v1/conversations/:conversationId
POST   /api/v1/conversations/:conversationId/messages
PUT    /api/v1/conversations/:conversationId/handoff
GET    /api/v1/conversations/outlet/:outletId/active
```

**WebSocket Events**:

```javascript
// Server → Client
socket.emit('conversation:new', { conversationId, customerPhone, ... });
socket.emit('conversation:message', { conversationId, message, ... });
socket.emit('conversation:handoff', { conversationId, reason, ... });

// Client → Server
socket.on('conversation:join', ({ conversationId }) => { ... });
socket.on('conversation:leave', ({ conversationId }) => { ... });
socket.on('agent:takeover', ({ conversationId }) => { ... });
```

**Database Schema**:

```sql
-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
  customer_phone VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- active, resolved, handed_off, expired
  handoff_requested BOOLEAN DEFAULT FALSE,
  handoff_agent_id UUID REFERENCES users(id),
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  last_message_at TIMESTAMP
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(50) NOT NULL, -- customer, llm, agent
  sender_id VARCHAR(255),
  content TEXT NOT NULL,
  whatsapp_message_id VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB -- {llm_model, tokens_used, rag_context_used}
);

-- Indexes
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_outlet ON conversations(outlet_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, timestamp DESC);
CREATE INDEX idx_messages_timestamp ON messages(timestamp); -- for 3-month cleanup
```

**Handoff Detection**:

```javascript
const HANDOFF_KEYWORDS = [
  "speak to human",
  "talk to agent",
  "representative",
  "escalate",
  "supervisor",
  "manager",
  "complaint",
];

function shouldHandoff(message, conversationHistory) {
  // Keyword detection
  if (HANDOFF_KEYWORDS.some((kw) => message.toLowerCase().includes(kw))) {
    return { trigger: "keyword", reason: "Customer requested human agent" };
  }

  // Sentiment analysis (future enhancement)
  // const sentiment = analyzeSentiment(message);
  // if (sentiment.score < -0.5) return { trigger: 'sentiment', reason: 'Negative sentiment detected' };

  // Repetitive queries
  const recentMessages = conversationHistory.slice(-6);
  const llmFailures = recentMessages.filter(
    (m) => m.sender_type === "llm" && m.metadata?.low_confidence
  ).length;
  if (llmFailures >= 3) {
    return {
      trigger: "confidence",
      reason: "Multiple low-confidence responses",
    };
  }

  return null;
}
```

---

### 5. LLM Orchestration Service (Python + FastAPI)

**Port**: 3005  
**Database**: None (stateless)  
**Dependencies**: Knowledge Service, Conversation Service, OpenAI API

**Responsibilities**:

- Prompt assembly (system + RAG context + conversation history)
- RAG context retrieval from Qdrant
- GPT-4o-mini API calls (streaming)
- Token counting & cost tracking
- Response streaming to client

**Key APIs**:

```
POST   /api/v1/llm/generate
POST   /api/v1/llm/stream (SSE)
```

**Prompt Assembly**:

```python
from langchain.prompts import ChatPromptTemplate

async def assemble_prompt(
    user_message: str,
    tenant_id: str,
    conversation_id: str,
    kb_ids: List[str]
):
    # 1. Fetch LLM config (tone)
    config = await get_tenant_llm_config(tenant_id)
    tone = config.get('tone', 'professional')

    # 2. Fetch conversation history (last 3-4 messages)
    history = await get_conversation_history(conversation_id, limit=4)

    # 3. Fetch RAG context from Qdrant
    query_embedding = await generate_embedding(user_message)
    rag_results = await qdrant_search(
        tenant_id=tenant_id,
        kb_ids=kb_ids,
        query_vector=query_embedding,
        top_k=5,
        min_score=0.7
    )
    context = "\n\n".join([r['payload']['chunk_text'] for r in rag_results])

    # 4. Assemble prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", f"You are a customer service assistant. Tone: {tone}. Use the following context to answer questions:\n\n{context}"),
        ("human", "{history}\n\nCustomer: {message}"),
    ])

    return prompt.format(history=history, message=user_message)
```

**Streaming Response**:

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

app = FastAPI()
openai_client = AsyncOpenAI()

@app.post("/api/v1/llm/stream")
async def stream_response(request: GenerateRequest):
    prompt = await assemble_prompt(...)

    async def generate():
        stream = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield f"data: {chunk.choices[0].delta.content}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

### 6. Message Sender Service (Go + Gin)

**Port**: 3006  
**Database**: None  
**Dependencies**: WhatsApp Cloud API

**Responsibilities**:

- Format messages for WhatsApp API
- Send messages to WhatsApp Cloud API
- Track delivery status
- Retry logic with exponential backoff

**Key APIs**:

```
POST   /api/v1/messages/send
GET    /api/v1/messages/:messageId/status
```

**WhatsApp Integration**:

```go
package whatsapp

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type WhatsAppMessage struct {
    MessagingProduct string `json:"messaging_product"`
    RecipientType    string `json:"recipient_type"`
    To               string `json:"to"`
    Type             string `json:"type"`
    Text             struct {
        Body string `json:"body"`
    } `json:"text"`
}

func SendMessage(phoneNumberID, accessToken, to, message string) error {
    url := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", phoneNumberID)

    payload := WhatsAppMessage{
        MessagingProduct: "whatsapp",
        RecipientType:    "individual",
        To:               to,
        Type:             "text",
    }
    payload.Text.Body = message

    jsonData, _ := json.Marshal(payload)

    req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
    req.Header.Set("Authorization", "Bearer "+accessToken)
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{Timeout: 10 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        return fmt.Errorf("WhatsApp API error: %d", resp.StatusCode)
    }

    return nil
}
```

**Retry Logic**:

```go
func SendWithRetry(phoneNumberID, accessToken, to, message string) error {
    maxRetries := 3
    backoff := time.Second

    for i := 0; i < maxRetries; i++ {
        err := SendMessage(phoneNumberID, accessToken, to, message)
        if err == nil {
            return nil
        }

        if i < maxRetries-1 {
            time.Sleep(backoff)
            backoff *= 2 // exponential backoff
        }
    }

    return fmt.Errorf("failed after %d retries", maxRetries)
}
```

---

### 7. Analytics Service (Python + FastAPI)

**Port**: 3007  
**Database**: BigQuery  
**Cache**: Redis

**Responsibilities**:

- Event aggregation from Pub/Sub
- Metrics calculation (response time, resolution rate, etc.)
- Dashboard data preparation
- Report generation

**Key Metrics**:

- Average response time (seconds)
- Message volume (daily/weekly/monthly)
- Conversation resolution rate
- Human handoff rate
- Customer satisfaction (if feedback collected)
- LLM cost per conversation
- Per-tenant usage stats

**BigQuery Schema**:

```sql
-- Conversation events table
CREATE TABLE conversation_events (
  event_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  outlet_id STRING NOT NULL,
  conversation_id STRING NOT NULL,
  event_type STRING NOT NULL, -- message_sent, handoff_requested, resolved
  timestamp TIMESTAMP NOT NULL,
  metadata JSON,
  DATE DATE AS (DATE(timestamp))
)
PARTITION BY DATE
CLUSTER BY tenant_id, outlet_id;

-- Daily metrics (pre-aggregated)
CREATE TABLE daily_metrics (
  date DATE NOT NULL,
  tenant_id STRING NOT NULL,
  outlet_id STRING NOT NULL,
  total_conversations INT64,
  total_messages INT64,
  avg_response_time_ms FLOAT64,
  handoff_rate FLOAT64,
  resolution_rate FLOAT64,
  total_cost FLOAT64
)
PARTITION BY date
CLUSTER BY tenant_id;
```

---

## Database Architecture

### Multi-Tenant Isolation Strategy

**Pattern**: Shared database with shared schema + tenant_id column

**Rationale**:

- Cost-effective for 2-50 tenants
- Simpler operations (single DB, single migration)
- Easy to implement Row-Level Security (RLS)
- Can migrate to database-per-tenant later if needed

**Implementation**:

```sql
-- Enable Row-Level Security on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policy for tenant isolation
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation ON outlets
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Set tenant context in application
SET app.current_tenant_id = 'tenant-uuid-here';
```

**Application-Level Enforcement**:

```javascript
// Middleware to set tenant context
app.use((req, res, next) => {
  const tenantId = req.user.tenantId; // from JWT
  req.tenantId = tenantId;

  // Set PostgreSQL session variable
  req.db.query(`SET app.current_tenant_id = '${tenantId}'`);

  next();
});

// Always filter by tenant_id
const users = await db.query("SELECT * FROM users WHERE tenant_id = $1", [
  req.tenantId,
]);
```

### Data Retention Policy

- **Conversations & Messages**: 3 months, then auto-delete
- **Analytics Events**: 12 months in BigQuery
- **Audit Logs**: 24 months (compliance)
- **Document Uploads**: Lifecycle management (auto-delete after 3 months if not in active KB)

**Automated Cleanup Job**:

```sql
-- Run daily via Cloud Scheduler
DELETE FROM messages
WHERE timestamp < NOW() - INTERVAL '3 months';

DELETE FROM conversations
WHERE ended_at < NOW() - INTERVAL '3 months';
```

---

## Development Environment Setup

### Prerequisites

1. **Windows with WSL2**:

   ```powershell
   # Run in PowerShell as Administrator
   wsl --install
   wsl --set-default-version 2
   ```

2. **Inside WSL2 (Ubuntu)**:

   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Node.js via nvm
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   source ~/.bashrc
   nvm install 22

   # Configure npm for user-level installs
   mkdir -p ~/.npm-global
   npm config set prefix ~/.npm-global
   echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
   source ~/.bashrc

   # Install Claude Code (NEVER use sudo)
   npm install -g @anthropic-ai/claude-code

   # Verify installation
   claude doctor

   # Install Python
   sudo apt install python3 python3-pip python3-venv -y

   # Install Go
   wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
   sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
   echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
   source ~/.bashrc

   # Install Docker
   sudo apt install docker.io docker-compose -y
   sudo usermod -aG docker $USER
   newgrp docker

   # Install gcloud CLI
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   gcloud init
   ```

3. **Authenticate with GCP**:

   ```bash
   # User authentication (for local dev)
   gcloud auth application-default login
   gcloud auth application-default set-quota-project YOUR_PROJECT_ID

   # Verify credentials
   gcloud auth list
   ```

### Project Structure

**Recommended**: Multi-repo or mono-repo with independent deployments

```
whatsapp-crm/
├── services/
│   ├── tenant-service/
│   │   ├── src/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── README.md
│   ├── billing-service/
│   │   ├── cmd/
│   │   ├── internal/
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   └── README.md
│   ├── knowledge-service/
│   │   ├── app/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── README.md
│   ├── conversation-service/
│   ├── llm-orchestration-service/
│   ├── message-sender-service/
│   └── analytics-service/
├── infrastructure/
│   ├── terraform/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── docker/
│       └── docker-compose.yml
├── docs/
│   ├── architecture.md
│   ├── api-specs/
│   └── runbooks/
├── .github/
│   └── workflows/
│       ├── tenant-service.yml
│       ├── billing-service.yml
│       └── ...
└── README.md
```

---

## Local Development Workflow

### Docker Compose Setup

**File**: `infrastructure/docker/docker-compose.yml`

```yaml
version: "3.8"

networks:
  crm-network:
    driver: bridge

volumes:
  postgres-data:
  redis-data:

services:
  # Infrastructure Services
  postgres:
    image: postgres:16-alpine
    container_name: crm-postgres
    environment:
      POSTGRES_DB: crm_dev
      POSTGRES_USER: crm_user
      POSTGRES_PASSWORD: crm_password
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - crm-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U crm_user -d crm_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: crm-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - crm-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  cloudsql-proxy:
    image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.11.0
    container_name: crm-cloudsql-proxy
    command:
      - "--port=3306"
      - "YOUR_PROJECT:REGION:INSTANCE"
    volumes:
      - ~/.config/gcloud:/home/nonroot/.config/gcloud:ro
    ports:
      - "3306:3306"
    networks:
      - crm-network
    depends_on:
      - postgres

  pubsub-emulator:
    image: google/cloud-sdk:slim
    container_name: crm-pubsub-emulator
    command: gcloud beta emulators pubsub start --host-port=0.0.0.0:8085 --project=test-project
    ports:
      - "8085:8085"
    environment:
      - PUBSUB_PROJECT_ID=test-project
    networks:
      - crm-network

  qdrant:
    image: qdrant/qdrant:v1.7.4
    container_name: crm-qdrant
    ports:
      - "6333:6333"
    volumes:
      - ./qdrant-data:/qdrant/storage
    networks:
      - crm-network

  # Microservices
  tenant-service:
    build:
      context: ../../services/tenant-service
      dockerfile: Dockerfile
    container_name: crm-tenant-service
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://crm_user:crm_password@postgres:5432/crm_dev
      - REDIS_URL=redis://redis:6379
      - PUBSUB_EMULATOR_HOST=pubsub-emulator:8085
      - PORT=3001
    volumes:
      - ../../services/tenant-service/src:/app/src
      - /app/node_modules
    networks:
      - crm-network
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  billing-service:
    build:
      context: ../../services/billing-service
      dockerfile: Dockerfile
    container_name: crm-billing-service
    ports:
      - "3002:3002"
    environment:
      - DATABASE_URL=postgresql://crm_user:crm_password@postgres:5432/crm_dev
      - REDIS_URL=redis://redis:6379
      - PUBSUB_EMULATOR_HOST=pubsub-emulator:8085
      - PORT=3002
    volumes:
      - ../../services/billing-service:/app
    networks:
      - crm-network
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  knowledge-service:
    build:
      context: ../../services/knowledge-service
      dockerfile: Dockerfile
    container_name: crm-knowledge-service
    ports:
      - "3003:3003"
    environment:
      - DATABASE_URL=postgresql://crm_user:crm_password@postgres:5432/crm_dev
      - QDRANT_URL=http://qdrant:6333
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - PORT=3003
    volumes:
      - ../../services/knowledge-service/app:/app/app
    networks:
      - crm-network
    depends_on:
      - postgres
      - qdrant

  # Add other services similarly...
```

### Environment Variables

**File**: `.env` (DO NOT COMMIT)

```bash
# Database
DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm_dev

# Redis
REDIS_URL=redis://localhost:6379

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# OpenAI
OPENAI_API_KEY=sk-...

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_ACCESS_TOKEN=EAAG...

# GCP
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
PUBSUB_EMULATOR_HOST=localhost:8085
QDRANT_URL=http://localhost:6333

# Service Ports
TENANT_SERVICE_PORT=3001
BILLING_SERVICE_PORT=3002
KNOWLEDGE_SERVICE_PORT=3003
CONVERSATION_SERVICE_PORT=3004
LLM_ORCHESTRATION_PORT=3005
MESSAGE_SENDER_PORT=3006
ANALYTICS_SERVICE_PORT=3007
```

**File**: `.env.example` (COMMIT THIS)

```bash
# Copy this to .env and fill in your values
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
REDIS_URL=redis://localhost:6379
FIREBASE_PROJECT_ID=your-project-id
OPENAI_API_KEY=your-openai-key
# ... etc
```

### Development Commands

```bash
# Start all services
cd infrastructure/docker
docker-compose up -d

# View logs
docker-compose logs -f tenant-service
docker-compose logs -f --tail=100

# Stop all services
docker-compose down

# Rebuild a specific service
docker-compose up -d --build tenant-service

# Run database migrations
docker-compose exec tenant-service npm run migrate

# Access database
docker-compose exec postgres psql -U crm_user -d crm_dev

# Access Redis CLI
docker-compose exec redis redis-cli

# Check service health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

### Using Claude Code

```bash
# Navigate to service directory
cd ~/projects/whatsapp-crm/services/tenant-service

# Start Claude Code
claude

# Common prompts for Claude:
# "Implement the Tenant CRUD endpoints based on the API specs in claude.md"
# "Add Firebase Auth middleware with JWT validation"
# "Create database migrations for the tenant and outlet tables"
# "Write unit tests for the tenant service using Jest"
# "Add Swagger/OpenAPI documentation for all endpoints"
```

---

## Deployment Strategy

### Phase 1: MVP (Month 1-2)

**Goal**: Deploy for 2 tenants, core functionality only

**Services**:

- ✅ Tenant Service
- ✅ Billing Service (basic manual billing)
- ✅ Knowledge Service (PDF only)
- ✅ Conversation Service
- ✅ LLM Orchestration Service
- ✅ Message Sender Service
- ✅ WhatsApp Webhook Handler (Cloud Function)

**Infrastructure**:

- Cloud Run for all services (1-10 instances)
- Cloud SQL (db-n1-standard-1, 10GB)
- Firestore
- Cloud Storage
- Pub/Sub
- Single region: asia-southeast2 (Jakarta)

**Deployment**:

```bash
# Build and push Docker images
gcloud builds submit --tag gcr.io/PROJECT_ID/tenant-service:v1.0.0

# Deploy to Cloud Run
gcloud run deploy tenant-service \
  --image gcr.io/PROJECT_ID/tenant-service:v1.0.0 \
  --region asia-southeast2 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=... \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1
```

### Phase 2: Enhanced (Month 3-4)

**New Features**:

- Analytics Service + BigQuery
- Notification Service
- Human handoff functionality
- Docs and Excel support in Knowledge Service
- Real-time dashboard with WebSocket

**Scaling**:

- Cloud Run: 1-20 instances per service
- Cloud SQL: db-n1-standard-2
- Prometheus + Grafana monitoring

### Phase 3: Production Hardening (Month 5-6)

**Focus**: Reliability, security, observability

**Enhancements**:

- Multi-region (Jakarta + Singapore)
- Cloud SQL read replicas
- Redis caching for LLM
- OpenTelemetry instrumentation
- Cloud Armor (DDoS protection)
- Automated backups & disaster recovery

---

## Security & Compliance

### Authentication & Authorization

**Firebase Auth Flow**:

1. User signs up/logs in via dashboard
2. Firebase returns JWT token with custom claims
3. Client sends JWT in `Authorization: Bearer <token>` header
4. Service validates JWT with Firebase Admin SDK
5. Extract tenant_id from token claims
6. Enforce tenant isolation in all queries

**Implementation**:

```javascript
// middleware/auth.js
const admin = require("firebase-admin");

async function authenticate(req, res, next) {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      tenantId: decoded.tenant_id, // custom claim
      role: decoded.role,
    };
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
}
```

### Data Encryption

- **At Rest**: AES-256 (default in GCP)
- **In Transit**: TLS 1.3 for all service-to-service communication
- **Sensitive Fields**: Encrypt WABA access tokens with Cloud KMS

### Compliance (PDP - Indonesia)

- **Data Residency**: All data in asia-southeast2 region
- **Data Retention**: 3-month automated deletion
- **Audit Logs**: Track all data access (who, what, when)
- **User Consent**: Terms of service acceptance tracked

### Rate Limiting

```javascript
// middleware/rateLimiter.js
const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: "rate_limit:",
  }),
  windowMs: 60 * 1000, // 1 minute
  max: async (req) => {
    const tenant = await getTenant(req.user.tenantId);
    return tenant.tier === "enterprise" ? 1000 : 100;
  },
  message: "Too many requests, please try again later",
});
```

---

## Next Steps

### Immediate (Week 1)

1. ✅ Set up WSL2 + Claude Code
2. ✅ Install Docker + Docker Compose
3. ✅ Authenticate with GCP (`gcloud auth application-default login`)
4. Create GitHub repositories (multi-repo or mono-repo)
5. Set up project structure

### Week 2-3: Tenant Service

1. Read `/mnt/skills/public/product-self-knowledge/SKILL.md` for context
2. Implement database schema (tenants, outlets, users)
3. Implement CRUD APIs with NestJS
4. Integrate Firebase Auth
5. Write unit + integration tests
6. Dockerize service

### Week 4-5: Knowledge Service

1. Implement document upload to Cloud Storage
2. Build parsing pipeline (PDF, Docs, Excel)
3. Integrate OpenAI embeddings
4. Set up Qdrant vector database
5. Implement RAG search endpoint

### Week 6-7: LLM Orchestration + Conversation

1. Build prompt assembly logic
2. Integrate GPT-4o-mini API with streaming
3. Implement conversation state management
4. Build WebSocket server for real-time updates
5. Implement handoff detection logic

### Week 8-9: Billing + Message Sender

1. Implement subscription management
2. Build quota enforcement logic
3. Integrate WhatsApp Cloud API
4. Implement retry logic with exponential backoff
5. Set up Pub/Sub event handling

### Week 10-11: Integration & Testing

1. Connect all services via Pub/Sub
2. End-to-end testing of WhatsApp flow
3. Load testing with Artillery/k6
4. Multi-tenant isolation testing
5. Security audit

### Week 12: Deployment

1. Set up GCP project (Cloud Run, Cloud SQL, etc.)
2. Configure GitHub Actions CI/CD
3. Deploy MVP to production
4. Onboard first 2 tenants
5. Monitor and iterate

---

## Monitoring & Observability

### Key Metrics

**Service Health**:

- Request rate (req/sec)
- Error rate (%)
- Latency (p50, p95, p99)
- Availability (uptime %)

**Business Metrics**:

- Active conversations
- Messages per day
- Average response time
- Handoff rate
- Resolution rate
- Cost per conversation (LLM API usage)

**Per-Tenant Metrics**:

- Message quota usage
- Storage usage
- API call count

### Dashboards

**Grafana Dashboards**:

1. **Service Overview**: All services health at a glance
2. **Tenant Dashboard**: Per-tenant usage and performance
3. **Cost Tracking**: LLM API costs, Cloud Run costs
4. **Alerts Dashboard**: Active incidents and warnings

### Alerting Rules

```yaml
# Prometheus alerts
groups:
  - name: service_health
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.service }}"

      - alert: HighLatency
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.service }}"

      - alert: QuotaExceeded
        expr: tenant_message_quota_usage > 1.0
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Tenant {{ $labels.tenant_id }} exceeded quota"
```

---

## Cost Estimation

### Monthly Costs (MVP - 2 Tenants, 3K Messages)

| Service                          | Usage                       | Cost            |
| -------------------------------- | --------------------------- | --------------- |
| **Cloud Run** (10 services)      | Minimal traffic             | $20-40          |
| **Cloud SQL** (db-n1-standard-1) | 10GB storage                | $50             |
| **Pub/Sub**                      | 10K messages/day            | $5              |
| **Cloud Storage**                | 100MB documents             | $3              |
| **Firestore**                    | Real-time reads/writes      | $10             |
| **BigQuery**                     | Minimal queries             | $5              |
| **Cloud Logging**                | Standard logging            | $10             |
| **GPT-4o-mini**                  | 3K messages, 500 tokens avg | $0.60           |
| **OpenAI Embeddings**            | 100 docs, 1M tokens         | $0.02           |
| **WhatsApp API**                 | 3K messages @ $0.01/msg     | $30             |
| **Total**                        |                             | **~$134/month** |

### At Scale (50 Tenants, 10K Messages/Day)

| Service      | Cost              |
| ------------ | ----------------- |
| GCP Services | $500-800          |
| GPT-4o-mini  | $60-80            |
| WhatsApp API | $3,000            |
| **Total**    | **~$3,600/month** |

**Revenue (50 Tenants)**:

- 10 Starter ($99) = $990
- 30 Growth ($299) = $8,970
- 10 Enterprise ($799) = $7,990
- **Total MRR**: $17,950
- **Profit Margin**: ~80%

---

## Resources

### Documentation

- **Claude Code**: https://docs.claude.com/en/docs/claude-code/overview
- **GCP**: https://cloud.google.com/docs
- **NestJS**: https://docs.nestjs.com
- **FastAPI**: https://fastapi.tiangolo.com
- **Go + Gin**: https://gin-gonic.com/docs
- **Firebase Auth**: https://firebase.google.com/docs/auth
- **WhatsApp Business API**: https://developers.facebook.com/docs/whatsapp

### Support

- **Claude Code Issues**: https://github.com/anthropics/claude-code/issues
- **Project Repository**: [Your GitHub repo URL]
- **Team Slack/Discord**: [Your team communication channel]

---

## Conclusion

This architecture balances pragmatism with scalability. You're starting with a multi-tenant shared database that supports 2-50 tenants cost-effectively, using Cloud Run for easy deployment and auto-scaling, and choosing languages based on each service's performance needs (Node.js for I/O, Python for AI, Go for throughput).

The development workflow with Claude Code in WSL2 mirrors production environments through Docker Compose, while GCP's local development tools (Cloud SQL Proxy, Pub/Sub emulator) enable realistic testing without cloud costs.

As you grow, the architecture supports evolution: from Cloud Run to GKE, from shared database to database-per-tenant, from single region to multi-region. Each decision is reversible, allowing you to optimize based on real usage patterns rather than premature optimization.

**Key Success Factors**:

1. ✅ Start simple (MVP first, enhance later)
2. ✅ Measure everything (metrics drive decisions)
3. ✅ Test thoroughly (multi-tenant isolation is critical)
4. ✅ Deploy incrementally (service by service)
5. ✅ Listen to users (iterate based on feedback)

Good luck building your WhatsApp CRM! 🚀
