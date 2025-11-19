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
from app.services.order_service import order_service
from app.services.customer_service import customer_service


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
                    "description": "Create a new booking for a resource. Use this when customer confirms they want to book a specific resource at a specific time. IMPORTANT: You must use the exact 'id' field value (UUID format like 'a0a64e3f-5913-4cec-8a57-9c0361f242f4') from the search_availability function results as the resource_id parameter.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "resource_id": {
                                "type": "string",
                                "description": "UUID of the resource to book (must be the exact 'id' value from search_availability results, NOT the resource name). Example: 'a0a64e3f-5913-4cec-8a57-9c0361f242f4'",
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

        # Define order tools for function calling
        self.order_tools = [
            {
                "type": "function",
                "function": {
                    "name": "check_product_availability",
                    "description": "Check if products are available in stock and get their prices. Use this when customer asks about products or wants to order something.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "product_names": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of product names to search for (e.g., ['chocolate cake', 'brownies'])",
                            },
                        },
                        "required": ["product_names"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "create_order",
                    "description": "Create a new order for the customer. Use this when customer confirms they want to order specific products with quantities.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "customer_phone": {
                                "type": "string",
                                "description": "Customer's phone number (with country code, e.g., '+628123456789')",
                            },
                            "customer_name": {
                                "type": "string",
                                "description": "Customer's full name",
                            },
                            "items": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "product_id": {
                                            "type": "string",
                                            "description": "UUID of the product to order",
                                        },
                                        "quantity": {
                                            "type": "integer",
                                            "description": "Quantity to order (must be positive)",
                                            "minimum": 1,
                                        },
                                        "notes": {
                                            "type": "string",
                                            "description": "Optional notes for this item (e.g., 'extra chocolate', 'no nuts')",
                                        },
                                    },
                                    "required": ["product_id", "quantity"],
                                },
                                "description": "List of items to order with product_id and quantity",
                            },
                            "pickup_date": {
                                "type": "string",
                                "description": "Pickup or delivery date in YYYY-MM-DD format (e.g., '2024-01-15'). Optional.",
                            },
                            "fulfillment_type": {
                                "type": "string",
                                "enum": ["pickup", "delivery"],
                                "description": "Type of fulfillment - 'pickup' or 'delivery'. Default is 'pickup'.",
                            },
                            "notes": {
                                "type": "string",
                                "description": "Optional general notes for the order",
                            },
                        },
                        "required": ["customer_phone", "customer_name", "items"],
                    },
                },
            },
        ]

        # Define customer tools for function calling
        self.customer_tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_customer_info",
                    "description": "Get saved customer information by phone number. Use this BEFORE creating an order or booking to check if we have the customer's information on file.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "customer_phone": {
                                "type": "string",
                                "description": "Customer's phone number (with country code, e.g., '+628123456789')",
                            },
                        },
                        "required": ["customer_phone"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "save_customer_info",
                    "description": "Save or update customer information for future orders. Use this when customer provides their details for the first time or updates their information.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "customer_phone": {
                                "type": "string",
                                "description": "Customer's phone number (with country code, e.g., '+628123456789')",
                            },
                            "customer_name": {
                                "type": "string",
                                "description": "Customer's full name",
                            },
                            "email": {
                                "type": "string",
                                "description": "Customer's email address (optional)",
                            },
                            "address": {
                                "type": "string",
                                "description": "Customer's delivery address (optional)",
                            },
                        },
                        "required": ["customer_phone", "customer_name"],
                    },
                },
            },
        ]

        # Combine all tools
        self.tools = self.booking_tools + self.order_tools + self.customer_tools

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
        conversation_id: Optional[str] = None,
    ) -> str:
        """
        Execute a tool call from OpenAI

        Args:
            tool_call: Tool call object from OpenAI
            tenant_id: Tenant UUID for API calls
            conversation_id: Optional conversation UUID for orders

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

            elif function_name == "check_product_availability":
                result = await order_service.check_product_availability(
                    tenant_id=tenant_id,
                    product_names=function_args.get("product_names", []),
                )
                return json.dumps(result)

            elif function_name == "create_order":
                result = await order_service.create_order(
                    tenant_id=tenant_id,
                    customer_phone=function_args.get("customer_phone"),
                    customer_name=function_args.get("customer_name"),
                    items=function_args.get("items", []),
                    conversation_id=conversation_id,  # Use conversation_id from parameter, not function args
                    pickup_date=function_args.get("pickup_date"),
                    fulfillment_type=function_args.get("fulfillment_type", "pickup"),
                    notes=function_args.get("notes"),
                )
                return json.dumps(result)

            elif function_name == "get_customer_info":
                result = await customer_service.get_customer_info(
                    tenant_id=tenant_id,
                    customer_phone=function_args.get("customer_phone"),
                )
                return json.dumps(result)

            elif function_name == "save_customer_info":
                result = await customer_service.save_customer_info(
                    tenant_id=tenant_id,
                    customer_phone=function_args.get("customer_phone"),
                    customer_name=function_args.get("customer_name"),
                    email=function_args.get("email"),
                    address=function_args.get("address"),
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
        functions_executed = []  # Track executed functions

        # DEBUG: Log function calling configuration
        tools_enabled = self.tools if enable_booking else None
        print(f"🔧 Function calling enabled: {enable_booking}", flush=True)
        print(f"🔧 Tools available: {len(self.tools) if tools_enabled else 0}", flush=True)
        if tools_enabled:
            print(f"🔧 Tool names: {[t['function']['name'] for t in self.tools]}", flush=True)

        # Call OpenAI API with tools if booking enabled
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens or settings.openai_max_tokens,
            temperature=temperature or settings.openai_temperature,
            tools=self.tools if enable_booking else None,  # Now includes both booking and order tools
            tool_choice="auto" if enable_booking else None,
        )

        response_message = response.choices[0].message
        total_output_tokens += response.usage.completion_tokens

        # DEBUG: Log tool call results
        print(f"🔍 Tool calls in response: {bool(response_message.tool_calls)}", flush=True)
        if response_message.tool_calls:
            print(f"🔍 Number of tool calls: {len(response_message.tool_calls)}", flush=True)
            for tc in response_message.tool_calls:
                print(f"🔍 Tool: {tc.function.name} | Args: {tc.function.arguments}", flush=True)

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
                function_response = await self.execute_tool_call(
                    tool_call,
                    tenant_id,
                    conversation_id=str(conversation_id)
                )

                # Track function execution
                functions_executed.append({
                    "name": tool_call.function.name,
                    "arguments": json.loads(tool_call.function.arguments),
                    "result": json.loads(function_response),
                })
                print(f"✅ Executed: {tool_call.function.name}", flush=True)

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
            functions_executed=functions_executed,  # Include function execution info
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
