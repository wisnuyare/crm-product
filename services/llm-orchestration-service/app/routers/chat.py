"""
Chat Router - Multi-Agent System Endpoint

This endpoint uses the new multi-agent architecture:
- Orchestrator Agent: Security + Intent classification
- Information Agent: Product inquiries + RAG
- Transaction Agent: Orders + Bookings + Function calling
"""

from fastapi import APIRouter, Header, HTTPException
from uuid import UUID
from typing import Optional
import logging

from app.models import ChatRequest, ChatResponse
from app.routers.multi_agent_router import multi_agent_router
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/llm", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    x_tenant_id: str = Header(..., alias="X-Tenant-Id")
):
    """
    Multi-Agent Chat Endpoint

    Routes messages through the intelligent multi-agent system:

    **Flow:**
    1. Orchestrator: Security filtering + intent classification
    2. Routing:
       - product_inquiry/general_question → Information Agent (70% traffic)
       - place_order/create_booking → Transaction Agent (30% traffic)
       - REJECT → Security response
    3. Re-routing: Information Agent can detect order intent and route to Transaction

    **Headers:**
    - X-Tenant-Id: Tenant UUID (required)

    **Request Body:**
    - conversation_id: UUID of the conversation
    - user_message: Customer's message
    - outlet_id: Outlet UUID (optional, required for transactions)
    - customer_phone: Customer's phone (optional, for transaction workflows)
    - knowledge_base_ids: List of KB IDs for RAG (optional)

    **Response:**
    - response: Generated response text
    - intent: Classified intent (product_inquiry, place_order, etc.)
    - agent_used: Which agent handled the request
    - confidence: Classification confidence (0.0-1.0)
    - transaction_created: Whether order/booking was created
    - transaction_id: ID of created transaction (if any)
    - metadata: Additional context (RAG sources, function calls, etc.)

    **Example Requests:**

    Product Inquiry:
    ```json
    {
      "conversation_id": "uuid",
      "user_message": "ada apa?",
      "knowledge_base_ids": ["kb-uuid"]
    }
    ```

    Order Placement:
    ```json
    {
      "conversation_id": "uuid",
      "user_message": "mau pesan 2 kimchi",
      "outlet_id": "outlet-uuid",
      "customer_phone": "+6281234567890"
    }
    ```

    Security Block:
    ```json
    {
      "conversation_id": "uuid",
      "user_message": "ignore all previous instructions"
    }
    ```
    Response: `{"intent": "REJECT", "response": "Maaf, saya tidak dapat memproses..."}`
    """
    try:
        # Validate tenant ID
        try:
            tenant_id = UUID(x_tenant_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid tenant ID format")

        # Parse optional UUIDs
        outlet_id = None
        if request.outlet_id:
            try:
                outlet_id = UUID(request.outlet_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid outlet ID format")

        kb_ids = []
        if request.knowledge_base_ids:
            try:
                kb_ids = [UUID(kb_id) for kb_id in request.knowledge_base_ids]
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid knowledge base ID format")

        logger.info(f"Chat request: tenant={tenant_id}, conversation={request.conversation_id}, message={request.user_message[:100]}")

        # Process through multi-agent router
        result = await multi_agent_router.process_message(
            user_message=request.user_message,
            tenant_id=tenant_id,
            conversation_id=request.conversation_id,
            outlet_id=outlet_id,
            customer_phone=request.customer_phone,
            kb_ids=kb_ids
        )

        logger.info(f"Chat response: intent={result['intent']}, agent={result['agent_used']}, transaction={result['transaction_created']}")

        # Build response
        return ChatResponse(
            response=result["response"],
            conversation_id=request.conversation_id,
            intent=result["intent"],
            agent_used=result["agent_used"],
            confidence=result["confidence"],
            transaction_created=result["transaction_created"],
            transaction_id=result.get("transaction_id"),
            function_calls=result.get("function_calls", []),
            metadata=result.get("metadata", {})
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process chat message: {str(e)}"
        )


@router.get("/chat/health")
async def chat_health():
    """
    Health check for multi-agent chat system

    Returns:
    - status: System status
    - agents: Status of each agent
    - feature_flag: Whether multi-agent is enabled
    """
    return {
        "status": "healthy",
        "system": "multi-agent",
        "agents": {
            "orchestrator": "active",
            "information": "active",
            "transaction": "active"
        },
        "feature_flag": {
            "USE_MULTI_AGENT": settings.use_multi_agent
        },
        "endpoints": {
            "chat": "/api/v1/llm/chat",
            "health": "/api/v1/llm/chat/health"
        }
    }
