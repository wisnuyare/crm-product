"""
Generate Router - LLM generation endpoints
"""
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from uuid import UUID
from typing import AsyncGenerator

from app.models import GenerateRequest, GenerateResponse
from app.services.prompt_service import prompt_service
from app.services.openai_service import openai_service
from app.services.security_service import security_service

router = APIRouter(prefix="/api/v1/llm", tags=["llm"])


def get_tenant_id(x_tenant_id: str = Header(..., alias="X-Tenant-Id")) -> UUID:
    """Extract and validate tenant ID from header"""
    try:
        return UUID(x_tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant ID format")


@router.post("/generate", response_model=GenerateResponse)
async def generate_response(
    request: GenerateRequest, tenant_id: UUID = Header(..., alias="X-Tenant-Id")
):
    """
    Generate LLM response (non-streaming)

    This endpoint assembles a prompt from:
    - Tenant custom instructions
    - RAG context from knowledge bases
    - Recent conversation history
    - Current user message

    Then calls OpenAI GPT-4o-mini to generate a response.

    **Headers:**
    - X-Tenant-Id: Tenant UUID (required)

    **Request Body:**
    - conversation_id: UUID of the conversation
    - user_message: Customer's message
    - knowledge_base_ids: List of KB IDs to search (optional)
    - max_tokens: Max tokens to generate (optional)
    - temperature: Temperature setting (optional)
    - stream: Whether to stream response (should be false for this endpoint)

    **Response:**
    - response: Generated text
    - conversation_id: Conversation UUID
    - tokens_used: Token counts (input, output, total)
    - cost: Cost breakdown in USD
    - rag_context_used: Whether RAG context was used
    - rag_sources: List of source documents
    - model: Model used (gpt-4o-mini)
    """
    try:
        # 🔒 SECURITY: Validate user message for jailbreak/injection attempts
        is_safe, error_type = security_service.validate_user_message(request.user_message)
        if not is_safe:
            # Return safe error message instead of processing malicious input
            safe_response = security_service.get_safe_error_response(error_type)
            return GenerateResponse(
                response=safe_response,
                conversation_id=request.conversation_id,
                tokens_used={"input": 0, "output": 0, "total": 0},
                cost={"input": 0.0, "output": 0.0, "total": 0.0},
                rag_context_used=False,
                rag_sources=[],
                model="security-filter",
                functions_executed=[],
            )

        # Parse tenant_id from header
        tenant_uuid = UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id

        # Assemble prompt context
        prompt_context = await prompt_service.assemble_prompt(
            user_message=request.user_message,
            conversation_id=request.conversation_id,
            tenant_id=tenant_uuid,
            kb_ids=request.knowledge_base_ids or [],
        )

        # Format messages for OpenAI
        messages = prompt_service.format_messages_for_openai(prompt_context)

        # Get RAG sources
        rag_sources = [ctx.source for ctx in prompt_context.rag_context]

        # Generate response with booking function calling
        response = await openai_service.generate(
            messages=messages,
            conversation_id=request.conversation_id,
            rag_sources=rag_sources,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            tenant_id=str(tenant_uuid),
            enable_booking=True,
        )

        # If this is the first message in the conversation, prepend the greeting
        if not prompt_context.conversation_history:
            greeting = prompt_context.tenant_config.get("greeting_message", "Hello! How can I help you today?")
            response.response = f"{greeting}\n\n{response.response}"

        return response

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error generating response: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate response")


@router.post("/stream")
async def stream_response(
    request: GenerateRequest, tenant_id: UUID = Header(..., alias="X-Tenant-Id")
):
    """
    Generate LLM response (streaming via SSE)

    This endpoint works the same as /generate but streams the response
    as Server-Sent Events (SSE) for real-time display.

    **Headers:**
    - X-Tenant-Id: Tenant UUID (required)

    **Request Body:**
    - conversation_id: UUID of the conversation
    - user_message: Customer's message
    - knowledge_base_ids: List of KB IDs to search (optional)
    - max_tokens: Max tokens to generate (optional)
    - temperature: Temperature setting (optional)

    **Response:**
    - Server-Sent Events stream
    - Each event contains a chunk of the response
    - Final event: [DONE]

    **Example Response Stream:**
    ```
    data: To reset
    data:  your password
    data: , please follow
    data:  these steps...
    data: [DONE]
    ```
    """
    try:
        # Parse tenant_id from header
        tenant_uuid = UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id

        # Assemble prompt context
        prompt_context = await prompt_service.assemble_prompt(
            user_message=request.user_message,
            conversation_id=request.conversation_id,
            tenant_id=tenant_uuid,
            kb_ids=request.knowledge_base_ids or [],
        )

        # Format messages for OpenAI
        messages = prompt_service.format_messages_for_openai(prompt_context)

        # Create streaming generator
        async def generate_stream() -> AsyncGenerator[str, None]:
            """Generate SSE stream"""
            try:
                async for chunk in openai_service.generate_stream(
                    messages=messages,
                    max_tokens=request.max_tokens,
                    temperature=request.temperature,
                ):
                    # Send chunk as SSE
                    yield f"data: {chunk}\n\n"

                # Send completion signal
                yield "data: [DONE]\n\n"
            except Exception as e:
                print(f"Error in streaming: {e}")
                yield f"data: [ERROR: {str(e)}]\n\n"

        return StreamingResponse(
            generate_stream(), media_type="text/event-stream"
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error generating streaming response: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to generate streaming response"
        )
