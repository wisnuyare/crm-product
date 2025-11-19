"""
Multi-Agent Router

Orchestrates the flow between Orchestrator, Information, and Transaction agents.

This router implements the multi-agent architecture:
1. Orchestrator: Security filtering + intent classification
2. Information Agent: Product inquiries + general questions (70% traffic)
3. Transaction Agent: Orders + bookings (30% traffic)
"""

from typing import Dict, Any, Optional
from uuid import UUID
import logging
import re

from app.agents.orchestrator import orchestrator
from app.agents.information_agent import information_agent
from app.agents.transaction_agent import transaction_agent
from app.services.context_service import context_service

logger = logging.getLogger(__name__)


class MultiAgentRouter:
    """
    Multi-agent router for intelligent message handling

    This router coordinates between multiple specialized agents to handle
    different types of customer queries efficiently.
    """

    def __init__(self):
        self.orchestrator = orchestrator
        self.information_agent = information_agent
        self.transaction_agent = transaction_agent
        logger.info("Multi-Agent Router initialized")

    async def process_message(
        self,
        user_message: str,
        tenant_id: UUID,
        conversation_id: UUID,
        outlet_id: Optional[UUID] = None,
        customer_phone: Optional[str] = None,
        kb_ids: Optional[list[UUID]] = None
    ) -> Dict[str, Any]:
        """
        Process incoming message through multi-agent system

        Args:
            user_message: Customer's message
            tenant_id: Tenant UUID
            conversation_id: Conversation UUID
            outlet_id: Optional outlet UUID (required for transactions)
            customer_phone: Optional customer phone (for transaction workflows)
            kb_ids: Optional knowledge base IDs for RAG

        Returns:
            {
                "response": str,
                "intent": str,
                "agent_used": str,
                "confidence": float,
                "transaction_created": bool,
                "transaction_id": str | None,
                "function_calls": List[dict],
                "metadata": dict
            }
        """
        logger.info(f"Processing message for conversation {conversation_id}: {user_message[:100]}...")

        try:
            # Step 1: Get conversation history
            conversation_history = await context_service.get_conversation_history(
                conversation_id=conversation_id,
                tenant_id=tenant_id,
                limit=6  # Last 3 turns (6 messages)
            )

            # Step 1.5: Check if transaction is in progress
            # Detect if customer is providing transaction-related information
            # (name, phone, address, etc.) - these should skip Orchestrator
            transaction_in_progress = False

            # Method 1: Check conversation history (if available)
            if conversation_history and len(conversation_history) > 0:
                last_message = conversation_history[-1]
                # Check if last message was from LLM (transaction agent asking question)
                if hasattr(last_message, 'sender_type') and last_message.sender_type == "llm":
                    # Keywords that indicate transaction workflow questions
                    transaction_keywords = [
                        "nama lengkap",  # full name
                        "alamat",  # address
                        "nomor telepon",  # phone number
                        "tanggal",  # date
                        "waktu",  # time
                        "jumlah",  # quantity
                        "konfirmasi pesanan",  # order confirmation
                    ]
                    last_msg_content = last_message.content.lower()
                    if any(keyword in last_msg_content for keyword in transaction_keywords):
                        transaction_in_progress = True
                        logger.info("🔄 Transaction in progress detected from history - skipping Orchestrator")

            # Method 2: Detect transaction response patterns (fallback if history fails)
            # Check if the user message looks like a transaction response
            if not transaction_in_progress:
                msg_lower = user_message.lower().strip()

                # Split message into lines for better multi-line analysis
                lines = user_message.strip().split('\n')
                first_line = lines[0].strip() if lines else ""

                # Phone number pattern (Indonesian format)
                phone_pattern = r'^(0|\+62)[0-9]{9,13}$'
                is_phone = bool(re.match(phone_pattern, msg_lower.replace(' ', '').replace('-', '')))

                # Name pattern (2-4 words with proper capitalization)
                # Check FIRST LINE only for name patterns (handles multi-line responses)
                first_line_words = first_line.split()
                is_name = (
                    len(first_line_words) >= 2 and len(first_line_words) <= 4 and
                    all(w[0].isupper() for w in first_line_words if len(w) > 0) and
                    not any(char.isdigit() for char in first_line)
                )

                # Address pattern (contains address keywords)
                address_keywords = ['jl.', 'jalan', 'no.', 'nomor', 'rt', 'rw', 'blok', 'gang', 'gg.', 'pick up', 'pickup', 'ambil sendiri']
                is_address = any(keyword in msg_lower for keyword in address_keywords)

                # Single word responses (likely answering yes/no or providing simple info)
                all_words = user_message.strip().split()
                is_simple_response = len(all_words) == 1 and len(user_message) < 20

                # Date/time pattern (likely booking response)
                date_pattern = r'\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?'  # Matches 12/1, 12-1-2024, etc.
                time_pattern = r'\d{1,2}[:\.]\d{2}|jam\s+\d{1,2}'  # Matches 14:00, 14.00, jam 2
                is_datetime = bool(re.search(date_pattern, msg_lower)) or bool(re.search(time_pattern, msg_lower))

                # Confirmation pattern (yes/no responses)
                confirmation_keywords = ['ya', 'iya', 'ok', 'oke', 'benar', 'betul', 'tidak', 'nggak', 'batal', 'jadi']
                is_confirmation = any(msg_lower == keyword or msg_lower.startswith(keyword + ' ') for keyword in confirmation_keywords)

                if is_phone or is_name or is_address or is_simple_response or is_datetime or is_confirmation:
                    transaction_in_progress = True
                    logger.info(f"🔄 Transaction response detected (phone={is_phone}, name={is_name}, address={is_address}, simple={is_simple_response}, datetime={is_datetime}, confirmation={is_confirmation}) - skipping Orchestrator")

            # Step 2: Orchestrator - Security filtering + intent classification
            # Skip if transaction is in progress
            if transaction_in_progress:
                # Route directly to Transaction Agent
                intent = "place_order"  # Continue transaction
                confidence = 1.0
                agent_to_use = "transaction"
                logger.info("Continuing transaction workflow, routing to Transaction Agent")
            else:
                # Normal flow - classify intent
                orchestrator_result = await self.orchestrator.process(
                    user_message=user_message,
                    context={"tenant_id": str(tenant_id)}
                )

                intent = orchestrator_result["intent"]
                confidence = orchestrator_result.get("confidence", 0.0)
                agent_to_use = orchestrator_result.get("agent")

                logger.info(f"Orchestrator classified intent: {intent} → {agent_to_use} (confidence: {confidence})")

            # Step 3: Handle REJECT (security threats)
            if intent == "REJECT":
                return {
                    "response": "Maaf, saya tidak dapat memproses permintaan tersebut. Silakan hubungi customer service kami untuk bantuan lebih lanjut.",
                    "intent": intent,
                    "agent_used": "orchestrator",
                    "confidence": confidence,
                    "transaction_created": False,
                    "transaction_id": None,
                    "function_calls": [],
                    "metadata": {
                        "rejected_reason": orchestrator_result.get("reason"),
                        "security_threat": True
                    }
                }

            # Step 4: Route to appropriate specialized agent
            if agent_to_use == "information":
                response_data = await self._handle_information_agent(
                    user_message=user_message,
                    tenant_id=tenant_id,
                    conversation_id=conversation_id,
                    kb_ids=kb_ids or [],
                    conversation_history=conversation_history
                )

                # Check if Information Agent detected order intent (re-routing)
                if response_data.get("should_reroute"):
                    logger.info("Information Agent detected order intent, re-routing to Transaction Agent")

                    response_data = await self._handle_transaction_agent(
                        user_message=user_message,
                        tenant_id=tenant_id,
                        conversation_id=conversation_id,
                        outlet_id=outlet_id,
                        customer_phone=customer_phone,
                        conversation_history=conversation_history,
                        original_response=response_data["response"]
                    )

                    response_data["metadata"]["rerouted_from"] = "information"

                response_data["intent"] = intent
                response_data["confidence"] = confidence
                return response_data

            elif agent_to_use == "transaction":
                response_data = await self._handle_transaction_agent(
                    user_message=user_message,
                    tenant_id=tenant_id,
                    conversation_id=conversation_id,
                    outlet_id=outlet_id,
                    customer_phone=customer_phone,
                    conversation_history=conversation_history
                )

                response_data["intent"] = intent
                response_data["confidence"] = confidence
                return response_data

            else:
                # Fallback (should not happen)
                logger.warning(f"Unknown agent: {agent_to_use}, falling back to information agent")
                response_data = await self._handle_information_agent(
                    user_message=user_message,
                    tenant_id=tenant_id,
                    conversation_id=conversation_id,
                    kb_ids=kb_ids or [],
                    conversation_history=conversation_history
                )
                response_data["intent"] = "general_question"
                response_data["confidence"] = 0.5
                return response_data

        except Exception as e:
            logger.error(f"Error in multi-agent router: {e}", exc_info=True)
            return {
                "response": "Maaf, terjadi kesalahan sistem. Mohon coba lagi dalam beberapa saat.",
                "intent": "error",
                "agent_used": "error_handler",
                "confidence": 0.0,
                "transaction_created": False,
                "transaction_id": None,
                "function_calls": [],
                "metadata": {
                    "error": str(e),
                    "error_type": type(e).__name__
                }
            }

    async def _handle_information_agent(
        self,
        user_message: str,
        tenant_id: UUID,
        conversation_id: UUID,
        kb_ids: list,
        conversation_history: list
    ) -> Dict[str, Any]:
        """
        Handle request with Information Agent

        Args:
            user_message: User's message
            tenant_id: Tenant UUID
            conversation_id: Conversation UUID
            kb_ids: Knowledge base IDs
            conversation_history: Previous messages

        Returns:
            Response data dictionary
        """
        logger.info("Routing to Information Agent")

        context = {
            "tenant_id": str(tenant_id),
            "conversation_id": str(conversation_id),
            "kb_ids": [str(kb_id) for kb_id in kb_ids],
            "conversation_history": conversation_history
        }

        result = await self.information_agent.process(
            user_message=user_message,
            context=context
        )

        return {
            "response": result["response"],
            "agent_used": "information",
            "transaction_created": False,
            "transaction_id": None,
            "function_calls": [],
            "should_reroute": result.get("should_reroute", False),
            "metadata": {
                "rag_sources": result.get("rag_sources", []),
                "rag_context_count": len(result.get("rag_sources", []))
            }
        }

    async def _handle_transaction_agent(
        self,
        user_message: str,
        tenant_id: UUID,
        conversation_id: UUID,
        outlet_id: Optional[UUID],
        customer_phone: Optional[str],
        conversation_history: list,
        original_response: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Handle request with Transaction Agent

        Args:
            user_message: User's message
            tenant_id: Tenant UUID
            conversation_id: Conversation UUID
            outlet_id: Outlet UUID
            customer_phone: Customer's phone number
            conversation_history: Previous messages
            original_response: Optional response from Information Agent (for re-routing)

        Returns:
            Response data dictionary
        """
        logger.info("Routing to Transaction Agent")

        if not outlet_id:
            logger.warning("Transaction requested but no outlet_id provided")
            return {
                "response": "Maaf, terjadi kesalahan konfigurasi. Silakan hubungi customer service.",
                "agent_used": "transaction",
                "transaction_created": False,
                "transaction_id": None,
                "function_calls": [],
                "metadata": {"error": "missing_outlet_id"}
            }

        context = {
            "tenant_id": str(tenant_id),
            "conversation_id": str(conversation_id),
            "outlet_id": str(outlet_id),
            "customer_phone": customer_phone or "",
            "transaction_type": "order",  # Can be dynamically determined
            "conversation_history": conversation_history,
            "workflow_state": {}
        }

        result = await self.transaction_agent.process(
            user_message=user_message,
            context=context
        )

        # If re-routing from Information Agent, prepend original response
        response_text = result["response"]
        if original_response:
            response_text = f"{original_response}\n\n{response_text}"

        return {
            "response": response_text,
            "agent_used": "transaction",
            "transaction_created": result.get("transaction_created", False),
            "transaction_id": result.get("transaction_id"),
            "function_calls": result.get("function_calls", []),
            "metadata": {
                "workflow_state": result.get("workflow_state", {}),
                "function_call_count": len(result.get("function_calls", []))
            }
        }


# Singleton instance
multi_agent_router = MultiAgentRouter()
