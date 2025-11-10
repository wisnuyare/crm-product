"""
Metrics Service - Calculates and aggregates metrics
"""
from typing import List, Optional
from datetime import date, datetime, timedelta
from uuid import UUID
import random

from app.models import (
    ConversationMetrics,
    MessageMetrics,
    HandoffMetrics,
    CostMetrics,
    DashboardMetrics,
    TenantSummary
)
from app.services.bigquery_service import bigquery_service


class MetricsService:
    """Service for calculating analytics metrics"""

    async def get_dashboard_metrics(
        self,
        tenant_id: UUID,
        start_date: date,
        end_date: date,
        outlet_id: Optional[UUID] = None
    ) -> DashboardMetrics:
        """
        Get complete dashboard metrics for a tenant

        Args:
            tenant_id: Tenant UUID
            start_date: Start date
            end_date: End date
            outlet_id: Optional outlet filter

        Returns:
            Complete dashboard metrics
        """
        # Fetch metrics from BigQuery (or mock data)
        conversation_data = bigquery_service.query_conversation_metrics(
            tenant_id, start_date, end_date, outlet_id
        )
        message_data = bigquery_service.query_message_metrics(
            tenant_id, start_date, end_date, outlet_id
        )

        # Generate handoff and cost metrics
        handoff_data = self._generate_handoff_metrics(start_date, end_date)
        cost_data = self._generate_cost_metrics(start_date, end_date)

        # Convert to Pydantic models
        conversations = [ConversationMetrics(**item) for item in conversation_data]
        messages = [MessageMetrics(**item) for item in message_data]
        handoffs = handoff_data
        costs = cost_data

        return DashboardMetrics(
            tenant_id=tenant_id,
            outlet_id=outlet_id,
            period_start=start_date,
            period_end=end_date,
            conversations=conversations,
            messages=messages,
            handoffs=handoffs,
            costs=costs
        )

    async def get_tenant_summary(
        self,
        tenant_id: UUID,
        start_date: date,
        end_date: date
    ) -> TenantSummary:
        """
        Get summary metrics for a tenant

        Args:
            tenant_id: Tenant UUID
            start_date: Start date
            end_date: End date

        Returns:
            Tenant summary metrics
        """
        # Fetch conversation and message data
        conversation_data = bigquery_service.query_conversation_metrics(
            tenant_id, start_date, end_date
        )
        message_data = bigquery_service.query_message_metrics(
            tenant_id, start_date, end_date
        )

        # Aggregate metrics
        total_conversations = sum(item["total_conversations"] for item in conversation_data)
        total_resolved = sum(item["resolved_conversations"] for item in conversation_data)
        total_handed_off = sum(item["handed_off_conversations"] for item in conversation_data)
        total_messages = sum(item["total_messages"] for item in message_data)

        # Calculate averages
        avg_response_time = (
            sum(item["avg_response_time_seconds"] for item in message_data) / len(message_data)
            if message_data else 0
        )
        resolution_rate = total_resolved / total_conversations if total_conversations > 0 else 0
        handoff_rate = total_handed_off / total_conversations if total_conversations > 0 else 0

        # Calculate total cost (mock)
        total_cost = total_messages * 0.0002  # Approximate cost per message

        return summary

    async def get_platform_summary(
        self,
        start_date: date,
        end_date: date
    ) -> "PlatformSummary":
        """
        Get summary metrics for the entire platform.

        Args:
            start_date: Start date for the summary.
            end_date: End date for the summary.

        Returns:
            A summary of platform-wide metrics.
        """
        # In a real scenario, you'd query an aggregated table or run a query across all tenants.
        # Here, we'll use the new mock platform data generation.
        conversation_data = bigquery_service.query_platform_conversation_metrics(start_date, end_date)
        message_data = bigquery_service.query_platform_message_metrics(start_date, end_date)

        # Aggregate the mock data
        total_conversations = sum(item["total_conversations"] for item in conversation_data)
        total_resolved = sum(item["resolved_conversations"] for item in conversation_data)
        total_handed_off = sum(item["handed_off_conversations"] for item in conversation_data)
        total_messages = sum(item["total_messages"] for item in message_data)

        # Calculate platform-wide averages
        avg_response_time = (
            sum(item["avg_response_time_seconds"] for item in message_data) / len(message_data)
            if message_data else 0
        )
        resolution_rate = total_resolved / total_conversations if total_conversations > 0 else 0
        handoff_rate = total_handed_off / total_conversations if total_conversations > 0 else 0

        # Mock total cost and active tenants
        total_cost = total_messages * 0.0002  # Approximate cost per message
        active_tenants = random.randint(5, 15)

        from app.models import PlatformSummary
        return PlatformSummary(
            period_start=start_date,
            period_end=end_date,
            total_active_tenants=active_tenants,
            total_conversations=total_conversations,
            total_messages=total_messages,
            platform_average_response_time_seconds=avg_response_time,
            platform_resolution_rate=resolution_rate,
            platform_handoff_rate=handoff_rate,
            total_platform_cost=total_cost
        )

    def _generate_handoff_metrics(
        self,
        start_date: date,
        end_date: date
    ) -> List[HandoffMetrics]:
        """Generate handoff metrics (mock data for now)"""
        metrics = []
        current_date = start_date

        while current_date <= end_date:
            total_handoffs = random.randint(1, 10)
            keyword = int(total_handoffs * 0.7)
            confidence = total_handoffs - keyword

            metrics.append(HandoffMetrics(
                date=current_date,
                total_handoffs=total_handoffs,
                keyword_triggered=keyword,
                confidence_triggered=confidence,
                average_time_to_handoff_minutes=random.uniform(5, 15),
                handoff_rate=random.uniform(0.05, 0.15)
            ))

            current_date += timedelta(days=1)

        return metrics

    def _generate_cost_metrics(
        self,
        start_date: date,
        end_date: date
    ) -> List[CostMetrics]:
        """Generate cost metrics (mock data for now)"""
        metrics = []
        current_date = start_date

        while current_date <= end_date:
            llm_calls = random.randint(100, 500)
            tokens = llm_calls * random.randint(300, 800)
            llm_cost = tokens * 0.00000015  # GPT-4o-mini pricing
            whatsapp_cost = llm_calls * 0.01  # WhatsApp message cost
            total = llm_cost + whatsapp_cost

            metrics.append(CostMetrics(
                date=current_date,
                total_llm_calls=llm_calls,
                total_tokens_used=tokens,
                total_llm_cost=llm_cost,
                total_whatsapp_cost=whatsapp_cost,
                total_cost=total,
                cost_per_conversation=total / (llm_calls / 3) if llm_calls > 0 else 0
            ))

            current_date += timedelta(days=1)

        return metrics


metrics_service = MetricsService()
