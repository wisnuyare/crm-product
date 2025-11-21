"""
Intent Detection Agent
Analyzes user messages and extracts structured intent + entities
"""

import os
from openai import AsyncOpenAI
from typing import Dict, Any, Optional, List
import json

class IntentDetector:
    """Detects user intent and extracts entities from messages"""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = "gpt-4o-mini"  # Fast, cheap model for classification

    async def detect(self, message: str, conversation_history: List[Dict] = None) -> Dict[str, Any]:
        """
        Detect intent and extract entities from user message

        Returns:
        {
            "intent": "ORDER" | "BOOKING" | "INQUIRY" | "GENERAL",
            "sub_intent": "NEW_ORDER" | "CONFIRM_ORDER" | "PROVIDE_DELIVERY_METHOD" | "PROVIDE_ADDRESS" | etc,
            "entities": {
                "product_name": str,
                "quantity": int,
                "delivery_method": "pickup" | "delivery",
                "address": str,
                "confirmation": bool
            },
            "confidence": float
        }
        """

        # Build context from conversation history
        context_messages = []
        if conversation_history:
            for msg in conversation_history[-5:]:  # Last 5 messages for context
                # Handle both dict and Pydantic Message objects
                try:
                    # Try Pydantic object first (has sender_type, not role)
                    role = msg.sender_type if hasattr(msg, 'sender_type') else msg.role
                    content = msg.content
                except AttributeError:
                    # Fall back to dictionary
                    role = msg.get("sender_type") or msg.get("role", "user")
                    content = msg.get("content", "")

                # Map sender_type to OpenAI role (llm/assistant -> assistant, customer -> user)
                openai_role = "assistant" if role in ["assistant", "llm", "agent"] else "user"

                context_messages.append({
                    "role": openai_role,
                    "content": content
                })

        system_prompt = """You are an intent classification system for a WhatsApp order/booking bot.

🚨 CRITICAL BOOKING AVAILABILITY DETECTION (CHECK THIS FIRST!):
If the message mentions booking resources (futsal, tennis, court, field, lapangan, meja, room, badminton, basketball) with ANY of these patterns:
- "kosong" (empty/available)
- "available"
- "tersedia" (available)
- "ada slot" (has slots)
- "kapan" (when) + resource name
- "jam berapa" (what time) + "kosong"/"available"

→ MUST classify as BOOKING intent with CHECK_AVAILABILITY sub-intent
→ DO NOT classify as INQUIRY or ORDER!
→ DO NOT treat futsal/tennis/court/field/lapangan as product_name - they are booking resources!

Examples that MUST be BOOKING (NOT INQUIRY):
- "futsal tanggal 23 kosong jam berapa?" → BOOKING/CHECK_AVAILABILITY (service_type: futsal, NOT product_name!)
- "kapan lapangan futsal kosong?" → BOOKING/CHECK_AVAILABILITY (service_type: futsal)
- "tennis court available when?" → BOOKING/CHECK_AVAILABILITY (service_type: tennis)
- "ada slot futsal besok?" → BOOKING/CHECK_AVAILABILITY (service_type: futsal)

Analyze the user's message and return a JSON object with:
1. intent: Main category (ORDER, BOOKING, INQUIRY, GENERAL)
2. sub_intent: Specific action within the intent
3. entities: Extracted information
4. confidence: 0.0-1.0 how confident you are

INTENT CATEGORIES:

ORDER Intent - Sub-intents:
- NEW_ORDER: Customer wants to place a new order WITH product specified. If you can identify ANY product name in the message, use NEW_ORDER! (e.g., "mau order kimchi sawi 2 pack", "kimchi bisa?", "mau order kimchi", "ada kimchi?")
- WANT_TO_ORDER: Customer expresses intent to order but NO product specified and NO active order context (e.g., "iya aku mau order", "mau order", "pesan dong")
- PROVIDE_DELIVERY_METHOD: Customer specifying pickup or delivery, OR providing quantity + delivery when order is active (e.g., "pick up aja", "dikirim", "mau 2 dong, di pick up")
- PROVIDE_ADDRESS: Customer providing delivery address
- CONFIRM_ORDER: Customer confirming order (e.g., "ya", "betul", "oke")
- CANCEL_ORDER: Customer wants to cancel

BOOKING Intent - Sub-intents:
- CHECK_AVAILABILITY: Customer checking availability of booking resources (e.g., "futsal tanggal 23 kosong jam berapa?", "kapan lapangan kosong?", "tennis court available when?", "ada slot jam berapa?")
- NEW_BOOKING: Customer wants to make appointment/booking (e.g., "mau booking futsal besok jam 2", "reserve meja 4 orang")
- PROVIDE_DATE_TIME: Customer providing booking time
- CONFIRM_BOOKING: Confirming booking details

⚠️ CRITICAL BOOKING DETECTION RULES:
- If message asks about booking resource availability (futsal, tennis, lapangan, court, field) with words like "kosong", "available", "ada slot", "tersedia", "kapan" → BOOKING intent with CHECK_AVAILABILITY sub-intent
- Keywords: "kosong" (empty), "available", "tersedia" (available), "ada slot", "kapan" (when), combined with resource names (futsal, tennis, court, field, lapangan, meja)
- DO NOT classify these as INQUIRY - they are BOOKING availability checks!

INQUIRY Intent - Sub-intents:
- PRODUCT_INQUIRY: Asking about products, prices, availability (NOT booking resources like futsal/tennis/courts)
- STORE_HOURS: Asking about operating hours
- LOCATION: Asking about store location

GENERAL Intent - Sub-intents:
- GREETING: "halo", "hai", "selamat pagi"
- THANKS: "terima kasih", "makasih"
- HELP: "bantuan", "gimana caranya"

ENTITIES to extract:
- product_name: Name of product for ORDERS ONLY (e.g., "kimchi sawi", "kimchi lobak"). DO NOT use for booking resources!
- quantity: Number of items (default 1 if not specified)
- delivery_method: "pickup" or "delivery" (null if not mentioned)
  * pickup: "pick up", "di pick up", "dipickup", "ambil sendiri", "di ambil sendiri", "diambil", "ambil", "pickup", "take away", "dijemput"
  * delivery: "dikirim", "di kirim", "kirim", "delivery", "di delivery", "antar", "di antar", "diantar", "minta diantar"
- address: Delivery address string (null if not mentioned)
- confirmation: true/false for "ya", "betul", "oke", "tidak", "batal"
- service_type: For BOOKINGS ONLY - booking resources like "futsal", "tennis", "court", "field", "lapangan", "badminton", "basketball", "meja", "room"
- datetime: For bookings (e.g., "besok jam 2", "senin pagi", "tanggal 23")

CRITICAL ENTITY EXTRACTION RULES:
⚠️ A SINGLE message can contain MULTIPLE entities (quantity + delivery_method, product + quantity + delivery, etc.)
⚠️ ALWAYS extract ALL entities mentioned in the message - don't stop after finding one!
⚠️ Examples:
  - "mau 2 dong, di pick up" → quantity: 2, delivery_method: "pickup" (BOTH entities!)
  - "order 3 kimchi, kirim ya" → product_name: "kimchi", quantity: 3, delivery_method: "delivery" (THREE entities!)
  - "2 kimchi sawi, Jl. Sudirman 123" → product_name: "kimchi sawi", quantity: 2, address: "Jl. Sudirman 123" (THREE entities!)

CRITICAL PRODUCT EXTRACTION RULES:
- If you see ANY word that could be a product name (like "kimchi", "sawi", "lobak", etc.), EXTRACT IT and use NEW_ORDER!
- Ignore question words like "ada?", "bisa?", "ready?" - just extract the product name
- "mau order kimchi bisa?" = NEW_ORDER with product "kimchi" (NOT WANT_TO_ORDER!)
- "kimchi ada?" = NEW_ORDER with product "kimchi"
- Only use WANT_TO_ORDER if there's truly NO product name mentioned at all

CRITICAL CONTEXT RULES:
- If the customer previously expressed intent to order (e.g., "mau order", "aku mau pesan") and then mentions a product name, classify as NEW_ORDER even if they're asking "ada?", "ready?", "available?"
- Example: Previous: "mau order" → Current: "kimchi ada?" → Intent: ORDER, sub_intent: NEW_ORDER, product_name: "kimchi"
- If there's an ACTIVE ORDER in the conversation (bot asked for name/address/delivery, or customer mentioned a product), and customer provides quantity/delivery WITHOUT a product name, classify as PROVIDE_DELIVERY_METHOD (NOT NEW_ORDER!)
- Example: Previous: Bot asked for name → Current: "mau 2 dong, di pick up" → Intent: ORDER, sub_intent: PROVIDE_DELIVERY_METHOD, quantity: 2, delivery_method: "pickup"
- If message is just "pick up" or "dikirim" after product inquiry, intent is ORDER with sub_intent PROVIDE_DELIVERY_METHOD
- If message is an address after delivery method, intent is ORDER with sub_intent PROVIDE_ADDRESS
- If message is "ya"/"betul" after order summary, intent is ORDER with sub_intent CONFIRM_ORDER
- USE THE CONVERSATION HISTORY to understand context! Don't treat messages in isolation!
- Return ONLY valid JSON, no markdown, no explanations

Example 1:
User: "mau order kimchi sawi 2 pack"
Output: {
  "intent": "ORDER",
  "sub_intent": "NEW_ORDER",
  "entities": {
    "product_name": "kimchi sawi",
    "quantity": 2,
    "delivery_method": null,
    "address": null,
    "confirmation": null
  },
  "confidence": 0.95
}

Example 1b:
User: "mau order kimchi bisa?"
Output: {
  "intent": "ORDER",
  "sub_intent": "NEW_ORDER",
  "entities": {
    "product_name": "kimchi",
    "quantity": 1,
    "delivery_method": null,
    "address": null,
    "confirmation": null
  },
  "confidence": 0.90
}

Example 1c:
User: "aku mau 2, di ambil sendiri ya"
Context: Previous message was about ordering kimchi
Output: {
  "intent": "ORDER",
  "sub_intent": "NEW_ORDER",
  "entities": {
    "product_name": null,
    "quantity": 2,
    "delivery_method": "pickup",
    "address": null,
    "confirmation": null
  },
  "confidence": 0.95
}

Example 1d:
User: "mau 2 dong, di pick up"
Context: Previous message - bot asked for customer name (active order in progress)
Output: {
  "intent": "ORDER",
  "sub_intent": "PROVIDE_DELIVERY_METHOD",
  "entities": {
    "product_name": null,
    "quantity": 2,
    "delivery_method": "pickup",
    "address": null,
    "confirmation": null
  },
  "confidence": 0.95
}

Example 2:
User: "pick up aja"
Context: Previous message was about ordering
Output: {
  "intent": "ORDER",
  "sub_intent": "PROVIDE_DELIVERY_METHOD",
  "entities": {
    "product_name": null,
    "quantity": null,
    "delivery_method": "pickup",
    "address": null,
    "confirmation": null
  },
  "confidence": 0.98
}

Example 3:
User: "kimchi ada?"
Context: Previous message was "halo mau order"
Output: {
  "intent": "ORDER",
  "sub_intent": "NEW_ORDER",
  "entities": {
    "product_name": "kimchi",
    "quantity": 1,
    "delivery_method": null,
    "address": null,
    "confirmation": null
  },
  "confidence": 0.95
}

Example 4:
User: "Jl. Sudirman No. 123"
Context: Previous message asked for delivery address
Output: {
  "intent": "ORDER",
  "sub_intent": "PROVIDE_ADDRESS",
  "entities": {
    "product_name": null,
    "quantity": null,
    "delivery_method": null,
    "address": "Jl. Sudirman No. 123",
    "confirmation": null
  },
  "confidence": 0.92
}

Example 5:
User: "betul"
Context: Previous message was order confirmation
Output: {
  "intent": "ORDER",
  "sub_intent": "CONFIRM_ORDER",
  "entities": {
    "product_name": null,
    "quantity": null,
    "delivery_method": null,
    "address": null,
    "confirmation": true
  },
  "confidence": 0.99
}

Example 6 (BOOKING - Availability Check):
User: "futsal tanggal 23 kosong jam berapa?"
Output: {
  "intent": "BOOKING",
  "sub_intent": "CHECK_AVAILABILITY",
  "entities": {
    "service_type": "futsal",
    "datetime": "tanggal 23"
  },
  "confidence": 0.95
}

Example 7 (BOOKING - Availability Check):
User: "kapan lapangan futsal kosong?"
Output: {
  "intent": "BOOKING",
  "sub_intent": "CHECK_AVAILABILITY",
  "entities": {
    "service_type": "futsal"
  },
  "confidence": 0.90
}

Example 8 (BOOKING - Availability Check):
User: "tennis court available when?"
Output: {
  "intent": "BOOKING",
  "sub_intent": "CHECK_AVAILABILITY",
  "entities": {
    "service_type": "tennis"
  },
  "confidence": 0.90
}

Now analyze this message and return ONLY the JSON."""

        messages = [
            {"role": "system", "content": system_prompt}
        ]

        # Add conversation context
        messages.extend(context_messages)

        # Add current user message
        messages.append({"role": "user", "content": message})

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1,  # Low temperature for consistent classification
                max_tokens=300,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)

            # Validate required fields
            if "intent" not in result:
                result["intent"] = "GENERAL"
            if "sub_intent" not in result:
                result["sub_intent"] = "UNKNOWN"
            if "entities" not in result:
                result["entities"] = {}
            if "confidence" not in result:
                result["confidence"] = 0.5

            return result

        except Exception as e:
            print(f"Intent detection error: {str(e)}")
            # Fallback to general intent
            return {
                "intent": "GENERAL",
                "sub_intent": "UNKNOWN",
                "entities": {},
                "confidence": 0.0,
                "error": str(e)
            }


# Singleton instance
intent_detector = IntentDetector()
