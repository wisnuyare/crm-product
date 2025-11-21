"""
Booking Agent

Handles booking availability checks and booking creation using function calling.
"""

from typing import Dict, Any, List
import logging
import json
from datetime import datetime, timedelta

from app.agents.base_agent import BaseAgent
from app.services.context_service import context_service

logger = logging.getLogger(__name__)


class BookingAgent(BaseAgent):
    """
    Booking Agent for checking availability and creating bookings

    Uses function calling to:
    1. Check available time slots for resources
    2. Create bookings
    """

    def __init__(self):
        super().__init__(model="gpt-4o", temperature=0.3)
        logger.info("Booking Agent initialized")

    def _build_system_prompt(self) -> str:
        """Build booking agent system prompt"""
        from datetime import datetime
        today = datetime.now()
        today_str = today.strftime("%Y-%m-%d")
        tomorrow_str = (today + timedelta(days=1)).strftime("%Y-%m-%d")
        day_name = today.strftime("%A")

        return f"""You are a booking assistant for a sports facility management system.

CURRENT DATE CONTEXT:
- Today is {day_name}, {today_str} (YYYY-MM-DD format)
- Tomorrow is {tomorrow_str}
- Current month: {today.strftime("%B %Y")}

CAPABILITIES:
- Check availability of resources (futsal courts, tennis courts, meeting rooms, etc.)
- Create bookings for customers
- Provide information about resources and rates

DATE PARSING RULES (VERY IMPORTANT):
1. "tanggal 23" or "tgl 23" → {today.year}-{today.month:02d}-23
2. "besok" → {tomorrow_str}
3. "hari ini" or "today" → {today_str}
4. "lusa" → {(today + timedelta(days=2)).strftime("%Y-%m-%d")}
5. If customer asks "kapan kosong?" or "when available?" WITHOUT specific date:
   - DO NOT call function yet
   - Ask: "Mau cek ketersediaan tanggal berapa kak? Hari ini, besok, atau tanggal tertentu?"
   - Wait for customer to specify date
6. Always use YYYY-MM-DD format for function calls

RESOURCE TYPE MAPPING:
- futsal, lapangan futsal, mini soccer → "field"
- tennis, lapangan tennis, badminton → "court"
- meeting room, ruang meeting → "room"

AVAILABILITY CHECK PROCESS:
1. Parse date from customer message using rules above
2. Identify resource type
3. Call check_availability function with parsed date and resource_type
4. Present results clearly in Bahasa Indonesia

RESPONSE STYLE:
- Use Bahasa Indonesia (casual/friendly tone)
- Format prices: "Rp 100.000" (with period separator)
- List time slots clearly
- If no slots available, suggest checking other dates
- Always confirm what customer wants to book

EXAMPLE INTERACTIONS:

Example 1 - Specific date:
Customer: "futsal tanggal 23 kosong jam berapa?"
Parse: date={today.year}-{today.month:02d}-23, resource_type=field
Response: "Untuk lapangan futsal tanggal 23 November, tersedia jam:
- 08:00 - 09:00 (Rp 100.000)
- 10:00 - 11:00 (Rp 100.000)
[... more slots ...]
Mau booking jam berapa kak?"

Example 2 - Vague query:
Customer: "kapan lapangan futsal kosong?"
Response: "Mau cek ketersediaan tanggal berapa kak? Hari ini, besok, atau tanggal tertentu?"
(Wait for customer to specify before calling function)

Example 3 - Tomorrow:
Customer: "saya mau booking futsal besok"
Parse: date={tomorrow_str}, resource_type=field
Response: [Call function and show available slots]

Remember: Parse dates correctly using today's context ({today_str}). If date is ambiguous, ask for clarification!"""

    async def process(self, user_message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process booking request with function calling
        """
        logger.info(f"Booking Agent processing: {user_message[:100]}...")

        try:
            # Build messages with function definition
            messages = [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_message}
            ]

            # Define available functions
            from datetime import datetime
            today = datetime.now()

            functions = [
                {
                    "type": "function",
                    "function": {
                        "name": "check_availability",
                        "description": f"Check available time slots for booking resources on a specific date. Today is {today.strftime('%Y-%m-%d')}. Parse Indonesian dates: 'tanggal 23'={today.year}-{today.month:02d}-23, 'besok'=tomorrow, 'hari ini'=today.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "resource_type": {
                                    "type": "string",
                                    "enum": ["court", "field", "room", "equipment"],
                                    "description": "Type of resource. Map: futsal/soccer→field, tennis/badminton→court, meeting→room"
                                },
                                "date": {
                                    "type": "string",
                                    "description": f"Date in YYYY-MM-DD format. IMPORTANT: Parse relative dates using today's date ({today.strftime('%Y-%m-%d')}). Examples: 'tanggal 23'→{today.year}-{today.month:02d}-23, 'besok'→tomorrow's date, 'hari ini'→{today.strftime('%Y-%m-%d')}"
                                }
                            },
                            "required": ["resource_type", "date"]
                        }
                    }
                }
            ]

            # Call LLM with function calling
            response = await self._call_llm_with_tools(messages=messages, tools=functions)

            # Check if function was called
            if response.choices[0].message.tool_calls:
                tool_call = response.choices[0].message.tool_calls[0]
                function_name = tool_call.function.name
                function_args = json.loads(tool_call.function.arguments)

                logger.info(f"Function called: {function_name} with args: {function_args}")

                # Execute function
                if function_name == "check_availability":
                    availability_result = await self._check_availability(
                        tenant_id=context["tenant_id"],
                        resource_type=function_args.get("resource_type"),
                        date=function_args.get("date")
                    )

                    # Add function result to conversation
                    messages.append(response.choices[0].message.model_dump())
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": function_name,
                        "content": json.dumps(availability_result)
                    })

                    # Get final response from LLM
                    final_response = await self._call_llm(messages=messages)
                    response_text = final_response.choices[0].message.content

                    return {
                        "response": response_text,
                        "function_calls": [{"name": function_name, "args": function_args, "result": availability_result}],
                        "availability_checked": True
                    }

            # No function called, direct response
            response_text = response.choices[0].message.content

            return {
                "response": response_text,
                "function_calls": [],
                "availability_checked": False
            }

        except Exception as e:
            logger.error(f"Error in Booking Agent: {e}", exc_info=True)
            return {
                "response": "Maaf kak, terjadi kesalahan saat mengecek ketersediaan. Silakan coba lagi ya! 🙏",
                "function_calls": [],
                "availability_checked": False,
                "error": str(e)
            }

    async def _check_availability(self, tenant_id: str, resource_type: str, date: str) -> Dict[str, Any]:
        """
        Check availability by calling booking service

        Args:
            tenant_id: Tenant ID
            resource_type: Resource type (court, field, room)
            date: Date in YYYY-MM-DD format

        Returns:
            Availability data with slots
        """
        try:
            from uuid import UUID
            result = await context_service.check_booking_availability(
                tenant_id=UUID(tenant_id),
                date=date,
                resource_type=resource_type
            )

            return result
        except Exception as e:
            logger.error(f"Error checking availability: {e}")
            return {"availabilities": [], "error": str(e)}


# Singleton instance
booking_agent = BookingAgent()
