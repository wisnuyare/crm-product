"""
Booking Service - Handles booking-related function calls
"""
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, date
from uuid import UUID

from app.config import settings


class BookingService:
    """Service for booking operations"""

    def __init__(self):
        # Default to booking service URL from environment
        self.booking_service_url = getattr(
            settings,
            'booking_service_url',
            'http://booking-service:3008'
        )

    async def search_availability(
        self,
        tenant_id: str,
        resource_type: Optional[str] = None,
        date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Search for available resources

        Args:
            tenant_id: Tenant UUID
            resource_type: Type of resource (futsal, tennis, etc.)
            date: Booking date (YYYY-MM-DD format)

        Returns:
            Available resources and time slots
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Get all resources for tenant
                response = await client.get(
                    f"{self.booking_service_url}/api/v1/resources",
                    headers={"X-Tenant-Id": tenant_id}
                )
                response.raise_for_status()
                data = response.json()
                resources = data.get('resources', [])

                # Filter by type if specified
                if resource_type:
                    resources = [
                        r for r in resources
                        if resource_type.lower() in r.get('type', '').lower()
                    ]

                # Get bookings for the date if specified
                bookings = []
                if date:
                    bookings_response = await client.get(
                        f"{self.booking_service_url}/api/v1/bookings",
                        params={"date": date},
                        headers={"X-Tenant-Id": tenant_id}
                    )
                    if bookings_response.status_code == 200:
                        bookings_data = bookings_response.json()
                        bookings = bookings_data.get('bookings', [])

                return {
                    "success": True,
                    "resources": resources,
                    "bookings": bookings,
                    "date": date,
                    "message": f"Found {len(resources)} available resources"
                }

        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"Failed to search availability: {str(e)}",
                "resources": [],
                "bookings": []
            }

    async def create_booking(
        self,
        tenant_id: str,
        resource_id: str,
        customer_phone: str,
        customer_name: str,
        booking_date: str,
        start_time: str,
        end_time: str,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new booking

        Args:
            tenant_id: Tenant UUID
            resource_id: Resource UUID
            customer_phone: Customer phone number
            customer_name: Customer name
            booking_date: Booking date (YYYY-MM-DD)
            start_time: Start time (HH:MM)
            end_time: End time (HH:MM)
            notes: Optional notes

        Returns:
            Created booking or error
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Create booking
                response = await client.post(
                    f"{self.booking_service_url}/api/v1/bookings",
                    json={
                        "resource_id": resource_id,
                        "customer_phone": customer_phone,
                        "customer_name": customer_name,
                        "booking_date": booking_date,
                        "start_time": start_time,
                        "end_time": end_time,
                        "notes": notes,
                    },
                    headers={"X-Tenant-Id": tenant_id}
                )

                if response.status_code == 201:
                    data = response.json()
                    return {
                        "success": True,
                        "booking": data.get('booking'),
                        "message": data.get('message', 'Booking created successfully')
                    }
                elif response.status_code == 409:
                    # Conflict - time slot already booked
                    return {
                        "success": False,
                        "error": "Time slot already booked. Please choose another time.",
                        "booking": None
                    }
                else:
                    error_data = response.json()
                    return {
                        "success": False,
                        "error": error_data.get('error', 'Failed to create booking'),
                        "booking": None
                    }

        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"Failed to create booking: {str(e)}",
                "booking": None
            }

    async def get_resource_details(
        self,
        tenant_id: str,
        resource_id: str,
    ) -> Dict[str, Any]:
        """
        Get details of a specific resource

        Args:
            tenant_id: Tenant UUID
            resource_id: Resource UUID

        Returns:
            Resource details or error
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.booking_service_url}/api/v1/resources/{resource_id}",
                    headers={"X-Tenant-Id": tenant_id}
                )

                if response.status_code == 200:
                    resource = response.json()
                    return {
                        "success": True,
                        "resource": resource,
                    }
                elif response.status_code == 404:
                    return {
                        "success": False,
                        "error": "Resource not found",
                        "resource": None
                    }
                else:
                    return {
                        "success": False,
                        "error": "Failed to get resource details",
                        "resource": None
                    }

        except httpx.HTTPError as e:
            return {
                "success": False,
                "error": f"Failed to get resource: {str(e)}",
                "resource": None
            }


booking_service = BookingService()
