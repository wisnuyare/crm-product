"""
Order Orchestrator
Deterministic state machine for handling order flow
NO LLM function calling - just code-based API orchestration
"""

import os
import httpx
from typing import Dict, Any, Optional, List
from enum import Enum

class OrderState(Enum):
    """Order flow states"""
    INIT = "init"
    AWAITING_NAME = "awaiting_name"
    AWAITING_PRODUCT = "awaiting_product"
    AWAITING_DELIVERY_METHOD = "awaiting_delivery_method"
    AWAITING_ADDRESS = "awaiting_address"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    COMPLETED = "completed"
    FAILED = "failed"

class OrderOrchestrator:
    """Manages order placement flow with deterministic state machine"""

    def __init__(self):
        self.tenant_service_url = os.getenv("TENANT_SERVICE_URL", "http://tenant-service:3001")
        self.order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3009")

    async def process(
        self,
        intent_data: Dict[str, Any],
        context: Dict[str, Any],
        state: Dict[str, Any],
        user_message: str = ""
    ) -> Dict[str, Any]:
        """
        Process order intent with deterministic logic

        Args:
            intent_data: Output from intent detector
            context: Session context (customer_phone, outlet_id, tenant_id, etc.)
            state: Current order state

        Returns:
            {
                "action": "ASK_DELIVERY_METHOD" | "ASK_ADDRESS" | "ASK_CONFIRMATION" | "CREATE_ORDER" | "SHOW_ERROR",
                "data": {...},  # Data for response generator
                "new_state": {...},  # Updated state
                "error": str | null
            }
        """

        sub_intent = intent_data.get("sub_intent")
        entities = intent_data.get("entities", {})
        current_step = state.get("current_step")

        try:
            # Handle AWAITING_NAME state (User provides name)
            if current_step == OrderState.AWAITING_NAME.value:
                # Check if user provided order details instead of name
                # (e.g., "aku mau 2 di pick up boleh?" instead of just "Wisnu")
                has_quantity = entities.get("quantity") is not None
                has_delivery = entities.get("delivery_method") is not None

                if has_quantity or has_delivery:
                    # User provided order details, not their name
                    # Route to delivery method handler to process these entities
                    return await self._handle_delivery_method(entities, context, state)
                else:
                    # Treat any input as the name if we are waiting for it
                    return await self._handle_name_provided(user_message, context, state)

            # WANT_TO_ORDER: Customer wants to order but no product specified
            if sub_intent == "WANT_TO_ORDER":
                return {
                    "action": "ASK_PRODUCT",
                    "data": {},
                    "new_state": state,
                    "error": None
                }

            # NEW_ORDER: Customer wants to order a product
            elif sub_intent == "NEW_ORDER":
                return await self._handle_new_order(entities, context, state)

            # PROVIDE_DELIVERY_METHOD: Customer said "pickup" or "delivery"
            elif sub_intent == "PROVIDE_DELIVERY_METHOD":
                return await self._handle_delivery_method(entities, context, state)

            # PROVIDE_ADDRESS: Customer provided delivery address
            elif sub_intent == "PROVIDE_ADDRESS":
                return await self._handle_address(entities, context, state)

            # CONFIRM_ORDER: Customer confirmed order
            elif sub_intent == "CONFIRM_ORDER":
                return await self._handle_confirmation(entities, context, state)

            else:
                return {
                    "action": "SHOW_ERROR",
                    "data": {"message": "Maaf kak, aku nggak ngerti. Bisa jelasin lagi? 😊"},
                    "new_state": state,
                    "error": f"Unknown sub_intent: {sub_intent}"
                }

        except Exception as e:
            return {
                "action": "SHOW_ERROR",
                "data": {"message": "Eh kak, sepertinya ada kendala teknis nih. Bisa coba lagi ya? 🙏", "error": str(e)},
                "new_state": state,
                "error": str(e)
            }

    async def _handle_name_provided(
        self,
        user_message: str,
        context: Dict[str, Any],
        state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle name provided by user"""
        
        customer_name = user_message.strip()
        
        if len(customer_name) < 3:
            return {
                "action": "SHOW_ERROR",
                "data": {"message": "Nama terlalu pendek kak, minimal 3 huruf ya 😊"},
                "new_state": state,
                "error": "Name too short"
            }
            
        # Create customer
        customer = await self._create_customer(
            name=customer_name,
            phone=context["customer_phone"],
            tenant_id=context["tenant_id"]
        )
        
        if not customer:
             return {
                "action": "SHOW_ERROR",
                "data": {"message": "Maaf kak, gagal menyimpan data kamu. Bisa coba lagi? 🙏"},
                "new_state": state,
                "error": "Failed to create customer"
            }
            
        # Check if we already have delivery method from earlier
        product = state.get("product", {})
        quantity = state.get("quantity", 1)
        delivery_method = state.get("delivery_method")
        total_price = state.get("total_price", float(product.get("price", 0)) * quantity)

        if delivery_method:
            # We already have delivery method, proceed to confirmation
            if delivery_method == "pickup":
                new_state = {
                    **state,
                    "customer": customer,
                    "current_step": OrderState.AWAITING_CONFIRMATION.value
                }
                return {
                    "action": "ASK_CONFIRMATION",
                    "data": {
                        "customer_name": customer.get("customer_name", ""),
                        "product_name": product.get("name", ""),
                        "quantity": quantity,
                        "total_price": total_price,
                        "delivery_method": "pickup",
                        "address": None
                    },
                    "new_state": new_state,
                    "error": None
                }
            else:
                # Delivery - need address
                new_state = {
                    **state,
                    "customer": customer,
                    "current_step": OrderState.AWAITING_ADDRESS.value
                }
                return {
                    "action": "ASK_ADDRESS",
                    "data": {
                        "customer_name": customer.get("customer_name", ""),
                        "product_name": product.get("name", ""),
                        "quantity": quantity,
                        "total_price": total_price
                    },
                    "new_state": new_state,
                    "error": None
                }

        # No delivery method yet, ask for it
        new_state = {
            **state,
            "customer": customer,
            "current_step": OrderState.AWAITING_DELIVERY_METHOD.value
        }

        return {
            "action": "ASK_DELIVERY_METHOD",
            "data": {
                "customer_name": customer.get("customer_name", ""),
                "product_name": product.get("name", ""),
                "product_price": float(product.get("price", 0)),
                "quantity": quantity,
                "total_price": total_price
            },
            "new_state": new_state,
            "error": None
        }

    async def _handle_new_order(
        self,
        entities: Dict[str, Any],
        context: Dict[str, Any],
        state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle NEW_ORDER intent - fetch customer and product"""

        product_name = entities.get("product_name")
        quantity = entities.get("quantity", 1)

        if not product_name:
            return {
                "action": "SHOW_ERROR",
                "data": {"message": "Mau order produk apa ya kak? 😊"},
                "new_state": state,
                "error": "No product_name in entities"
            }

        # Step 1: Get customer info
        customer = await self._get_customer(context["customer_phone"], context["tenant_id"])

        # Step 2: Search for product
        product_result = await self._search_product(product_name, context["outlet_id"], context["tenant_id"])

        if not product_result.get("exact_match"):
            # Product not found - show suggestions
            return {
                "action": "SHOW_PRODUCT_NOT_FOUND",
                "data": {
                    "product_name": product_name,
                    "suggestions": product_result.get("suggestions", []),
                    "message": product_result.get("message", "")
                },
                "new_state": state,
                "error": None
            }

        product = product_result["product"]

        # Check if customer exists
        if not customer:
            # Customer not found, ask for name
            # Save delivery_method if provided in the same message
            delivery_method = entities.get("delivery_method")
            new_state = {
                **state,
                "product": product,
                "quantity": quantity,
                "product_name": product_name,
                "current_step": OrderState.AWAITING_NAME.value
            }
            # Only add delivery_method to state if it was provided
            if delivery_method:
                new_state["delivery_method"] = delivery_method

            return {
                "action": "ASK_NAME",
                "data": {},
                "new_state": new_state,
                "error": None
            }

        # Check if delivery method was provided in the same message
        delivery_method = entities.get("delivery_method")
        
        if delivery_method:
            # User provided delivery method in the same message (e.g., "mau 2 kimchi pick up")
            if delivery_method == "pickup":
                # Pickup: Go straight to confirmation
                new_state = {
                    **state,
                    "customer": customer,
                    "product": product,
                    "quantity": quantity,
                    "product_name": product_name,
                    "delivery_method": delivery_method,
                    "total_price": float(product["price"]) * quantity,
                    "current_step": OrderState.AWAITING_CONFIRMATION.value
                }
                
                return {
                    "action": "ASK_CONFIRMATION",
                    "data": {
                        "customer_name": customer.get("customer_name", ""),
                        "product_name": product["name"],
                        "product_price": float(product["price"]),
                        "quantity": quantity,
                        "total_price": float(product["price"]) * quantity,
                        "delivery_method": delivery_method,
                        "address": None
                    },
                    "new_state": new_state,
                    "error": None
                }
            else:
                # Delivery: Go to address
                new_state = {
                    **state,
                    "customer": customer,
                    "product": product,
                    "quantity": quantity,
                    "product_name": product_name,
                    "delivery_method": delivery_method,
                    "total_price": float(product["price"]) * quantity,
                    "current_step": OrderState.AWAITING_ADDRESS.value
                }
                
                return {
                    "action": "ASK_ADDRESS",
                    "data": {
                        "customer_name": customer.get("customer_name", ""),
                        "product_name": product["name"],
                        "quantity": quantity,
                        "total_price": float(product["price"]) * quantity
                    },
                    "new_state": new_state,
                    "error": None
                }
        
        # No delivery method provided, ask for it
        new_state = {
            **state,
            "customer": customer,
            "product": product,
            "quantity": quantity,
            "product_name": product_name,
            "total_price": float(product["price"]) * quantity,
            "current_step": OrderState.AWAITING_DELIVERY_METHOD.value
        }

        return {
            "action": "ASK_DELIVERY_METHOD",
            "data": {
                "customer_name": customer.get("customer_name", ""),
                "product_name": product["name"],
                "product_price": float(product["price"]),
                "quantity": quantity,
                "total_price": float(product["price"]) * quantity
            },
            "new_state": new_state,
            "error": None
        }

    async def _handle_delivery_method(
        self,
        entities: Dict[str, Any],
        context: Dict[str, Any],
        state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle PROVIDE_DELIVERY_METHOD intent"""

        delivery_method = entities.get("delivery_method")

        if not delivery_method:
            return {
                "action": "SHOW_ERROR",
                "data": {"message": "Mau pick up atau dikirim kak? 😊"},
                "new_state": state,
                "error": "No delivery_method in entities"
            }

        # Check if quantity was also provided (e.g., "mau 2 dong, di pick up")
        quantity = entities.get("quantity")
        updated_quantity = quantity if quantity is not None else state.get("quantity", 1)

        # Recalculate total_price if quantity changed
        product = state.get("product", {})
        product_price = float(product.get("price", 0))
        updated_total_price = product_price * updated_quantity

        # Check if we have customer info - if not, ask for name first
        customer = state.get("customer")
        if not customer:
            # Save delivery details but ask for name first
            new_state = {
                **state,
                "delivery_method": delivery_method,
                "quantity": updated_quantity,
                "total_price": updated_total_price,
                "current_step": OrderState.AWAITING_NAME.value
            }
            return {
                "action": "ASK_NAME",
                "data": {
                    "product_name": state.get("product_name", ""),
                    "quantity": updated_quantity,
                    "delivery_method": delivery_method
                },
                "new_state": new_state,
                "error": None
            }

        # Save delivery method and updated quantity to state
        new_state = {
            **state,
            "delivery_method": delivery_method,
            "quantity": updated_quantity,
            "total_price": updated_total_price,
            "current_step": OrderState.AWAITING_ADDRESS.value if delivery_method == "delivery" else OrderState.AWAITING_CONFIRMATION.value
        }

        # If pickup, go straight to confirmation
        if delivery_method == "pickup":
            return {
                "action": "ASK_CONFIRMATION",
                "data": {
                    "product_name": state.get("product_name", ""),
                    "quantity": updated_quantity,
                    "total_price": updated_total_price,
                    "delivery_method": "pickup",
                    "address": None
                },
                "new_state": new_state,
                "error": None
            }

        # If delivery, ask for address
        return {
            "action": "ASK_ADDRESS",
            "data": {},
            "new_state": new_state,
            "error": None
        }

    async def _handle_address(
        self,
        entities: Dict[str, Any],
        context: Dict[str, Any],
        state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle PROVIDE_ADDRESS intent"""

        address = entities.get("address")

        if not address or len(address) < 10:
            return {
                "action": "SHOW_ERROR",
                "data": {"message": "Bisa kasih alamat lengkapnya kak? Minimal 10 karakter ya 😊"},
                "new_state": state,
                "error": "Address too short"
            }

        # Save address and move to confirmation
        new_state = {
            **state,
            "address": address,
            "current_step": OrderState.AWAITING_CONFIRMATION.value
        }

        return {
            "action": "ASK_CONFIRMATION",
            "data": {
                "product_name": state.get("product_name", ""),
                "quantity": state.get("quantity", 1),
                "total_price": float(state.get("product", {}).get("price", 0)) * state.get("quantity", 1),
                "delivery_method": "delivery",
                "address": address
            },
            "new_state": new_state,
            "error": None
        }

    async def _handle_confirmation(
        self,
        entities: Dict[str, Any],
        context: Dict[str, Any],
        state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle CONFIRM_ORDER intent - create the order"""

        confirmation = entities.get("confirmation")

        if not confirmation:
            # Customer said no
            return {
                "action": "SHOW_ERROR",
                "data": {"message": "Oke kak, pesanan dibatalkan ya. Ada yang bisa aku bantu lagi? 😊"},
                "new_state": {"current_step": OrderState.INIT.value},
                "error": "Order cancelled by customer"
            }

        # Create the order via API
        product = state.get("product", {})
        customer = state.get("customer", {})

        order_data = {
            "customer_phone": context["customer_phone"],
            "customer_name": customer.get("customer_name", ""),
            "customer_address": state.get("address", ""),
            "items": [
                {
                    "product_id": product["id"],  # THIS IS THE ACTUAL UUID - NO COPYING ISSUES!
                    "quantity": state.get("quantity", 1)
                }
            ],
            "fulfillment_type": state.get("delivery_method", "pickup"),
            "notes": ""
        }

        # Add conversation_id if available
        if "conversation_id" in context:
            order_data["conversation_id"] = str(context["conversation_id"])

        # Call order service
        order = await self._create_order(order_data, context["tenant_id"])

        if not order:
            return {
                "action": "SHOW_ERROR",
                "data": {"message": "Eh kak, sepertinya ada kendala teknis nih saat mau buat pesanan. Bisa coba lagi ya? 🙏"},
                "new_state": state,
                "error": "Failed to create order"
            }

        # Success!
        new_state = {
            "current_step": OrderState.COMPLETED.value,
            "order": order
        }

        return {
            "action": "SHOW_ORDER_SUCCESS",
            "data": {
                "order_id": order.get("order_number"),  # Use clean order_number instead of UUID
                "product_name": state.get("product_name", ""),
                "quantity": state.get("quantity", 1),
                "total_price": float(state.get("product", {}).get("price", 0)) * state.get("quantity", 1),
                "delivery_method": state.get("delivery_method", "pickup")
            },
            "new_state": new_state,
            "error": None
        }

    # ========== API CALLS (Deterministic - No LLM) ==========

    async def _get_customer(self, phone: str, tenant_id: str) -> Optional[Dict]:
        """Get customer by phone"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.tenant_service_url}/api/v1/customers/by-phone/{phone}",
                    headers={"X-Tenant-Id": tenant_id},
                    timeout=5.0
                )
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                return response.json() if response.text else None
        except Exception as e:
            print(f"Error fetching customer: {e}")
            return None

    async def _search_product(self, product_name: str, outlet_id: str, tenant_id: str) -> Dict:
        """Search product by name"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.tenant_service_url}/api/v1/outlets/{outlet_id}/products/search",
                    params={"name": product_name},
                    headers={"X-Tenant-Id": tenant_id},
                    timeout=5.0
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"Error searching product: {e}")
            return {
                "exact_match": False,
                "product": None,
                "suggestions": [],
                "message": "Gagal mencari produk"
            }

    async def _create_order(self, order_data: Dict, tenant_id: str) -> Optional[Dict]:
        """Create order"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.order_service_url}/api/v1/orders",
                    headers={"X-Tenant-Id": tenant_id},
                    json=order_data,
                    timeout=10.0
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"Error creating order: {e}")
            return None

    async def _create_customer(self, name: str, phone: str, tenant_id: str) -> Optional[Dict]:
        """Create customer"""
        try:
            import os
            internal_api_key = os.getenv("INTERNAL_API_KEY", "dev-internal-key-12345")
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.tenant_service_url}/api/v1/customers",
                    headers={
                        "X-Tenant-Id": tenant_id,
                        "X-Internal-API-Key": internal_api_key
                    },
                    json={
                        "customer_name": name,
                        "customer_phone": phone,
                        "address": "PICKUP - No delivery address" # Default
                    },
                    timeout=5.0
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"Error creating customer: {e}")
            return None


# Singleton instance
order_orchestrator = OrderOrchestrator()
