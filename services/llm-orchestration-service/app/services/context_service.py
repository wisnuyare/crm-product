"""
Context Service - Fetches context from other services
"""
import httpx
from typing import List, Dict, Any
from uuid import UUID

from app.config import settings
from app.models import Message, RAGContext


class ContextService:
    """Service for fetching context from other microservices"""

    def __init__(self):
        self.knowledge_service_url = settings.knowledge_service_url
        self.conversation_service_url = settings.conversation_service_url
        self.tenant_service_url = settings.tenant_service_url

    async def get_tenant_config(self, tenant_id: UUID) -> Dict[str, Any]:
        """
        Fetch tenant LLM configuration

        Args:
            tenant_id: Tenant UUID

        Returns:
            Tenant configuration including custom instructions
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.tenant_service_url}/api/v1/tenants/{tenant_id}",
                    headers={"X-Tenant-Id": str(tenant_id)},
                    timeout=5.0,
                )
                response.raise_for_status()
                data = response.json()

                # Extract instructions from llm_tone field
                llm_config = data.get("llm_tone", {})
                return {
                    "instructions": llm_config.get("instructions", "Be helpful, professional, and concise."),
                    "greeting_message": data.get("greeting_message", "Hello! How can I help you today?"),
                    "error_message": data.get("error_message", "I am sorry, but I cannot answer that question. Please ask another question."),
                }
        except Exception as e:
            print(f"Error fetching tenant config: {e}")
            # Return default instructions if service unavailable
            return {
                "instructions": "Be helpful, professional, and concise.",
                "greeting_message": "Hello! How can I help you today?",
                "error_message": "I am sorry, but I cannot answer that question. Please ask another question.",
            }

    async def get_conversation_history(
        self, conversation_id: UUID, tenant_id: UUID, limit: int = 4
    ) -> List[Message]:
        """
        Fetch recent conversation messages

        Args:
            conversation_id: Conversation UUID
            tenant_id: Tenant UUID
            limit: Number of recent messages to fetch

        Returns:
            List of recent messages
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.conversation_service_url}/api/v1/conversations/{conversation_id}/messages/recent",
                    params={"count": limit},
                    headers={"X-Tenant-Id": str(tenant_id)},
                    timeout=5.0,
                )
                response.raise_for_status()
                messages_data = response.json()

                return [
                    Message(
                        sender_type=msg["sender_type"],
                        content=msg["content"],
                        timestamp=msg["timestamp"],
                    )
                    for msg in messages_data
                ]
        except Exception as e:
            print(f"Error fetching conversation history: {e}")
            return []

    async def get_rag_context(
        self, query: str, tenant_id: UUID, kb_ids: List[UUID], top_k: int = 5, min_score: float = 0.7
    ) -> List[RAGContext]:
        """
        Fetch RAG context from Knowledge Service

        Args:
            query: Search query
            tenant_id: Tenant UUID
            kb_ids: Knowledge base IDs to search
            top_k: Number of results to return
            min_score: Minimum similarity score

        Returns:
            List of RAG context chunks
        """
        if not kb_ids:
            return []

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.knowledge_service_url}/api/v1/search",
                    json={
                        "query": query,
                        "knowledge_base_ids": [str(kb_id) for kb_id in kb_ids],
                        "top_k": top_k,
                        "min_score": min_score,
                    },
                    headers={"X-Tenant-Id": str(tenant_id)},
                    timeout=10.0,
                )
                response.raise_for_status()
                results = response.json()

                return [
                    RAGContext(
                        text=result["chunk_text"],
                        source=result.get("document_filename", "unknown"),
                        score=result["score"],
                        chunk_index=result.get("chunk_index", 0),
                    )
                    for result in results
                ]
        except Exception as e:
            print(f"Error fetching RAG context: {e}")
            return []


context_service = ContextService()
