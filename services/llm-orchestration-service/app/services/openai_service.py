"""
OpenAI Service - Handles OpenAI API interactions
"""
from openai import AsyncOpenAI
import tiktoken
import json
from typing import List, Dict, Any, AsyncGenerator, Optional
from uuid import UUID

from app.config import settings
from app.models import GenerateResponse
from app.services.booking_service import booking_service


class OpenAIService:
    """Service for OpenAI API interactions"""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        self.encoding = tiktoken.encoding_for_model("gpt-4")  # Use gpt-4 encoding for gpt-4o-mini

        # Define booking tools for function calling
        self.booking_tools = [
            {
                "type": "function",
                "function": {
                    "name": "search_availability",
                    "description": "Search for available resources (courts, fields, rooms) for booking. Use this when customer asks about availability or wants to see what can be booked.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "resource_type": {
                                "type": "string",
                                "description": "Type of resource to search for (e.g., 'futsal', 'tennis', 'badminton', 'meeting room'). Optional - if not specified, will show all resources.",
                            },
                            "date": {
                                "type": "string",
                                "description": "Date to check availability in YYYY-MM-DD format (e.g., '2024-01-15'). Optional - if not specified, will show resources without date filter.",
                            },
                        },
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "create_booking",
                    "description": "Create a new booking for a resource. Use this when customer confirms they want to book a specific resource at a specific time.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "resource_id": {
                                "type": "string",
                                "description": "UUID of the resource to book",
                            },
                            "customer_phone": {
                                "type": "string",
                                "description": "Customer's phone number (with country code, e.g., '+628123456789')",
                            },
                            "customer_name": {
                                "type": "string",
                                "description": "Customer's full name",
                            },
                            "booking_date": {
                                "type": "string",
                                "description": "Date of booking in YYYY-MM-DD format (e.g., '2024-01-15')",
                            },
                            "start_time": {
                                "type": "string",
                                "description": "Start time in HH:MM format (e.g., '14:00' for 2 PM)",
                            },
                            "end_time": {
                                "type": "string",
                                "description": "End time in HH:MM format (e.g., '16:00' for 4 PM)",
                            },
                            "notes": {
                                "type": "string",
                                "description": "Optional notes or special requests for the booking",
                            },
                        },
                        "required": ["resource_id", "customer_phone", "customer_name", "booking_date", "start_time", "end_time"],
                    },
                },
            },
        ]

    def count_tokens(self, messages: List[Dict[str, str]]) -> int:
        """
        Count tokens in messages

        Args:
            messages: List of messages in OpenAI format

        Returns:
            Token count
        """
        try:
            # Count tokens for all messages
            num_tokens = 0
            for message in messages:
                # Every message follows <im_start>{role/name}\n{content}<im_end>\n
                num_tokens += 4  # <im_start>{role/name}\n + <im_end>\n
                for key, value in message.items():
                    num_tokens += len(self.encoding.encode(value))
            num_tokens += 2  # every reply is primed with <im_start>assistant
            return num_tokens
        except Exception as e:
            print(f"Error counting tokens: {e}")
            # Rough estimate if encoding fails
            total_chars = sum(len(msg.get("content", "")) for msg in messages)
            return total_chars // 4

    def calculate_cost(self, input_tokens: int, output_tokens: int) -> Dict[str, float]:
        """
        Calculate cost based on token usage

        Args:
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens

        Returns:
            Cost breakdown
        """
        input_cost = (input_tokens / 1000) * settings.gpt4o_mini_input_cost
        output_cost = (output_tokens / 1000) * settings.gpt4o_mini_output_cost
        total_cost = input_cost + output_cost

        return {
            "input": round(input_cost, 8),
            "output": round(output_cost, 8),
            "total": round(total_cost, 8),
        }

    async def execute_tool_call(
        self,
        tool_call: Any,
        tenant_id: str,
    ) -> str:
        """
        Execute a tool call from OpenAI

        Args:
            tool_call: Tool call object from OpenAI
            tenant_id: Tenant UUID for API calls

        Returns:
            JSON string result of the tool call
        """
        function_name = tool_call.function.name
        function_args = json.loads(tool_call.function.arguments)

        try:
            if function_name == "search_availability":
                result = await booking_service.search_availability(
                    tenant_id=tenant_id,
                    resource_type=function_args.get("resource_type"),
                    date=function_args.get("date"),
                )
                return json.dumps(result)

            elif function_name == "create_booking":
                result = await booking_service.create_booking(
                    tenant_id=tenant_id,
                    resource_id=function_args.get("resource_id"),
                    customer_phone=function_args.get("customer_phone"),
                    customer_name=function_args.get("customer_name"),
                    booking_date=function_args.get("booking_date"),
                    start_time=function_args.get("start_time"),
                    end_time=function_args.get("end_time"),
                    notes=function_args.get("notes"),
                )
                return json.dumps(result)

            else:
                return json.dumps({"error": f"Unknown function: {function_name}"})

        except Exception as e:
            return json.dumps({"error": f"Function execution failed: {str(e)}"})

    async def generate(
        self,
        messages: List[Dict[str, str]],
        conversation_id: UUID,
        rag_sources: List[str],
        max_tokens: int = None,
        temperature: float = None,
        tenant_id: Optional[str] = None,
        enable_booking: bool = True,
    ) -> GenerateResponse:
        """
        Generate response from OpenAI (non-streaming) with function calling support

        Args:
            messages: Messages in OpenAI format
            conversation_id: Conversation UUID
            rag_sources: RAG source documents
            max_tokens: Max tokens to generate
            temperature: Temperature setting
            tenant_id: Tenant UUID for function calls
            enable_booking: Enable booking function calling

        Returns:
            Generate response with metadata
        """
        input_tokens = self.count_tokens(messages)
        total_output_tokens = 0

        # Call OpenAI API with tools if booking enabled
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens or settings.openai_max_tokens,
            temperature=temperature or settings.openai_temperature,
            tools=self.booking_tools if enable_booking else None,
            tool_choice="auto" if enable_booking else None,
        )

        response_message = response.choices[0].message
        total_output_tokens += response.usage.completion_tokens

        # Check if the model wants to call a function
        if response_message.tool_calls:
            # Add assistant's tool call request to messages
            messages.append({
                "role": "assistant",
                "content": response_message.content or "",
                "tool_calls": [
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments,
                        }
                    }
                    for tool_call in response_message.tool_calls
                ]
            })

            # Execute each tool call
            for tool_call in response_message.tool_calls:
                function_response = await self.execute_tool_call(tool_call, tenant_id)

                # Add tool response to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": function_response,
                })

            # Call OpenAI again with the tool results to get final response
            second_response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens or settings.openai_max_tokens,
                temperature=temperature or settings.openai_temperature,
            )

            assistant_message = second_response.choices[0].message.content
            total_output_tokens += second_response.usage.completion_tokens
            total_tokens = input_tokens + total_output_tokens

        else:
            # No tool calls, use the direct response
            assistant_message = response_message.content
            total_tokens = response.usage.total_tokens

        # Calculate cost
        cost = self.calculate_cost(input_tokens, total_output_tokens)

        return GenerateResponse(
            response=assistant_message,
            conversation_id=conversation_id,
            tokens_used={
                "input": input_tokens,
                "output": total_output_tokens,
                "total": total_tokens,
            },
            cost=cost,
            rag_context_used=len(rag_sources) > 0,
            rag_sources=rag_sources,
            model=self.model,
        )

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = None,
        temperature: float = None,
    ) -> AsyncGenerator[str, None]:
        """
        Generate streaming response from OpenAI (SSE)

        Args:
            messages: Messages in OpenAI format
            max_tokens: Max tokens to generate
            temperature: Temperature setting

        Yields:
            Response chunks
        """
        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens or settings.openai_max_tokens,
            temperature=temperature or settings.openai_temperature,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


openai_service = OpenAIService()
