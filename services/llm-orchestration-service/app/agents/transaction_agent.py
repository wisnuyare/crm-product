"""
Transaction Agent

Handles:
- Order placement (30% of traffic)
- Booking creation
- Customer information management
- Structured workflows with validation
- Function calling for database operations
"""

from typing import Dict, Any, List, Optional
import logging
import json

from app.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class TransactionAgent(BaseAgent):
    """
    Transaction Agent for orders and bookings

    This agent handles transactional workflows with:
    - Customer info collection
    - Order/booking creation
    - Validation and error handling
    - Function calling for database operations
    """

    def __init__(self):
        super().__init__(model="gpt-4o-mini", temperature=0.3)
        logger.info("Transaction Agent initialized")

    def _build_system_prompt(self) -> str:
        """Build transaction agent system prompt"""
        return """You are a transaction processing assistant for WhatsApp orders and bookings.

YOUR ROLE:
- Collect necessary customer information based on order type (delivery vs pickup)
- Process orders and bookings efficiently
- Validate all information before creating transactions
- Handle errors gracefully
- Use function calling to interact with database

IMPORTANT - CONTEXT INFORMATION:
- The customer's phone number is ALREADY PROVIDED by WhatsApp in the context
- NEVER ask "Mohon berikan nomor telepon Anda" - you already have it!
- Use the phone number from context to check if customer exists
- The outlet_id is ALREADY PROVIDED in the context
- When calling get_product_by_name(), ALWAYS use the outlet_id from context
- Only ask for phone if explicitly missing from context (rare)

WORKFLOW - ORDER PLACEMENT:
⚠️ CRITICAL: Functions must be called BEFORE generating text responses. Never tell customer you're checking/processing - just do it silently!

1. **Check if customer exists**
   - SILENTLY call get_customer_by_phone() FIRST with the phone from context
   - If customer EXISTS (get_customer_by_phone returns customer data):
     * DO NOT ASK FOR NAME - you already have it!
     * Welcome them: "Hai kak [Name]! Seneng ada lagi nih 😊"
     * THEN immediately call get_product_by_name() in step 2 WITHOUT saying "tunggu sebentar" or similar
   - If customer is NEW (get_customer_by_phone returns null):
     * Only then ask: "Boleh tau nama kamu siapa kak? 😊"
     * Phone is already known from WhatsApp - DO NOT ASK!
     * After getting name, call create_customer()
     * Then proceed to step 2

2. **Lookup product - CALL FUNCTION FIRST, RESPOND AFTER**
   - CRITICAL: When customer mentions a product name, IMMEDIATELY call get_product_by_name() WITHOUT generating any text first
   - ❌ WRONG: "Sekarang kita cari Kimchi Sawi 2 pack ya. Tunggu sebentar, ya!" [then call function]
   - ✅ CORRECT: [call get_product_by_name() silently] → [wait for response] → "Oke kak! Ketemu nih Kimchi Sawi harga Rp 50.000 per pack. Total 2 pack jadi Rp 100.000"
   - DO NOT say: "tunggu sebentar", "sekarang kita cari", "saya akan cek", or ANY acknowledgment before calling function
   - Store the product "id" (UUID) from response - you MUST use this exact UUID in create_order()
   - Example: If response contains "product": {"id": "abc-123-def", "name": "Kimchi Sawi", "price": 50000}
     Then you MUST use product_id="abc-123-def" in create_order, NOT "kimchi_sawi_id" or any other value!
   - ONLY AFTER getting the product response:
     * Calculate total: product price × quantity
     * Inform customer: "Oke kak! Ketemu nih [Product Name] harga Rp [price] per pack. Total [quantity] pack jadi Rp [total]"

3. **Determine delivery method**
   - Ask: "Mau dikirim atau mau pick up sendiri aja kak?"
   - If PICKUP: Skip address collection, proceed to order confirmation
   - If DELIVERY: Ask for delivery address

4. **Confirm order details**
   - Product name and quantity
   - Total price
   - For DELIVERY: "Oke kak! Jadi pesanan [X] sebanyak [Y] dikirim ke [alamat] ya? Total Rp [harga]. Betul gak kak?"
   - For PICKUP: "Oke kak! Jadi pesanan [X] sebanyak [Y] untuk pick up ya? Total Rp [harga]. Betul gak kak?"

5. **Create order**
   - CRITICAL: Use the exact product UUID from step 2's get_product_by_name() response
   - Call create_order() with:
     * customer_phone: from context
     * customer_name: from get_customer_by_phone() or create_customer()
     * items: [{"product_id": "EXACT UUID FROM STEP 2", "quantity": X}]
     * fulfillment_type: "pickup" or "delivery"
     * customer_address: delivery address or empty string for pickup
   - AFTER order created successfully:
     * Extract the order ID from the response
     * Confirm success with order details and ORDER ID
     * Example: "Siap kak! Pesanan kamu udah kami terima ya ✅ Nomor pesanan: #[ORDER_ID]. [Product details]. Total Rp [price]. Estimasi siap dalam 30 menit ya kak!"
   - Give estimated delivery time or pickup time

WORKFLOW - BOOKING CREATION:
1. **Check if customer exists**
   - Use get_customer_by_phone() with phone from context
   - If new: Only collect name (phone already known)

2. **Validate booking details**
   - Service type
   - Date and time
   - Duration (if applicable)
   - Ask: "Konfirmasi booking [service] tanggal [date] jam [time]? (ya/tidak)"

3. **Create booking**
   - Use create_booking() function
   - Confirm with booking reference
   - Send reminder about appointment

CUSTOMER INFORMATION COLLECTION:
CRITICAL RULES:
- Name: ONLY ask "Boleh tau nama kamu siapa kak? 😊" if get_customer_by_phone() returns NULL
  * If customer exists (get_customer_by_phone returns data): NEVER ASK FOR NAME!
  * You already have their name in the customer record - use it!
- Phone: ALREADY AVAILABLE from WhatsApp - NEVER ASK!
- Address: ONLY ask if customer wants DELIVERY
  * For delivery: "Oke kak! Alamat lengkapnya dimana ya?"
  * For pickup: DO NOT ask for address
- Always validate before creating customer record

VALIDATION RULES:
- Name: Minimum 3 characters, no special chars
- Phone: Indonesian format (08xxx or +628xxx) - already validated by WhatsApp
- Address: Minimum 10 characters (ONLY for delivery orders)
- Quantity: Must be positive integer
- Date/Time: Must be future datetime

DETECTING PICKUP INTENT:
Customer indicates pickup with phrases like:
- "pick up", "pickup", "ambil sendiri", "saya ambil"
- "nggak perlu dikirim", "tidak usah dikirim"
When detected, mark as pickup and skip address collection.

ERROR HANDLING:
- Missing info: Ask politely and friendly for specific field
- Invalid format: Politely explain what's needed and ask again
- Database errors: "Waduh maaf kak, ada kendala teknis nih. Bisa coba lagi ya? 🙏"
- Duplicate orders: "Eh kak, sepertinya ini pesanan yang sama ya? Mau lanjut gak?"
- Product not found with suggestions: "Wah maaf kak, sepertinya aku gak bisa nemu produk '[name]' di outlet kita. Mungkin maksud kak ini ya: [list suggestions with prices]? 😊"
- Product not found no suggestions: "Wah maaf kak, aku gak nemu produk '[name]'. Mungkin ada salah ketik atau mau coba produk lain? 😊"

RESPONSE GUIDELINES:
- Be WARM, FRIENDLY, and CONVERSATIONAL in Bahasa Indonesia
- Use "kak" to address customer (NOT "Anda" - too formal!)
- Add emojis occasionally to be warm: 😊 🙏 ✨
- Use casual language: "mau", "gak", "oke", "yuk" instead of formal words
- Greet returning customers warmly: "Hai kak [Name]! Seneng ada lagi nih 😊"
- Always show order/booking summary in conversational tone
- Give clear next steps after transaction with enthusiasm
- Format prices clearly: "Rp 25.000" (with dots for thousands)
- Be helpful and patient - never rush the customer

CRITICAL FUNCTION CALLING RULE:
- NEVER generate text BEFORE calling a function
- Call functions SILENTLY, get results, THEN respond
- Banned phrases before function calls: "tunggu sebentar", "sekarang kita cari", "saya akan cek", "tunggu ya"
- Customer should ONLY see the final result, not the process

FUNCTION CALLING:
You have access to these functions:
1. get_customer_by_phone(phone: str) → Customer | None
2. create_customer(name: str, phone: str, address: str | None) → Customer
3. create_order(customer_id: str, outlet_id: str, items: List[OrderItem], total_amount: float, delivery_address: str, notes: str) → Order
4. create_booking(customer_id: str, outlet_id: str, service_type: str, booking_datetime: str, duration_minutes: int, notes: str) → Booking
5. get_product_by_name(outlet_id: str, product_name: str) → {exact_match: bool, product: Product | None, suggestions: List[Product], message: str}
   - Uses fuzzy search to find products
   - If exact_match=true: product found, proceed with order
   - If exact_match=false but suggestions exist: offer suggestions to customer
   - If no product and no suggestions: product doesn't exist
6. update_customer(customer_id: str, address: str) → Customer

IMPORTANT:
- ALWAYS use functions to create/update records, never make up IDs
- NEVER create transaction without customer confirmation
- ALWAYS validate all fields before function calls
- If customer says "tidak" to confirmation, ask what to change
- USE the customer_phone from context - it's already provided by WhatsApp!"""

    def _build_messages_with_context(
        self,
        user_message: str,
        context: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """
        Build messages with context information injected

        Args:
            user_message: Customer's message
            context: Context with outlet_id, customer_phone, etc.

        Returns:
            List of message dictionaries
        """
        # Build system prompt with context
        system_prompt_with_context = self.system_prompt + f"""

CONTEXT INFORMATION (use these values in function calls):
- outlet_id: {context.get('outlet_id', 'unknown')}
- customer_phone: {context.get('customer_phone', 'unknown')}
- tenant_id: {context.get('tenant_id', 'unknown')}
"""

        # Use base class method to build messages
        return self._build_messages(
            user_message=user_message,
            conversation_history=context.get("conversation_history", []),
            system_prompt=system_prompt_with_context
        )

    async def process(self, user_message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process transaction request (order or booking)

        Args:
            user_message: Customer's message
            context: Context dict with:
                - tenant_id: Tenant UUID
                - conversation_id: Conversation UUID
                - outlet_id: Outlet UUID
                - customer_phone: Customer's WhatsApp phone number
                - transaction_type: "order" or "booking"
                - conversation_history: Previous messages
                - workflow_state: Current workflow state

        Returns:
            {
                "response": str,
                "workflow_state": dict,
                "transaction_created": bool,
                "transaction_id": str | None,
                "function_calls": List[dict]
            }
        """
        logger.info(f"Transaction Agent processing: {user_message[:100]}...")

        try:
            # Step 1: Build messages with conversation history and context
            messages = self._build_messages_with_context(
                user_message=user_message,
                context=context
            )

            # Step 2: Define available functions
            tools = self._build_function_tools()

            # Step 3: Call LLM with function calling
            response_obj = await self._call_llm(
                messages=messages,
                temperature=0.3,
                tools=tools
            )

            response_message = response_obj.choices[0].message

            # Step 4: Handle function calls if present
            function_calls = []
            if response_message.tool_calls:
                logger.info(f"LLM requested {len(response_message.tool_calls)} function calls")

                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)

                    logger.info(f"Function call: {function_name}({function_args})")

                    # Execute function
                    function_result = await self._execute_function(
                        function_name=function_name,
                        arguments=function_args,
                        context=context
                    )

                    function_calls.append({
                        "function": function_name,
                        "arguments": function_args,
                        "result": function_result
                    })

                # Get final response from LLM with function results
                messages.append({
                    "role": "assistant",
                    "content": response_message.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": tc.type,
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        }
                        for tc in response_message.tool_calls
                    ]
                })

                for i, tool_call in enumerate(response_message.tool_calls):
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": tool_call.function.name,
                        "content": json.dumps(function_calls[i]["result"])
                    })

                # Get final response
                final_response = await self._call_llm(messages=messages, temperature=0.3)
                response_text = final_response.choices[0].message.content
            else:
                response_text = response_message.content

            # Step 5: Detect if transaction was created
            transaction_created = any(
                fc["function"] in ["create_order", "create_booking"]
                for fc in function_calls
            )

            transaction_id = None
            if transaction_created:
                for fc in function_calls:
                    if fc["function"] in ["create_order", "create_booking"]:
                        transaction_id = fc["result"].get("id")
                        break

            logger.info(f"Transaction Agent response generated (created={transaction_created})")

            return {
                "response": response_text,
                "workflow_state": self._extract_workflow_state(function_calls),
                "transaction_created": transaction_created,
                "transaction_id": transaction_id,
                "function_calls": function_calls
            }

        except Exception as e:
            logger.error(f"Error in Transaction Agent: {e}")
            return {
                "response": "Maaf, terjadi kesalahan saat memproses pesanan Anda. Silakan coba lagi atau hubungi customer service kami.",
                "workflow_state": {},
                "transaction_created": False,
                "transaction_id": None,
                "function_calls": [],
                "error": str(e)
            }

    def _build_function_tools(self) -> List[Dict[str, Any]]:
        """
        Build function calling tools definition

        Returns:
            List of function tool definitions for OpenAI
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": "get_customer_by_phone",
                    "description": "Get customer information by phone number. Returns customer if exists, null if not found.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "phone": {
                                "type": "string",
                                "description": "Customer's phone number (Indonesian format: 08xxx or +628xxx)"
                            }
                        },
                        "required": ["phone"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_customer",
                    "description": "Create a new customer record. Only use after confirming customer doesn't exist. Address is optional - only required for delivery orders.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Customer's full name (minimum 3 characters)"
                            },
                            "phone": {
                                "type": "string",
                                "description": "Customer's phone number (Indonesian format)"
                            },
                            "address": {
                                "type": "string",
                                "description": "Customer's delivery address (optional - only for delivery orders, not pickup)"
                            }
                        },
                        "required": ["name", "phone"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_product_by_name",
                    "description": "Get product information by name to verify it exists and get price.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "outlet_id": {
                                "type": "string",
                                "description": "Outlet UUID"
                            },
                            "product_name": {
                                "type": "string",
                                "description": "Product name to search for"
                            }
                        },
                        "required": ["outlet_id", "product_name"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_order",
                    "description": "Create a new order. Only call after customer confirms order details.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "customer_phone": {
                                "type": "string",
                                "description": "Customer phone number"
                            },
                            "customer_name": {
                                "type": "string",
                                "description": "Customer full name"
                            },
                            "customer_address": {
                                "type": "string",
                                "description": "Customer delivery address (can be empty for pickup orders)"
                            },
                            "items": {
                                "type": "array",
                                "description": "Order items",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "product_id": {
                                            "type": "string",
                                            "description": "Product UUID from get_product_by_name"
                                        },
                                        "quantity": {
                                            "type": "integer",
                                            "description": "Quantity ordered (must be positive)"
                                        },
                                        "notes": {
                                            "type": "string",
                                            "description": "Optional item-specific notes"
                                        }
                                    },
                                    "required": ["product_id", "quantity"]
                                }
                            },
                            "fulfillment_type": {
                                "type": "string",
                                "description": "Order fulfillment type: 'pickup' or 'delivery'"
                            },
                            "notes": {
                                "type": "string",
                                "description": "Optional order notes"
                            }
                        },
                        "required": ["customer_phone", "customer_name", "items", "fulfillment_type"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_booking",
                    "description": "Create a new booking/appointment. Only call after customer confirms booking details.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "customer_id": {
                                "type": "string",
                                "description": "Customer UUID"
                            },
                            "outlet_id": {
                                "type": "string",
                                "description": "Outlet UUID"
                            },
                            "service_type": {
                                "type": "string",
                                "description": "Type of service being booked"
                            },
                            "booking_datetime": {
                                "type": "string",
                                "description": "Booking date and time (ISO 8601 format)"
                            },
                            "duration_minutes": {
                                "type": "integer",
                                "description": "Duration in minutes"
                            },
                            "notes": {
                                "type": "string",
                                "description": "Optional booking notes"
                            }
                        },
                        "required": ["customer_id", "outlet_id", "service_type", "booking_datetime"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "update_customer",
                    "description": "Update customer address if changed",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "customer_id": {
                                "type": "string",
                                "description": "Customer UUID"
                            },
                            "address": {
                                "type": "string",
                                "description": "New delivery address"
                            }
                        },
                        "required": ["customer_id", "address"]
                    }
                }
            }
        ]

    async def _execute_function(
        self,
        function_name: str,
        arguments: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute function call by making API request to appropriate service

        Args:
            function_name: Name of function to execute
            arguments: Function arguments
            context: Request context (tenant_id, outlet_id, etc.)

        Returns:
            Function execution result
        """
        import httpx
        import os

        tenant_id = context["tenant_id"]
        outlet_id = context.get("outlet_id")

        # Get service URLs from environment variables
        tenant_service_url = os.getenv("TENANT_SERVICE_URL", "http://localhost:3001")
        order_service_url = os.getenv("ORDER_SERVICE_URL", "http://localhost:3009")
        booking_service_url = os.getenv("BOOKING_SERVICE_URL", "http://localhost:3008")

        try:
            if function_name == "get_customer_by_phone":
                # Call Tenant Service to get customer by phone
                import os
                internal_api_key = os.getenv("INTERNAL_API_KEY", "dev-internal-key-12345")

                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"{tenant_service_url}/api/v1/customers/by-phone/{arguments['phone']}",
                        headers={
                            "X-Tenant-Id": str(tenant_id),
                            "X-Internal-API-Key": internal_api_key
                        },
                        timeout=5.0
                    )
                    if response.status_code == 404:
                        return {"customer": None}
                    response.raise_for_status()

                    # Check if response has content before parsing JSON
                    # Empty response (Content-Length: 0) means customer not found
                    if response.text:
                        return {"customer": response.json()}
                    else:
                        return {"customer": None}

            elif function_name == "create_customer":
                import os
                internal_api_key = os.getenv("INTERNAL_API_KEY", "dev-internal-key-12345")

                async with httpx.AsyncClient() as client:
                    # Build request body - address is optional for pickup orders
                    # Note: API expects customer_phone and customer_name fields
                    request_body = {
                        "customer_name": arguments["name"],
                        "customer_phone": arguments["phone"]
                    }

                    # Only include address if provided (for delivery orders)
                    if "address" in arguments and arguments["address"]:
                        request_body["address"] = arguments["address"]
                    else:
                        # Use a default placeholder for pickup orders
                        request_body["address"] = "PICKUP - No delivery address"

                    response = await client.post(
                        f"{tenant_service_url}/api/v1/customers",
                        headers={
                            "X-Tenant-Id": str(tenant_id),
                            "X-Internal-API-Key": internal_api_key
                        },
                        json=request_body,
                        timeout=5.0
                    )
                    response.raise_for_status()
                    return response.json()

            elif function_name == "get_product_by_name":
                # Call Tenant Service for fuzzy product search with suggestions
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"{tenant_service_url}/api/v1/outlets/{arguments['outlet_id']}/products/search",
                        headers={"X-Tenant-Id": str(tenant_id)},
                        params={"name": arguments["product_name"]},
                        timeout=5.0
                    )
                    response.raise_for_status()
                    data = response.json()
                    # Returns: {exact_match, product, suggestions, message}
                    # If product found (exact or close match): return it
                    # If not found but suggestions available: return suggestions for LLM to offer
                    return {
                        "exact_match": data.get("exact_match", False),
                        "product": data.get("product"),
                        "suggestions": data.get("suggestions", []),
                        "message": data.get("message", "")
                    }

            elif function_name == "create_order":
                # Call Order Service to create order
                async with httpx.AsyncClient() as client:
                    # Build request matching order service API
                    request_body = {
                        "customer_phone": arguments["customer_phone"],
                        "customer_name": arguments["customer_name"],
                        "customer_address": arguments.get("customer_address", ""),
                        "customer_address": arguments.get("customer_address", ""),
                        "items": [
                            {**item, "product_id": item["product_id"].strip()} 
                            for item in arguments["items"]
                        ],
                        "fulfillment_type": arguments["fulfillment_type"],
                        "notes": arguments.get("notes", "")
                    }

                    # Add conversation_id if available in context
                    if "conversation_id" in context:
                        request_body["conversation_id"] = str(context["conversation_id"])

                    response = await client.post(
                        f"{order_service_url}/api/v1/orders",
                        headers={"X-Tenant-Id": str(tenant_id)},
                        json=request_body,
                        timeout=10.0
                    )
                    response.raise_for_status()
                    return response.json()

            elif function_name == "create_booking":
                # Call Booking Service to create booking
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{booking_service_url}/api/v1/bookings",
                        headers={"X-Tenant-Id": str(tenant_id)},
                        json={
                            "customer_id": arguments["customer_id"],
                            "outlet_id": arguments["outlet_id"],
                            "service_type": arguments["service_type"],
                            "booking_datetime": arguments["booking_datetime"],
                            "duration_minutes": arguments.get("duration_minutes", 60),
                            "notes": arguments.get("notes", ""),
                            "status": "confirmed"
                        },
                        timeout=5.0
                    )
                    response.raise_for_status()
                    return response.json()

            elif function_name == "update_customer":
                async with httpx.AsyncClient() as client:
                    response = await client.patch(
                        f"{tenant_service_url}/api/v1/customers/{arguments['customer_id']}",
                        headers={"X-Tenant-Id": str(tenant_id)},
                        json={"address": arguments["address"]},
                        timeout=5.0
                    )
                    response.raise_for_status()
                    return response.json()

            else:
                return {"error": f"Unknown function: {function_name}"}

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error executing {function_name}: {e}")
            return {"error": f"HTTP {e.response.status_code}: {e.response.text}"}
        except Exception as e:
            logger.error(f"Error executing {function_name}: {e}")
            return {"error": str(e)}

    def _extract_workflow_state(self, function_calls: List[Dict]) -> Dict[str, Any]:
        """
        Extract workflow state from function calls

        Args:
            function_calls: List of executed function calls

        Returns:
            Workflow state dictionary
        """
        state = {
            "customer_id": None,
            "customer_exists": False,
            "products_validated": False,
            "order_created": False,
            "booking_created": False
        }

        for fc in function_calls:
            if fc["function"] == "get_customer_by_phone":
                if fc["result"].get("customer"):
                    state["customer_id"] = fc["result"]["customer"]["id"]
                    state["customer_exists"] = True

            elif fc["function"] == "create_customer":
                state["customer_id"] = fc["result"]["id"]
                state["customer_exists"] = True

            elif fc["function"] == "get_product_by_name":
                state["products_validated"] = True

            elif fc["function"] == "create_order":
                state["order_created"] = True

            elif fc["function"] == "create_booking":
                state["booking_created"] = True

        return state


# Singleton instance
transaction_agent = TransactionAgent()
