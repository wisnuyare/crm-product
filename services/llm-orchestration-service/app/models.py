"""
Data models for LLM Orchestration Service
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from uuid import UUID


class GenerateRequest(BaseModel):
    """Request model for LLM generation"""

    conversation_id: UUID
    user_message: str
    knowledge_base_ids: Optional[List[UUID]] = []
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    stream: bool = False

    class Config:
        json_schema_extra = {
            "example": {
                "conversation_id": "123e4567-e89b-12d3-a456-426614174000",
                "user_message": "How do I reset my password?",
                "knowledge_base_ids": ["123e4567-e89b-12d3-a456-426614174001"],
                "stream": False,
            }
        }


class GenerateResponse(BaseModel):
    """Response model for LLM generation"""

    response: str
    conversation_id: UUID
    tokens_used: Dict[str, int]
    cost: Dict[str, float]
    rag_context_used: bool
    rag_sources: List[str] = []
    model: str
    functions_executed: List[Dict[str, Any]] = []  # Track function calls

    class Config:
        json_schema_extra = {
            "example": {
                "response": "To reset your password, please follow these steps...",
                "conversation_id": "123e4567-e89b-12d3-a456-426614174000",
                "tokens_used": {"input": 150, "output": 80, "total": 230},
                "cost": {
                    "input": 0.0000225,
                    "output": 0.000048,
                    "total": 0.0000705,
                },
                "rag_context_used": True,
                "rag_sources": ["password-reset-guide.pdf", "faq.docx"],
                "model": "gpt-4o-mini",
                "functions_executed": [],
            }
        }


class Message(BaseModel):
    """Message model for conversation history"""

    sender_type: str  # customer, llm, agent
    content: str
    timestamp: str


class RAGContext(BaseModel):
    """RAG context from knowledge base"""

    text: str
    source: str
    score: float
    chunk_index: int


class PromptContext(BaseModel):
    """Full context for prompt assembly"""

    system_prompt: str
    rag_context: List[RAGContext]
    conversation_history: List[Message]
    user_message: str
    tenant_config: Dict[str, Any]


# Multi-Agent System Models

class ChatRequest(BaseModel):
    """Request model for multi-agent chat endpoint"""

    conversation_id: UUID
    user_message: str
    outlet_id: Optional[str] = None  # Required for transactions
    customer_phone: Optional[str] = None  # For transaction workflows
    knowledge_base_ids: Optional[List[str]] = []

    class Config:
        json_schema_extra = {
            "example": {
                "conversation_id": "123e4567-e89b-12d3-a456-426614174000",
                "user_message": "ada apa?",
                "knowledge_base_ids": ["kb-uuid-1"],
                "outlet_id": "outlet-uuid",
                "customer_phone": "+6281234567890"
            }
        }


class ChatResponse(BaseModel):
    """Response model for multi-agent chat endpoint"""

    response: str
    conversation_id: UUID
    intent: str  # product_inquiry, place_order, general_question, REJECT, etc.
    agent_used: str  # orchestrator, information, transaction
    confidence: float  # 0.0-1.0
    transaction_created: bool
    transaction_id: Optional[str] = None
    function_calls: List[Dict[str, Any]] = []
    metadata: Dict[str, Any] = {}

    class Config:
        json_schema_extra = {
            "example": {
                "response": "Kami punya Kimchi Sawi Rp 25,000 dan Kimchi Lobak Rp 20,000.",
                "conversation_id": "123e4567-e89b-12d3-a456-426614174000",
                "intent": "product_inquiry",
                "agent_used": "information",
                "confidence": 0.95,
                "transaction_created": False,
                "transaction_id": None,
                "function_calls": [],
                "metadata": {
                    "rag_sources": ["products.md"],
                    "rag_context_count": 1
                }
            }
        }
