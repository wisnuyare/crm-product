"""
BigQuery Service - Handles BigQuery queries for analytics
"""
import os
from typing import List, Dict, Any, Optional
from datetime import date
from uuid import UUID

from app.config import settings


class BigQueryService:
    """Service for BigQuery analytics queries"""

    def __init__(self):
        self.project_id = settings.bigquery_project_id
        self.dataset = settings.bigquery_dataset
        self.client = None

        # Initialize BigQuery client if credentials available
        if settings.google_application_credentials and os.path.exists(settings.google_application_credentials):
            try:
                from google.cloud import bigquery
                self.client = bigquery.Client(project=self.project_id)
            except Exception as e:
                print(f"Warning: Failed to initialize BigQuery client: {e}")

    def query_conversation_metrics(
        self,
        tenant_id: UUID,
        start_date: date,
        end_date: date,
        outlet_id: Optional[UUID] = None
    ) -> List[Dict[str, Any]]:
        """
        Query conversation metrics from BigQuery

        Args:
            tenant_id: Tenant UUID
            start_date: Start date for metrics
            end_date: End date for metrics
            outlet_id: Optional outlet filter

        Returns:
            List of daily conversation metrics
        """
        if not self.client:
            # Return mock data if BigQuery not configured
            return self._mock_conversation_metrics(start_date, end_date)

        query = f"""
        SELECT
            DATE(started_at) as date,
            COUNT(*) as total_conversations,
            COUNTIF(status = 'active') as active_conversations,
            COUNTIF(status = 'resolved') as resolved_conversations,
            COUNTIF(status = 'handed_off') as handed_off_conversations,
            AVG(TIMESTAMP_DIFF(ended_at, started_at, MINUTE)) as avg_duration_minutes,
            SAFE_DIVIDE(
                COUNTIF(status = 'resolved'),
                COUNT(*)
            ) as resolution_rate
        FROM `{self.project_id}.{self.dataset}.conversations`
        WHERE tenant_id = @tenant_id
            AND DATE(started_at) BETWEEN @start_date AND @end_date
            {f"AND outlet_id = @outlet_id" if outlet_id else ""}
        GROUP BY date
        ORDER BY date
        """

        job_config = self._build_query_config({
            "tenant_id": str(tenant_id),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            **({"outlet_id": str(outlet_id)} if outlet_id else {})
        })

        try:
            query_job = self.client.query(query, job_config=job_config)
            results = query_job.result()
            return [dict(row) for row in results]
        except Exception as e:
            print(f"BigQuery error: {e}")
            return self._mock_conversation_metrics(start_date, end_date)

    def query_message_metrics(
        self,
        tenant_id: UUID,
        start_date: date,
        end_date: date,
        outlet_id: Optional[UUID] = None
    ) -> List[Dict[str, Any]]:
        """Query message metrics from BigQuery"""
        if not self.client:
            return self._mock_message_metrics(start_date, end_date)

        query = f"""
        SELECT
            DATE(m.timestamp) as date,
            COUNT(*) as total_messages,
            COUNTIF(m.sender_type = 'customer') as customer_messages,
            COUNTIF(m.sender_type = 'llm') as llm_messages,
            COUNTIF(m.sender_type = 'agent') as agent_messages,
            AVG(
                TIMESTAMP_DIFF(
                    m.timestamp,
                    LAG(m.timestamp) OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp),
                    SECOND
                )
            ) as avg_response_time_seconds
        FROM `{self.project_id}.{self.dataset}.messages` m
        JOIN `{self.project_id}.{self.dataset}.conversations` c
            ON m.conversation_id = c.id
        WHERE c.tenant_id = @tenant_id
            AND DATE(m.timestamp) BETWEEN @start_date AND @end_date
            {f"AND c.outlet_id = @outlet_id" if outlet_id else ""}
        GROUP BY date
        ORDER BY date
        """

        job_config = self._build_query_config({
            "tenant_id": str(tenant_id),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            **({"outlet_id": str(outlet_id)} if outlet_id else {})
        })

        try:
            query_job = self.client.query(query, job_config=job_config)
            results = query_job.result()
            return [dict(row) for row in results]
        except Exception as e:
            print(f"BigQuery error: {e}")
            return self._mock_message_metrics(start_date, end_date)

    def query_platform_conversation_metrics(
        self,
        start_date: date,
        end_date: date,
    ) -> List[Dict[str, Any]]:
        """Query platform-wide conversation metrics"""
        if not self.client:
            return self._mock_platform_conversation_metrics(start_date, end_date)
        # TODO: Implement real BigQuery query for platform metrics
        return self._mock_platform_conversation_metrics(start_date, end_date)

    def query_platform_message_metrics(
        self,
        start_date: date,
        end_date: date,
    ) -> List[Dict[str, Any]]:
        """Query platform-wide message metrics"""
        if not self.client:
            return self._mock_platform_message_metrics(start_date, end_date)
        # TODO: Implement real BigQuery query for platform metrics
        return self._mock_platform_message_metrics(start_date, end_date)

    def _build_query_config(self, params: Dict[str, Any]):
        """Build BigQuery job config with parameters"""
        from google.cloud import bigquery

        job_config = bigquery.QueryJobConfig()
        query_parameters = []

        for key, value in params.items():
            query_parameters.append(
                bigquery.ScalarQueryParameter(key, "STRING", value)
            )

        job_config.query_parameters = query_parameters
        return job_config

    def _mock_platform_conversation_metrics(self, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """Generate mock conversation metrics for the entire platform"""
        from datetime import timedelta
        import random

        metrics = []
        current_date = start_date
        
        while current_date <= end_date:
            # Simulate metrics for 5-10 tenants
            num_tenants = random.randint(5, 10)
            total_conv = sum([random.randint(10, 50) for _ in range(num_tenants)])
            resolved = int(total_conv * random.uniform(0.6, 0.9))
            handed_off = int(total_conv * random.uniform(0.05, 0.15))

            metrics.append({
                "date": current_date,
                "total_conversations": total_conv,
                "active_conversations": total_conv - resolved - handed_off,
                "resolved_conversations": resolved,
                "handed_off_conversations": handed_off,
                "avg_duration_minutes": random.uniform(5, 20),
                "resolution_rate": resolved / total_conv if total_conv > 0 else 0
            })
            current_date += timedelta(days=1)
        return metrics

    def _mock_platform_message_metrics(self, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """Generate mock message metrics for the entire platform"""
        from datetime import timedelta
        import random

        metrics = []
        current_date = start_date

        while current_date <= end_date:
            num_tenants = random.randint(5, 10)
            total_msg = sum([random.randint(100, 500) for _ in range(num_tenants)])
            customer = int(total_msg * 0.4)
            llm = int(total_msg * 0.45)
            agent = total_msg - customer - llm

            metrics.append({
                "date": current_date,
                "total_messages": total_msg,
                "customer_messages": customer,
                "llm_messages": llm,
                "agent_messages": agent,
                "avg_response_time_seconds": random.uniform(10, 60)
            })
            current_date += timedelta(days=1)
        return metrics

    def _mock_conversation_metrics(self, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """Generate mock conversation metrics for development"""
        from datetime import timedelta
        import random

        metrics = []
        current_date = start_date

        while current_date <= end_date:
            total = random.randint(10, 50)
            resolved = int(total * random.uniform(0.6, 0.9))
            handed_off = int(total * random.uniform(0.05, 0.15))

            metrics.append({
                "date": current_date,
                "total_conversations": total,
                "active_conversations": total - resolved - handed_off,
                "resolved_conversations": resolved,
                "handed_off_conversations": handed_off,
                "avg_duration_minutes": random.uniform(5, 20),
                "resolution_rate": resolved / total if total > 0 else 0
            })

            current_date += timedelta(days=1)

        return metrics

    def _mock_message_metrics(self, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """Generate mock message metrics for development"""
        from datetime import timedelta
        import random

        metrics = []
        current_date = start_date

        while current_date <= end_date:
            total = random.randint(100, 500)
            customer = int(total * 0.4)
            llm = int(total * 0.45)
            agent = total - customer - llm

            metrics.append({
                "date": current_date,
                "total_messages": total,
                "customer_messages": customer,
                "llm_messages": llm,
                "agent_messages": agent,
                "avg_response_time_seconds": random.uniform(10, 60)
            })

            current_date += timedelta(days=1)

        return metrics


bigquery_service = BigQueryService()
