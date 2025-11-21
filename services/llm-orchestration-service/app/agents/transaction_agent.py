"""
Transaction Agent
Handles:
- Order placement (Deterministic flow)
- Booking creation
- Customer information management
- Structured workflows with validation
"""

from typing import Dict, Any, List, Optional
import logging
import json

from app.agents.base_agent import BaseAgent
from app.agents.intent_detector import intent_detector
from app.agents.order_orchestrator import order_orchestrator
from app.agents.response_generator import response_generator
from app.agents.booking_agent import booking_agent

logger = logging.getLogger(__name__)


class TransactionAgent(BaseAgent):
    """
    Transaction Agent for orders and bookings
    
    Refactored to use deterministic orchestration:
    1. Intent Detection (LLM)
    2. Orchestration (Code)
    3. Response Generation (LLM/Template)
    """

    def __init__(self):
        super().__init__(model="gpt-4o-mini", temperature=0.3)
        logger.info("Transaction Agent initialized (Deterministic Flow)")

    def _build_system_prompt(self) -> str:
        """Not used in new flow, but kept for BaseAgent compatibility"""
        return "You are a transaction agent."

    async def process(self, user_message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process transaction request using deterministic flow
        """
        logger.info(f"Transaction Agent processing: {user_message[:100]}...")

        try:
            # Step 0: Rule-based booking detection (before intent detection)
            # Check if message contains booking availability keywords
            msg_lower = user_message.lower()
            booking_resources = ["futsal", "tennis", "court", "field", "lapangan", "meja", "room", "badminton", "basketball"]
            availability_keywords = ["kosong", "available", "tersedia", "ada slot", "kapan"]

            is_booking_availability = False
            has_resource = any(resource in msg_lower for resource in booking_resources)
            has_availability_keyword = any(keyword in msg_lower for keyword in availability_keywords)

            if has_resource and has_availability_keyword:
                is_booking_availability = True
                logger.info(f"[RULE-BASED] Detected booking availability inquiry → routing to booking agent")
                print(f"[DEBUG] RULE-BASED booking detection triggered for: {user_message}")

            # Step 1: Detect Intent
            conversation_history = context.get("conversation_history", [])
            intent_result = await intent_detector.detect(user_message, conversation_history)

            intent = intent_result.get("intent")
            sub_intent = intent_result.get("sub_intent")
            entities = intent_result.get("entities", {})

            # Override intent if rule-based detection found booking availability
            if is_booking_availability:
                logger.info(f"[OVERRIDE] Forcing intent to BOOKING (was: {intent})")
                intent = "BOOKING"
                sub_intent = "CHECK_AVAILABILITY"

            logger.info(f"[TRANSACTION AGENT] Detected Intent: {intent}, Sub-intent: {sub_intent}, Entities: {entities}")
            print(f"[DEBUG] Transaction Agent - Intent: {intent}, Sub-intent: {sub_intent}")

            # Step 2: Orchestrate based on Intent
            current_state = context.get("workflow_state", {}) or {}

            response_text = ""
            new_state = current_state
            transaction_created = False
            transaction_id = None
            function_calls = [] # Legacy support

            # Check if we're in the middle of an active transaction
            # If so, ALWAYS route to orchestrator regardless of detected intent
            has_active_workflow = current_state.get("current_step") is not None

            if intent == "ORDER" or has_active_workflow:
                # Use Order Orchestrator
                orchestrator_result = await order_orchestrator.process(
                    intent_data=intent_result,
                    context=context,
                    state=current_state,
                    user_message=user_message
                )
                
                action = orchestrator_result.get("action")
                data = orchestrator_result.get("data", {})
                new_state = orchestrator_result.get("new_state", current_state)
                error = orchestrator_result.get("error")
                
                # Check if transaction created
                if action == "SHOW_ORDER_SUCCESS":
                    transaction_created = True
                    transaction_id = data.get("order_id")
                
                # Step 3: Generate Response
                response_text = await response_generator.generate(action, data, conversation_history)
                
            elif intent == "BOOKING":
                # Use Booking Agent for availability checks and booking creation
                booking_result = await booking_agent.process(
                    user_message=user_message,
                    context=context
                )

                response_text = booking_result.get("response")
                function_calls = booking_result.get("function_calls", [])
                
            elif intent == "INQUIRY":
                # Handle inquiries (could delegate to InformationAgent or handle simple ones)
                response_text = "Untuk pertanyaan seputar produk, bisa tanya langsung ya kak! 😊"

            elif intent == "GENERAL":
                # Handle general intents like greetings, thanks, etc.
                if sub_intent == "GREETING":
                    response_text = "Hai kak! Ada yang bisa aku bantu? Mau order atau tanya-tanya produk? 😊"
                elif sub_intent == "THANKS":
                    response_text = "Sama-sama kak! Senang bisa bantu 😊"
                else:
                    response_text = "Hai kak! Ada yang bisa aku bantu? 😊"

            else:
                # Fallback for unknown intents
                response_text = "Maaf kak, aku kurang paham. Bisa diulangi? 😊"

            return {
                "response": response_text,
                "workflow_state": new_state,
                "transaction_created": transaction_created,
                "transaction_id": transaction_id,
                "function_calls": function_calls,
                "intent_data": intent_result  # Include full intent detection results
            }

        except Exception as e:
            logger.error(f"Error in Transaction Agent: {e}")
            import traceback
            traceback.print_exc()
            return {
                "response": "Maaf, terjadi kesalahan saat memproses pesanan Anda. Silakan coba lagi atau hubungi customer service kami.",
                "workflow_state": context.get("workflow_state", {}),
                "transaction_created": False,
                "transaction_id": None,
                "function_calls": [],
                "error": str(e)
            }

    def _build_function_tools(self) -> List[Dict[str, Any]]:
        """Deprecated in deterministic flow"""
        return []

    async def _execute_function(self, function_name: str, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Deprecated in deterministic flow"""
        return {}


# Singleton instance
transaction_agent = TransactionAgent()
