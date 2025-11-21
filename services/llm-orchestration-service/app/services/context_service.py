"""
Context Service - Fetches context from other services
"""
import httpx
from typing import List, Dict, Any, Optional
from uuid import UUID

from app.config import settings
from app.models import Message, RAGContext
import redis.asyncio as redis
import json


class ContextService:
    """Service for fetching context from other microservices"""

    def __init__(self):
        self.knowledge_service_url = settings.knowledge_service_url
        self.conversation_service_url = settings.conversation_service_url
        self.knowledge_service_url = settings.knowledge_service_url
        self.conversation_service_url = settings.conversation_service_url
        self.tenant_service_url = settings.tenant_service_url
        self.booking_service_url = settings.booking_service_url

        # Initialize Redis
        self.redis = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            decode_responses=True
        )

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


    async def get_workflow_state(self, conversation_id: str) -> Dict[str, Any]:
        """Get workflow state from Redis"""
        try:
            data = await self.redis.get(f"workflow:{conversation_id}")
            return json.loads(data) if data else {}
        except Exception as e:
            print(f"Error getting workflow state: {e}")
            return {}

    async def save_workflow_state(self, conversation_id: str, state: Dict[str, Any]):
        """Save workflow state to Redis"""
        try:
            if not state:
                await self.redis.delete(f"workflow:{conversation_id}")
                return

            await self.redis.set(
                f"workflow:{conversation_id}",
                json.dumps(state),
                ex=3600  # Expire after 1 hour
            )
        except Exception as e:
            print(f"Error saving workflow state: {e}")

    async def get_products(self, tenant_id: UUID, outlet_id: UUID) -> List[Dict[str, Any]]:
        """
        Fetch products from tenant service

        Args:
            tenant_id: Tenant UUID
            outlet_id: Outlet UUID (used for filtering)

        Returns:
            List of products with name, price, description, status
        """
        try:
            import os
            internal_api_key = os.getenv("INTERNAL_API_KEY", "dev-internal-key-12345")

            async with httpx.AsyncClient() as client:
                # Use correct endpoint: /api/v1/products with optional outlet_id filter
                params = {}
                if outlet_id:
                    params["outlet_id"] = str(outlet_id)

                response = await client.get(
                    f"{self.tenant_service_url}/api/v1/products",
                    headers={
                        "X-Tenant-Id": str(tenant_id),
                        "X-Internal-API-Key": internal_api_key
                    },
                    params=params,
                    timeout=5.0,
                )
                response.raise_for_status()
                data = response.json()

                # Extract products list (API returns {products: [...], total: N})
                products = data.get("products", [])

                # Filter only active products
                active_products = [
                    p for p in products
                    if p.get("status") == "active"
                ]

                print(f"✅ Retrieved {len(active_products)} active products from tenant service")
                return active_products
        except Exception as e:
            print(f"❌ Error fetching products: {e}")
            return []

    async def check_booking_availability(
        self,
        tenant_id: UUID,
        date: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[UUID] = None
    ) -> Dict[str, Any]:
        """
        Check booking availability for resources on a specific date

        Args:
            tenant_id: Tenant UUID
            date: Date in YYYY-MM-DD format
            resource_type: Resource type filter (e.g., "court", "field")
            resource_id: Specific resource ID (optional)

        Returns:
            Dict with availabilities list containing available time slots
        """
        try:
            async with httpx.AsyncClient() as client:
                params = {"date": date}

                if resource_id:
                    params["resource_id"] = str(resource_id)
                elif resource_type:
                    params["resource_type"] = resource_type

                response = await client.get(
                    f"{self.booking_service_url}/api/v1/bookings/availability/check",
                    headers={"X-Tenant-Id": str(tenant_id)},
                    params=params,
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()

                print(f"[OK] Retrieved availability for {len(data.get('availabilities', []))} resources on {date}")
                return data
        except Exception as e:
            print(f"[ERROR] Error checking booking availability: {e}")
            return {"availabilities": [], "error": str(e)}


context_service = ContextService()
