"""
Prompt Service - Assembles prompts from context
"""
from typing import List, Dict, Any
from uuid import UUID

from app.models import PromptContext, Message, RAGContext
from app.services.context_service import context_service
from app.config import settings


class PromptService:
    """Service for assembling prompts"""

    def __init__(self):
        self.max_context_length = settings.max_context_length

    async def assemble_prompt(
        self,
        user_message: str,
        conversation_id: UUID,
        tenant_id: UUID,
        kb_ids: List[UUID],
    ) -> PromptContext:
        """
        Assemble full prompt context

        Args:
            user_message: User's message
            conversation_id: Conversation UUID
            tenant_id: Tenant UUID
            kb_ids: Knowledge base IDs for RAG

        Returns:
            Complete prompt context
        """
        # Fetch all context in parallel
        import asyncio

        tenant_config, conversation_history, rag_context = await asyncio.gather(
            context_service.get_tenant_config(tenant_id),
            context_service.get_conversation_history(
                conversation_id, tenant_id, settings.conversation_history_limit
            ),
            context_service.get_rag_context(
                user_message,
                tenant_id,
                kb_ids,
                settings.rag_top_k,
                settings.rag_min_score,
            ),
        )

        # Build system prompt
        system_prompt = self._build_system_prompt(tenant_config, rag_context)

        return PromptContext(
            system_prompt=system_prompt,
            rag_context=rag_context,
            conversation_history=conversation_history,
            user_message=user_message,
            tenant_config=tenant_config,
        )

    def _build_system_prompt(
        self, tenant_config: Dict[str, Any], rag_context: List[RAGContext]
    ) -> str:
        """
        Build system prompt with custom instructions and RAG context

        Args:
            tenant_config: Tenant configuration
            rag_context: RAG context chunks

        Returns:
            System prompt string
        """
        instructions = tenant_config.get("instructions", "Be helpful, professional, and concise.")

        prompt_parts = [
            "You are a helpful customer service assistant for a business using WhatsApp.",
            f"\n\nCustom Instructions:\n{instructions}",
            "\n\nGeneral Guidelines:",
            "- Use the provided knowledge base information to answer questions accurately",
            "- If you don't know something, admit it rather than making up information",
            "- Stay on topic and focus on helping the customer",
            "\n\nBooking Capabilities:",
            "- You can help customers search for available resources (courts, fields, rooms) and create bookings",
            "- When a customer asks about availability, use the search_availability function to check what's available",
            "- When a customer confirms they want to book, collect all necessary information (resource, date, time, phone, name) and use the create_booking function",
            "- IMPORTANT: When calling create_booking, you MUST use the 'id' field from the search_availability results as the resource_id parameter (e.g., 'a0a64e3f-5913-4cec-8a57-9c0361f242f4'), NOT the resource name",
            "- Always confirm the booking details with the customer before creating the booking",
            "- If a time slot is already booked, suggest alternative times or resources",
        ]

        # Add RAG context if available
        if rag_context:
            prompt_parts.append("\n\nRelevant Information from Knowledge Base:")
            for i, context in enumerate(rag_context, 1):
                truncated_text = self._truncate_text(context.text, 500)
                prompt_parts.append(
                    f"\n[Source {i}: {context.source} (relevance: {context.score:.2f})]"
                )
                prompt_parts.append(f"{truncated_text}")

            prompt_parts.append(
                "\n\nUse the above information to help answer the customer's question."
            )
        else:
            prompt_parts.append(
                "\n\nNote: No specific knowledge base information is available for this query. Use your general knowledge to help."
            )

        return "".join(prompt_parts)

    def format_messages_for_openai(self, prompt_context: PromptContext) -> List[Dict[str, str]]:
        """
        Format messages for OpenAI API

        Args:
            prompt_context: Prompt context

        Returns:
            List of messages in OpenAI format
        """
        messages = [{"role": "system", "content": prompt_context.system_prompt}]

        # Add conversation history
        for msg in prompt_context.conversation_history:
            if msg.sender_type == "customer":
                messages.append({"role": "user", "content": msg.content})
            elif msg.sender_type in ["llm", "agent"]:
                messages.append({"role": "assistant", "content": msg.content})

        # Add current user message
        messages.append({"role": "user", "content": prompt_context.user_message})

        return messages

    def _truncate_text(self, text: str, max_length: int) -> str:
        """Truncate text to max length"""
        if len(text) <= max_length:
            return text
        return text[: max_length - 3] + "..."


prompt_service = PromptService()
