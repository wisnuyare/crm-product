"""
Data models for Analytics Service
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from uuid import UUID


class MetricsRequest(BaseModel):
    """Request model for metrics query"""
    tenant_id: UUID
    outlet_id: Optional[UUID] = None
    start_date: date
    end_date: date
    granularity: str = "daily"  # daily, weekly, monthly

    class Config:
        json_schema_extra = {
            "example": {
                "tenant_id": "123e4567-e89b-12d3-a456-426614174000",
                "start_date": "2025-11-01",
                "end_date": "2025-11-30",
                "granularity": "daily"
            }
        }


class ConversationMetrics(BaseModel):
    """Conversation metrics for a time period"""
    date: date
    total_conversations: int
    active_conversations: int
    resolved_conversations: int
    handed_off_conversations: int
    average_duration_minutes: float
    resolution_rate: float


class MessageMetrics(BaseModel):
    """Message metrics for a time period"""
    date: date
    total_messages: int
    customer_messages: int
    llm_messages: int
    agent_messages: int
    average_response_time_seconds: float


class HandoffMetrics(BaseModel):
    """Handoff metrics for a time period"""
    date: date
    total_handoffs: int
    keyword_triggered: int
    confidence_triggered: int
    average_time_to_handoff_minutes: float
    handoff_rate: float


class CostMetrics(BaseModel):
    """Cost metrics for a time period"""
    date: date
    total_llm_calls: int
    total_tokens_used: int
    total_llm_cost: float
    total_whatsapp_cost: float
    total_cost: float
    cost_per_conversation: float


class DashboardMetrics(BaseModel):
    """Complete dashboard metrics"""
    tenant_id: UUID
    outlet_id: Optional[UUID]
    period_start: date
    period_end: date
    conversations: List[ConversationMetrics]
    messages: List[MessageMetrics]
    handoffs: List[HandoffMetrics]
    costs: List[CostMetrics]


class TenantSummary(BaseModel):
    """Summary metrics for a tenant"""
    tenant_id: UUID
    tenant_name: str
    period_start: date
    period_end: date
    total_conversations: int
    total_messages: int
    average_response_time_seconds: float
    resolution_rate: float
    handoff_rate: float
    total_cost: float


class ReportRequest(BaseModel):
    """Request model for report generation"""
    tenant_id: UUID
    report_type: str  # summary, detailed, cost_analysis
    start_date: date
    end_date: date
    format: str = "json"  # json, csv

    class Config:
        json_schema_extra = {
            "example": {
                "tenant_id": "123e4567-e89b-12d3-a456-426614174000",
                "report_type": "summary",
                "start_date": "2025-11-01",
                "end_date": "2025-11-30",
                "format": "json"
            }
        }


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    service: str
    version: str
    environment: str
    database: str
    bigquery: str
