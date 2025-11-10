"""
Order Service - Handles order-related function calls
"""
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, date
from uuid import UUID

from app.config import settings


class OrderService:
    """Service for order operations"""

    def __init__(self):
        # Default to order service URL from environment
        self.order_service_url = getattr(
            settings,
            'order_service_url',
            'http://order-service:3009'
        )

    async def check_product_availability(
        self,
        tenant_id: str,
        product_names: List[str],
    ) -> Dict[str, Any]:
        """
        Check if products are available in stock and get pricing

        Args:
            tenant_id: Tenant UUID
            product_names: List of product names to search for

        Returns:
            Available products with stock and pricing info
        """
        try:
            products_found = []

            async with httpx.AsyncClient(timeout=10.0) as client:
                for product_name in product_names:
                    # Search for product by name
                    response = await client.get(
                        f"{self.order_service_url}/api/v1/products",
                        params={"search": product_name, "status": "active"},
                        headers={"X-Tenant-Id": tenant_id}
                    )

                    if response.status_code == 200:
                        data = response.json()
                        products = data.get('products', [])

                        # Find best match (first result is usually closest)
                        if products:
                            product = products[0]
                            products_found.append({
                                "id": product["id"],
                                "name": product["name"],
                                "price": product["price"],
                                "stock_quantity": product["stock_quantity"],
                                "available": product["stock_quantity"] > 0,
                                "category": product.get("category"),
                            })
                        else:
                            products_found.append({
                                "id": None,
                                "name": product_name,
                                "price": None,
                                "stock_quantity": 0,
                                "available": False,
                                "error": f"Product '{product_name}' not found in catalog"
                            })

            return {
                "success": True,
                "products": products_found,
                "message": f"Found {len([p for p in products_found if p['available']])} available products"
            }

        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"Failed to check product availability: {str(e)}",
                "products": []
            }

    async def create_order(
        self,
        tenant_id: str,
        customer_phone: str,
        customer_name: str,
        items: List[Dict[str, Any]],
        conversation_id: Optional[str] = None,
        pickup_date: Optional[str] = None,
        fulfillment_type: str = "pickup",
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new order for the customer

        Args:
            tenant_id: Tenant UUID
            customer_phone: Customer phone number
            customer_name: Customer name
            items: List of order items [{"product_id": "...", "quantity": 2, "notes": "..."}]
            conversation_id: Optional conversation ID
            pickup_date: Pickup/delivery date (YYYY-MM-DD)
            fulfillment_type: "pickup" or "delivery"
            notes: Optional order notes

        Returns:
            Created order or error
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Create order
                response = await client.post(
                    f"{self.order_service_url}/api/v1/orders",
                    json={
                        "customer_phone": customer_phone,
                        "customer_name": customer_name,
                        "items": items,
                        "conversation_id": conversation_id,
                        "pickup_delivery_date": pickup_date,
                        "fulfillment_type": fulfillment_type,
                        "notes": notes,
                    },
                    headers={"X-Tenant-Id": tenant_id}
                )

                if response.status_code == 201:
                    order = response.json()
                    return {
                        "success": True,
                        "order_id": order.get('id'),
                        "order_number": order.get('order_number'),
                        "total": order.get('total'),
                        "items_summary": [
                            f"{item['quantity']}x {item['product_name']}"
                            for item in order.get('items', [])
                        ],
                        "message": f"Order {order.get('order_number')} created successfully"
                    }
                elif response.status_code == 404:
                    error_data = response.json()
                    return {
                        "success": False,
                        "error": error_data.get('error', 'Product not found'),
                        "order_id": None
                    }
                elif response.status_code == 400:
                    # Bad request - usually insufficient stock
                    error_data = response.json()
                    return {
                        "success": False,
                        "error": error_data.get('error', 'Failed to create order'),
                        "order_id": None
                    }
                else:
                    error_data = response.json()
                    return {
                        "success": False,
                        "error": error_data.get('error', 'Failed to create order'),
                        "order_id": None
                    }

        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"Failed to create order: {str(e)}",
                "order_id": None
            }

    async def get_product_details(
        self,
        tenant_id: str,
        product_id: str,
    ) -> Dict[str, Any]:
        """
        Get details of a specific product

        Args:
            tenant_id: Tenant UUID
            product_id: Product UUID

        Returns:
            Product details or error
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.order_service_url}/api/v1/products/{product_id}",
                    headers={"X-Tenant-Id": tenant_id}
                )

                if response.status_code == 200:
                    product = response.json()
                    return {
                        "success": True,
                        "product": product,
                    }
                elif response.status_code == 404:
                    return {
                        "success": False,
                        "error": "Product not found",
                        "product": None
                    }
                else:
                    return {
                        "success": False,
                        "error": "Failed to get product details",
                        "product": None
                    }

        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"Failed to get product: {str(e)}",
                "product": None
            }

    async def list_products(
        self,
        tenant_id: str,
        category: Optional[str] = None,
        status: str = "active",
    ) -> Dict[str, Any]:
        """
        List all products for a tenant

        Args:
            tenant_id: Tenant UUID
            category: Optional category filter
            status: Product status (active, inactive)

        Returns:
            List of products or error
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                params = {"status": status, "limit": 50}
                if category:
                    params["category"] = category

                response = await client.get(
                    f"{self.order_service_url}/api/v1/products",
                    params=params,
                    headers={"X-Tenant-Id": tenant_id}
                )

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "success": True,
                        "products": data.get('products', []),
                        "total": data.get('total', 0),
                    }
                else:
                    return {
                        "success": False,
                        "error": "Failed to list products",
                        "products": []
                    }

        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"Failed to list products: {str(e)}",
                "products": []
            }


order_service = OrderService()
