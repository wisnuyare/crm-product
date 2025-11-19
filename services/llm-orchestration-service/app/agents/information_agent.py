"""
Information Agent

Handles:
- Product inquiries (70% of traffic)
- General questions (greetings, thanks, business hours)
- RAG context retrieval
- Product recommendations
- Conversion detection (routes to Transaction Agent if customer wants to order)
"""

from typing import Dict, Any, List
import logging

from app.agents.base_agent import BaseAgent
from app.services.context_service import context_service

logger = logging.getLogger(__name__)


class InformationAgent(BaseAgent):
    """
    Information Agent for product inquiries and general questions

    This agent handles non-transactional queries with RAG context.
    Lightweight prompt (~800 tokens) for fast, cost-effective responses.
    """

    def __init__(self):
        super().__init__(model="gpt-4o-mini", temperature=0.7)
        logger.info("Information Agent initialized")

    def _build_system_prompt(self) -> str:
        """Build information agent system prompt"""
        return """You are a helpful customer service assistant answering product questions.

KNOWLEDGE BASE USAGE:
- Use the provided knowledge base context to answer questions
- When customer asks "ada apa?" or "apa yang ada?" → List ALL available products with prices
- Be conversational and friendly in Bahasa Indonesia

PRODUCT RECOMMENDATIONS:
- If customer asks for product NOT in knowledge base:
  1. Check for SIMILAR products in the provided context
  2. Suggest alternatives: "Maaf, kami tidak ada [X], tapi kami punya [Y] yang mirip seharga Rp [price]"
  3. Handle typos intelligently: "kichi" = "kimchi", "ayam gorng" = "ayam goreng"

- If NO similar products exist:
  → "Maaf, kami tidak ada [X]. Produk lain yang tersedia: [list 2-3 items]"

SALES APPROACH:
- Always suggest alternatives, don't just say "tidak ada"
- Highlight product benefits when describing
- Be helpful and proactive

CONVERSION TO ORDER:
- If customer says "mau pesan", "order", "beli", "saya mau":
  → Respond: "Baik, saya akan bantu proses pesanan Anda."
  → System will automatically re-route to Transaction Agent
  → DO NOT try to handle the order yourself

GENERAL QUESTIONS:
- Answer business hours, location, contact info from knowledge base
- Keep responses concise but informative (2-3 sentences max)
- Be friendly and professional

RESPONSE GUIDELINES:
- Respond in Bahasa Indonesia
- Keep it conversational and warm
- If information not in knowledge base: "Informasi tersebut tidak tersedia saat ini. Silakan hubungi customer service kami."
- Always end with a helpful question: "Ada yang bisa saya bantu lagi?"

Remember: You handle INFORMATION only. If customer wants to ORDER, acknowledge and let system route to Transaction Agent."""

    async def process(self, user_message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate response for product inquiry or general question

        Args:
            user_message: Customer's message
            context: Context dict with:
                - tenant_id: Tenant UUID
                - conversation_id: Conversation UUID
                - kb_ids: Knowledge base IDs for RAG
                - conversation_history: Previous messages

        Returns:
            {
                "response": str,
                "rag_sources": List[str],
                "should_reroute": bool,
                "new_intent": str | None
            }
        """
        logger.info(f"Information Agent processing: {user_message[:100]}...")

        try:
            # Step 1: Get RAG context from knowledge base
            rag_context = await self._get_rag_context(
                user_message=user_message,
                tenant_id=context["tenant_id"],
                kb_ids=context.get("kb_ids", []),
            )

            # Step 2: Build enhanced system prompt with RAG
            enhanced_prompt = self._add_rag_context(self.system_prompt, rag_context)

            # Step 3: Build messages with conversation history
            messages = self._build_messages(
                user_message=user_message,
                conversation_history=context.get("conversation_history", []),
                system_prompt=enhanced_prompt,
            )

            # Step 4: Generate response
            response_obj = await self._call_llm(messages=messages, temperature=0.7)
            response_text = response_obj.choices[0].message.content

            # Step 5: Check if customer wants to order (trigger re-routing)
            should_reroute = self._detect_order_intent(response_text, user_message)

            logger.info(f"Information Agent response generated (reroute={should_reroute})")

            return {
                "response": response_text,
                "rag_sources": [ctx.source for ctx in rag_context],
                "should_reroute": should_reroute,
                "new_intent": "place_order" if should_reroute else None,
            }

        except Exception as e:
            logger.error(f"Error in Information Agent: {e}")
            # Fallback response
            return {
                "response": "Maaf, terjadi kesalahan. Silakan coba lagi atau hubungi customer service kami.",
                "rag_sources": [],
                "should_reroute": False,
                "new_intent": None,
                "error": str(e),
            }

    async def _get_rag_context(
        self,
        user_message: str,
        tenant_id: str,
        kb_ids: List[str],
    ) -> List[Any]:
        """
        Retrieve RAG context from knowledge base

        Args:
            user_message: User's query
            tenant_id: Tenant ID
            kb_ids: Knowledge base IDs

        Returns:
            List of RAG context objects
        """
        try:
            rag_context = await context_service.get_rag_context(
                query=user_message,
                tenant_id=tenant_id,
                kb_ids=kb_ids,
                top_k=3,
                min_score=0.7,
            )
            logger.info(f"Retrieved {len(rag_context)} RAG chunks")
            return rag_context
        except Exception as e:
            logger.error(f"Error retrieving RAG context: {e}")
            return []

    def _add_rag_context(self, base_prompt: str, rag_context: List) -> str:
        """
        Add RAG context to system prompt

        Args:
            base_prompt: Base system prompt
            rag_context: RAG context chunks

        Returns:
            Enhanced system prompt with RAG context
        """
        if not rag_context:
            return base_prompt + "\n\n⚠️ No knowledge base info found. Ask customer to be more specific about what they're looking for."

        context_str = "\n\nRelevant Information from Knowledge Base:\n"
        for i, ctx in enumerate(rag_context, 1):
            # Truncate to 500 chars
            truncated_text = ctx.text[:500] + "..." if len(ctx.text) > 500 else ctx.text
            context_str += f"\n[Source {i}: {ctx.source} (relevance: {ctx.score:.2f})]\n"
            context_str += f"{truncated_text}\n"

        return base_prompt + context_str

    def _detect_order_intent(self, response: str, user_message: str) -> bool:
        """
        Detect if customer expressed intent to order

        Args:
            response: Agent's response
            user_message: Customer's message

        Returns:
            True if order intent detected
        """
        # Order phrases in agent response
        response_order_phrases = [
            "saya akan bantu proses pesanan",
            "baik, saya akan proses",
        ]

        # Order phrases in customer message
        customer_order_phrases = [
            "mau pesan",
            "mau order",
            "mau beli",
            "saya mau",
            "order dong",
            "pesan dong",
        ]

        response_lower = response.lower()
        message_lower = user_message.lower()

        # Check if response indicates order processing
        if any(phrase in response_lower for phrase in response_order_phrases):
            return True

        # Check if customer message contains order intent
        if any(phrase in message_lower for phrase in customer_order_phrases):
            return True

        return False


# Singleton instance
information_agent = InformationAgent()
