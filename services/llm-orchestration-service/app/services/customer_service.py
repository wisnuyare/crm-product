"""
Customer Service - Handles customer information management
"""
import httpx
from typing import Dict, Any, Optional

from app.config import settings


class CustomerService:
    """Service for customer operations"""

    def __init__(self):
        # Default to tenant service URL from environment
        self.tenant_service_url = getattr(
            settings,
            'tenant_service_url',
            'http://tenant-service:3001'
        )
        self.internal_api_key = getattr(
            settings,
            'internal_api_key',
            'dev-internal-key-12345'
        )

    async def get_customer_info(
        self,
        tenant_id: str,
        customer_phone: str,
    ) -> Dict[str, Any]:
        """
        Get customer information by phone number

        Args:
            tenant_id: Tenant UUID
            customer_phone: Customer phone number

        Returns:
            Customer information or None if not found
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.tenant_service_url}/api/v1/customers/by-phone/{customer_phone}",
                    headers={
                        "X-Tenant-Id": tenant_id,
                        "X-Internal-Api-Key": self.internal_api_key
                    }
                )

                if response.status_code == 200:
                    customer = response.json()
                    return {
                        "success": True,
                        "found": True,
                        "customer": {
                            "phone": customer.get("customer_phone"),
                            "name": customer.get("customer_name"),
                            "email": customer.get("email"),
                            "address": customer.get("address"),
                        },
                        "message": f"Found customer: {customer.get('customer_name', 'Unknown')}"
                    }
                elif response.status_code == 404:
                    return {
                        "success": True,
                        "found": False,
                        "customer": None,
                        "message": "Customer not found - this is a new customer"
                    }
                else:
                    return {
                        "success": False,
                        "found": False,
                        "error": f"Failed to retrieve customer info: {response.status_code}"
                    }

        except httpx.HTTPError as e:
            return {
                "success": False,
                "found": False,
                "error": f"Failed to get customer info: {str(e)}"
            }

    async def save_customer_info(
        self,
        tenant_id: str,
        customer_phone: str,
        customer_name: Optional[str] = None,
        email: Optional[str] = None,
        address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Save or update customer information

        Args:
            tenant_id: Tenant UUID
            customer_phone: Customer phone number
            customer_name: Customer name
            email: Customer email
            address: Customer address

        Returns:
            Success or error message
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.tenant_service_url}/api/v1/customers",
                    json={
                        "customer_phone": customer_phone,
                        "customer_name": customer_name,
                        "email": email,
                        "address": address,
                    },
                    headers={
                        "X-Tenant-Id": tenant_id,
                        "X-Internal-Api-Key": self.internal_api_key
                    }
                )

                if response.status_code in [200, 201]:
                    customer = response.json()
                    return {
                        "success": True,
                        "customer": {
                            "phone": customer.get("customer_phone"),
                            "name": customer.get("customer_name"),
                            "email": customer.get("email"),
                            "address": customer.get("address"),
                        },
                        "message": f"Customer information saved for {customer.get('customer_name', customer_phone)}"
                    }
                else:
                    error_data = response.json()
                    return {
                        "success": False,
                        "error": error_data.get('error', 'Failed to save customer info')
                    }

        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"Failed to save customer info: {str(e)}"
            }


customer_service = CustomerService()
