"""
Prometheus Metrics for Multi-Agent LLM System

This module defines and exposes metrics for tracking:
- Intent classification
- Agent usage
- Security blocks
- Latency
- Token usage and costs
- Transaction creation
"""

from prometheus_client import Counter, Histogram, Gauge, Info
from typing import Optional

# ============================================================================
# INTENT CLASSIFICATION METRICS
# ============================================================================

intent_counter = Counter(
    'llm_intent_total',
    'Total number of intents classified',
    ['intent']  # product_inquiry, place_order, create_booking, general_question, REJECT
)

# ============================================================================
# AGENT USAGE METRICS
# ============================================================================

agent_usage_counter = Counter(
    'llm_agent_usage_total',
    'Total requests handled by each agent',
    ['agent']  # orchestrator, information, transaction
)

agent_latency_histogram = Histogram(
    'llm_agent_latency_seconds',
    'Agent processing latency in seconds',
    ['agent'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0]
)

# ============================================================================
# SECURITY METRICS
# ============================================================================

security_block_counter = Counter(
    'llm_security_blocks_total',
    'Total number of security blocks',
    ['reason']  # jailbreak, recipe_request, off_topic
)

# ============================================================================
# TOKEN USAGE & COST METRICS
# ============================================================================

token_usage_counter = Counter(
    'llm_tokens_used_total',
    'Total tokens used',
    ['agent', 'type']  # type: input, output
)

cost_counter = Counter(
    'llm_cost_usd_total',
    'Total cost in USD',
    ['agent']
)

# ============================================================================
# TRANSACTION METRICS
# ============================================================================

transaction_created_counter = Counter(
    'llm_transactions_created_total',
    'Total transactions created',
    ['type']  # order, booking
)

transaction_failed_counter = Counter(
    'llm_transactions_failed_total',
    'Total transactions that failed to create',
    ['type', 'reason']
)

# ============================================================================
# CONFIDENCE METRICS
# ============================================================================

confidence_gauge = Gauge(
    'llm_last_confidence_score',
    'Last intent classification confidence score',
    ['intent']
)

confidence_histogram = Histogram(
    'llm_confidence_score',
    'Distribution of confidence scores',
    ['intent'],
    buckets=[0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0]
)

# ============================================================================
# RE-ROUTING METRICS
# ============================================================================

reroute_counter = Counter(
    'llm_reroutes_total',
    'Total number of re-routing events',
    ['from_agent', 'to_agent']
)

# ============================================================================
# RAG METRICS
# ============================================================================

rag_context_counter = Counter(
    'llm_rag_contexts_retrieved_total',
    'Total RAG contexts retrieved'
)

rag_sources_gauge = Gauge(
    'llm_rag_sources_count',
    'Number of RAG sources used in last request'
)

# ============================================================================
# FUNCTION CALLING METRICS
# ============================================================================

function_call_counter = Counter(
    'llm_function_calls_total',
    'Total function calls executed',
    ['function_name', 'status']  # status: success, failed
)

function_latency_histogram = Histogram(
    'llm_function_call_latency_seconds',
    'Function call execution latency',
    ['function_name'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
)

# ============================================================================
# REQUEST METRICS
# ============================================================================

request_counter = Counter(
    'llm_requests_total',
    'Total requests to multi-agent system',
    ['tenant_id']
)

request_latency_histogram = Histogram(
    'llm_request_latency_seconds',
    'End-to-end request latency',
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]
)

# ============================================================================
# SYSTEM INFO
# ============================================================================

system_info = Info(
    'llm_system',
    'Multi-agent system information'
)

# Set system info on startup
system_info.info({
    'version': '1.0.0',
    'model': 'gpt-4o-mini',
    'agents': 'orchestrator,information,transaction'
})

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def track_intent(intent: str):
    """Track an intent classification"""
    intent_counter.labels(intent=intent).inc()


def track_agent_usage(agent: str, latency: float):
    """Track agent usage and latency"""
    agent_usage_counter.labels(agent=agent).inc()
    agent_latency_histogram.labels(agent=agent).observe(latency)


def track_security_block(reason: str):
    """Track a security block event"""
    security_block_counter.labels(reason=reason).inc()


def track_tokens(agent: str, input_tokens: int, output_tokens: int, cost: float):
    """Track token usage and cost"""
    token_usage_counter.labels(agent=agent, type='input').inc(input_tokens)
    token_usage_counter.labels(agent=agent, type='output').inc(output_tokens)
    cost_counter.labels(agent=agent).inc(cost)


def track_transaction(transaction_type: str, success: bool, reason: Optional[str] = None):
    """Track transaction creation"""
    if success:
        transaction_created_counter.labels(type=transaction_type).inc()
    else:
        transaction_failed_counter.labels(type=transaction_type, reason=reason or 'unknown').inc()


def track_confidence(intent: str, confidence: float):
    """Track confidence score"""
    confidence_gauge.labels(intent=intent).set(confidence)
    confidence_histogram.labels(intent=intent).observe(confidence)


def track_reroute(from_agent: str, to_agent: str):
    """Track re-routing event"""
    reroute_counter.labels(from_agent=from_agent, to_agent=to_agent).inc()


def track_rag(source_count: int):
    """Track RAG context usage"""
    rag_context_counter.inc()
    rag_sources_gauge.set(source_count)


def track_function_call(function_name: str, success: bool, latency: float):
    """Track function call"""
    status = 'success' if success else 'failed'
    function_call_counter.labels(function_name=function_name, status=status).inc()
    function_latency_histogram.labels(function_name=function_name).observe(latency)


def track_request(tenant_id: str, latency: float):
    """Track overall request"""
    request_counter.labels(tenant_id=tenant_id).inc()
    request_latency_histogram.observe(latency)


# ============================================================================
# METRICS EXPORT
# ============================================================================

__all__ = [
    # Metrics
    'intent_counter',
    'agent_usage_counter',
    'agent_latency_histogram',
    'security_block_counter',
    'token_usage_counter',
    'cost_counter',
    'transaction_created_counter',
    'transaction_failed_counter',
    'confidence_gauge',
    'confidence_histogram',
    'reroute_counter',
    'rag_context_counter',
    'rag_sources_gauge',
    'function_call_counter',
    'function_latency_histogram',
    'request_counter',
    'request_latency_histogram',
    'system_info',

    # Helper functions
    'track_intent',
    'track_agent_usage',
    'track_security_block',
    'track_tokens',
    'track_transaction',
    'track_confidence',
    'track_reroute',
    'track_rag',
    'track_function_call',
    'track_request',
]
