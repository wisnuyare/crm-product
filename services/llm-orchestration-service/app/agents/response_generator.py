"""
Response Generator
Generates friendly, conversational responses in Bahasa Indonesia
NO function calling - just text generation based on action + data
"""

import os
from openai import AsyncOpenAI
from typing import Dict, Any, List

class ResponseGenerator:
    """Generates friendly responses based on orchestrator actions"""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = "gpt-4o-mini"

    async def generate(self, action: str, data: Dict[str, Any], conversation_history: List[Dict] = None) -> str:
        """
        Generate response based on action and data

        Args:
            action: Action from orchestrator (ASK_DELIVERY_METHOD, ASK_CONFIRMATION, etc.)
            data: Context data for generating response
            conversation_history: Recent conversation for anti-repetition

        Returns:
            str: Friendly response in Bahasa Indonesia
        """

        # PRIMARY: Use LLM to generate natural, varied responses
        llm_response = await self._generate_with_llm(action, data, conversation_history or [])
        if llm_response and not llm_response.startswith("Maaf kak, ada kendala"):
            return llm_response

        # FALLBACK: Use basic template only if LLM fails
        template_response = self._get_fallback_template(action, data)
        if template_response:
            return template_response

        # LAST RESORT: Generic error message
        return "Maaf kak, ada kendala teknis nih. Bisa coba lagi ya? 🙏"

    def _get_fallback_template(self, action: str, data: Dict[str, Any]) -> str:
        """
        Emergency fallback templates - used ONLY when LLM fails
        TODO: These should be loaded from database and configurable via admin panel
        """

        # Minimal fallback messages - these will be replaced by user-configurable templates
        fallback_messages = {
            "ASK_NAME": "Boleh tau nama kamu siapa kak? 😊",
            "ASK_PRODUCT": "Siap kak! Mau order produk apa ya? 😊",
            "ASK_ADDRESS": "Oke kak! Alamat lengkapnya dimana ya? 📍",
            "ASK_DELIVERY_METHOD": "Mau pick up atau dikirim kak? 😊",
            "ASK_CONFIRMATION": "Pesanan sudah benar kak? 😊",
            "SHOW_ORDER_SUCCESS": f"Siap kak! Pesanan #{data.get('order_id', '')} sudah kami terima ya ✅",
            "SHOW_ERROR": data.get("message", "Maaf kak, ada kendala nih. Bisa coba lagi ya? 🙏"),
        }

        return fallback_messages.get(action)

    async def _generate_with_llm(self, action: str, data: Dict[str, Any], conversation_history: List[Dict]) -> str:
        """Generate response using LLM - PRIMARY method for all responses"""

        # Build context-specific instructions based on action
        action_instructions = {
            "ASK_DELIVERY_METHOD": "Greet with 'Hai kak [name]' if customer name is available (ALWAYS include 'kak' before the name!), tell them you found the product with unit price, show total for quantity ordered, then ask if they want pickup or delivery. Vary your wording - don't use the same sentence structure every time!",
            "ASK_NAME": "Politely ask for the customer's name. If data contains quantity or delivery_method, acknowledge those details first (e.g., 'Oke kak! Quantity 2, pickup. Tapi aku masih butuh nama kamu nih, siapa namanya?')",
            "ASK_PRODUCT": "Ask which product they want to order",
            "ASK_ADDRESS": "Ask for their complete delivery address",
            "ASK_CONFIRMATION": "Summarize the order (product, quantity, total price, delivery method, address if delivery) and ask for confirmation. If customer name is available, use 'kak [name]', otherwise just 'kak'. Vary your wording!",
            "SHOW_ORDER_SUCCESS": "Confirm order received with order ID and estimated ready time",
            "SHOW_ERROR": "Show the error message warmly",
            "SHOW_PRODUCT_NOT_FOUND": "Apologize that the exact product wasn't found. If suggestions are provided and they seem related to what the customer asked for, mention them. If suggestions are clearly unrelated or irrelevant, DO NOT list them - just apologize and ask if they want something else"
        }

        instruction = action_instructions.get(action, "Respond appropriately to the situation")
        
        # Extract previous bot responses for anti-repetition
        previous_bot_messages = []
        if conversation_history:
            for msg in conversation_history[-6:]:  # Last 6 messages
                try:
                    sender_type = msg.get("sender_type") if isinstance(msg, dict) else getattr(msg, "sender_type", "user")
                    content = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", "")
                    
                    if sender_type in ["assistant", "llm", "agent"]:
                        previous_bot_messages.append(content)
                except:
                    pass
        
        # Build anti-repetition context
        repetition_warning = ""
        if previous_bot_messages:
            repetition_warning = f"\n\nIMPORTANT ANTI-REPETITION RULES:\n- You previously said: {previous_bot_messages}\n- DO NOT use the same sentence structure, word order, or phrasing as any previous message\n- Mix up your greeting style, word choices, and emoji placement\n- If you find yourself writing something similar to a previous message, STOP and rephrase it completely differently\n"

        system_prompt = f"""You are a friendly WhatsApp customer service agent for a food/product store.

Generate a warm, conversational response in Bahasa Indonesia.

CRITICAL STYLE GUIDELINES:
- Use "kak" to address customer (NOT "Anda" - too formal!)
- Be warm and friendly with emojis: 😊 🙏 ✨ (but don't overuse)
- Use casual Indonesian: "mau", "gak", "oke", "yuk", "nih", "dong"
- Format prices as "Rp 25.000" (with dots for thousands, no commas)
- Keep it SHORT (1-2 sentences max)
- VARY your wording - don't be repetitive! Use different sentence structures each time
- Be natural and conversational like texting a friend{repetition_warning}

TASK: {instruction}

Available data to use:
{data}

Generate ONLY the response text in Bahasa Indonesia. No explanations, no English."""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Generate the response now"}
                ],
                temperature=0.8,  # Higher temperature for more variety
                max_tokens=150
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            print(f"Response generation error: {e}")
            return None  # Return None so fallback template is used


# Singleton instance
response_generator = ResponseGenerator()
