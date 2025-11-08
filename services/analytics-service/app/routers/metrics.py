"""
Metrics Router - Analytics and metrics endpoints
"""
from fastapi import APIRouter, Header, HTTPException, Query
from uuid import UUID
from datetime import date, timedelta
from typing import Optional

from app.models import DashboardMetrics, TenantSummary
from app.services.metrics_service import metrics_service

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])


def get_tenant_id(x_tenant_id: str = Header(..., alias="X-Tenant-Id")) -> UUID:
    """Extract and validate tenant ID from header"""
    try:
        return UUID(x_tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant ID format")


@router.get("/dashboard", response_model=DashboardMetrics)
async def get_dashboard_metrics(
    tenant_id: UUID = Header(..., alias="X-Tenant-Id"),
    start_date: Optional[date] = Query(None, description="Start date (defaults to 30 days ago)"),
    end_date: Optional[date] = Query(None, description="End date (defaults to today)"),
    outlet_id: Optional[UUID] = Query(None, description="Filter by outlet")
):
    """
    Get dashboard metrics for a tenant

    Returns comprehensive metrics including:
    - Conversation metrics (total, active, resolved, handed off)
    - Message metrics (total, by sender type, response times)
    - Handoff metrics (triggers, rates)
    - Cost metrics (LLM, WhatsApp, totals)

    **Headers:**
    - X-Tenant-Id: Tenant UUID (required)

    **Query Parameters:**
    - start_date: Start date (optional, defaults to 30 days ago)
    - end_date: End date (optional, defaults to today)
    - outlet_id: Filter by specific outlet (optional)

    **Response:**
    - Complete dashboard metrics broken down by date
    """
    try:
        # Default date range: last 30 days
        if not end_date:
            end_date = date.today()
        if not start_date:
            start_date = end_date - timedelta(days=30)

        # Validate date range
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="start_date must be before end_date")

        tenant_uuid = UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id

        metrics = await metrics_service.get_dashboard_metrics(
            tenant_id=tenant_uuid,
            start_date=start_date,
            end_date=end_date,
            outlet_id=outlet_id
        )

        return metrics

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error fetching dashboard metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard metrics")


@router.get("/summary", response_model=TenantSummary)
async def get_tenant_summary(
    tenant_id: UUID = Header(..., alias="X-Tenant-Id"),
    start_date: Optional[date] = Query(None, description="Start date (defaults to 30 days ago)"),
    end_date: Optional[date] = Query(None, description="End date (defaults to today)")
):
    """
    Get summary metrics for a tenant

    Returns aggregated summary including:
    - Total conversations and messages
    - Average response time
    - Resolution rate
    - Handoff rate
    - Total cost

    **Headers:**
    - X-Tenant-Id: Tenant UUID (required)

    **Query Parameters:**
    - start_date: Start date (optional, defaults to 30 days ago)
    - end_date: End date (optional, defaults to today)

    **Response:**
    - Aggregated summary metrics for the period
    """
    try:
        # Default date range: last 30 days
        if not end_date:
            end_date = date.today()
        if not start_date:
            start_date = end_date - timedelta(days=30)

        # Validate date range
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="start_date must be before end_date")

        tenant_uuid = UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id

        summary = await metrics_service.get_tenant_summary(
            tenant_id=tenant_uuid,
            start_date=start_date,
            end_date=end_date
        )

        return summary

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error fetching tenant summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch tenant summary")
