"""
Test Transaction Agent

Tests for order placement, booking creation, and customer management workflows.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List, Dict, Any
import json

from app.agents.transaction_agent import TransactionAgent, transaction_agent
from app.models import Message


@pytest.fixture
def agent():
    """Fixture for Transaction Agent instance"""
    return transaction_agent


@pytest.fixture
def basic_context():
    """Basic context for testing"""
    return {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "conversation_id": "test-conversation-123",
        "outlet_id": "outlet-123",
        "customer_phone": "+6281234567890",
        "transaction_type": "order",
        "conversation_history": [],
        "workflow_state": {}
    }


@pytest.fixture
def mock_customer():
    """Mock customer data"""
    return {
        "id": "customer-123",
        "name": "John Doe",
        "phone": "+6281234567890",
        "address": "Jl. Sudirman No. 123, Jakarta",
        "created_at": "2025-01-01T10:00:00Z"
    }


@pytest.fixture
def mock_product():
    """Mock product data"""
    return {
        "id": "product-123",
        "name": "Kimchi Sawi",
        "price": 25000.0,
        "stock": 100
    }


@pytest.fixture
def mock_order():
    """Mock order response"""
    return {
        "id": "order-123",
        "order_number": "ORD-2025-0001",
        "customer_id": "customer-123",
        "outlet_id": "outlet-123",
        "items": [
            {
                "product_id": "product-123",
                "quantity": 2,
                "price": 25000.0
            }
        ],
        "total_amount": 50000.0,
        "delivery_address": "Jl. Sudirman No. 123, Jakarta",
        "status": "pending",
        "created_at": "2025-01-01T10:00:00Z"
    }


# ============================================================================
# TEST: Function Tools Definition
# ============================================================================

class TestFunctionTools:
    """Test function tools definition"""

    def test_build_function_tools(self, agent):
        """Test function tools are properly defined"""
        tools = agent._build_function_tools()

        assert len(tools) == 6, "Should have 6 function tools"

        # Verify all functions exist
        function_names = [tool["function"]["name"] for tool in tools]
        expected_functions = [
            "get_customer_by_phone",
            "create_customer",
            "get_product_by_name",
            "create_order",
            "create_booking",
            "update_customer"
        ]

        for func_name in expected_functions:
            assert func_name in function_names, f"{func_name} should be in function tools"

    def test_get_customer_function_schema(self, agent):
        """Test get_customer_by_phone function schema"""
        tools = agent._build_function_tools()
        get_customer = next(t for t in tools if t["function"]["name"] == "get_customer_by_phone")

        schema = get_customer["function"]
        assert "phone" in schema["parameters"]["properties"]
        assert "phone" in schema["parameters"]["required"]

    def test_create_order_function_schema(self, agent):
        """Test create_order function schema"""
        tools = agent._build_function_tools()
        create_order = next(t for t in tools if t["function"]["name"] == "create_order")

        schema = create_order["function"]
        required_params = schema["parameters"]["required"]

        assert "customer_id" in required_params
        assert "outlet_id" in required_params
        assert "items" in required_params
        assert "total_amount" in required_params
        assert "delivery_address" in required_params


# ============================================================================
# TEST: Function Execution
# ============================================================================

class TestFunctionExecution:
    """Test function execution"""

    @pytest.mark.asyncio
    async def test_execute_get_customer_found(self, agent, basic_context, mock_customer):
        """Test get_customer_by_phone when customer exists"""
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = mock_customer
            mock_response.raise_for_status = MagicMock()

            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

            result = await agent._execute_function(
                function_name="get_customer_by_phone",
                arguments={"phone": "+6281234567890"},
                context=basic_context
            )

            assert result["customer"]["id"] == "customer-123"
            assert result["customer"]["name"] == "John Doe"

    @pytest.mark.asyncio
    async def test_execute_get_customer_not_found(self, agent, basic_context):
        """Test get_customer_by_phone when customer doesn't exist"""
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 404

            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

            result = await agent._execute_function(
                function_name="get_customer_by_phone",
                arguments={"phone": "+6281234567890"},
                context=basic_context
            )

            assert result["customer"] is None

    @pytest.mark.asyncio
    async def test_execute_create_customer(self, agent, basic_context, mock_customer):
        """Test create_customer function execution"""
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 201
            mock_response.json.return_value = mock_customer
            mock_response.raise_for_status = MagicMock()

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

            result = await agent._execute_function(
                function_name="create_customer",
                arguments={
                    "name": "John Doe",
                    "phone": "+6281234567890",
                    "address": "Jl. Sudirman No. 123, Jakarta"
                },
                context=basic_context
            )

            assert result["id"] == "customer-123"
            assert result["name"] == "John Doe"

    @pytest.mark.asyncio
    async def test_execute_get_product(self, agent, basic_context, mock_product):
        """Test get_product_by_name function execution"""
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = [mock_product]
            mock_response.raise_for_status = MagicMock()

            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

            result = await agent._execute_function(
                function_name="get_product_by_name",
                arguments={
                    "outlet_id": "outlet-123",
                    "product_name": "Kimchi Sawi"
                },
                context=basic_context
            )

            assert result["product"]["id"] == "product-123"
            assert result["product"]["name"] == "Kimchi Sawi"

    @pytest.mark.asyncio
    async def test_execute_create_order(self, agent, basic_context, mock_order):
        """Test create_order function execution"""
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 201
            mock_response.json.return_value = mock_order
            mock_response.raise_for_status = MagicMock()

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)

            result = await agent._execute_function(
                function_name="create_order",
                arguments={
                    "customer_id": "customer-123",
                    "outlet_id": "outlet-123",
                    "items": [
                        {"product_id": "product-123", "quantity": 2, "price": 25000.0}
                    ],
                    "total_amount": 50000.0,
                    "delivery_address": "Jl. Sudirman No. 123, Jakarta",
                    "notes": "Extra spicy"
                },
                context=basic_context
            )

            assert result["id"] == "order-123"
            assert result["order_number"] == "ORD-2025-0001"

    @pytest.mark.asyncio
    async def test_execute_function_http_error(self, agent, basic_context):
        """Test function execution handles HTTP errors"""
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 500
            mock_response.text = "Internal Server Error"
            mock_response.raise_for_status.side_effect = Exception("HTTP error")

            mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

            result = await agent._execute_function(
                function_name="get_customer_by_phone",
                arguments={"phone": "+6281234567890"},
                context=basic_context
            )

            assert "error" in result


# ============================================================================
# TEST: Workflow State Extraction
# ============================================================================

class TestWorkflowState:
    """Test workflow state extraction"""

    def test_extract_workflow_state_customer_exists(self, agent):
        """Test workflow state when customer exists"""
        function_calls = [
            {
                "function": "get_customer_by_phone",
                "arguments": {"phone": "+6281234567890"},
                "result": {"customer": {"id": "customer-123", "name": "John Doe"}}
            }
        ]

        state = agent._extract_workflow_state(function_calls)

        assert state["customer_id"] == "customer-123"
        assert state["customer_exists"] is True
        assert state["order_created"] is False

    def test_extract_workflow_state_customer_created(self, agent):
        """Test workflow state when customer is created"""
        function_calls = [
            {
                "function": "get_customer_by_phone",
                "arguments": {"phone": "+6281234567890"},
                "result": {"customer": None}
            },
            {
                "function": "create_customer",
                "arguments": {"name": "Jane Doe", "phone": "+6281234567890", "address": "Jakarta"},
                "result": {"id": "customer-456", "name": "Jane Doe"}
            }
        ]

        state = agent._extract_workflow_state(function_calls)

        assert state["customer_id"] == "customer-456"
        assert state["customer_exists"] is True

    def test_extract_workflow_state_order_created(self, agent):
        """Test workflow state when order is created"""
        function_calls = [
            {
                "function": "create_order",
                "arguments": {},
                "result": {"id": "order-123"}
            }
        ]

        state = agent._extract_workflow_state(function_calls)

        assert state["order_created"] is True

    def test_extract_workflow_state_booking_created(self, agent):
        """Test workflow state when booking is created"""
        function_calls = [
            {
                "function": "create_booking",
                "arguments": {},
                "result": {"id": "booking-123"}
            }
        ]

        state = agent._extract_workflow_state(function_calls)

        assert state["booking_created"] is True


# ============================================================================
# TEST: Full Process Flow
# ============================================================================

class TestTransactionProcess:
    """Test end-to-end transaction processing"""

    @pytest.mark.asyncio
    async def test_process_without_function_calls(self, agent, basic_context):
        """Test processing when LLM doesn't call functions (asking for info)"""
        mock_llm_response = MagicMock()
        mock_llm_response.choices = [
            MagicMock(
                message=MagicMock(
                    content="Baik, saya akan bantu proses pesanan Anda. Siapa nama lengkap Anda?",
                    tool_calls=None
                )
            )
        ]

        with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = mock_llm_response

            result = await agent.process(
                user_message="mau pesan 2 kimchi",
                context=basic_context
            )

            assert "response" in result
            assert "nama lengkap" in result["response"].lower()
            assert result["transaction_created"] is False
            assert result["function_calls"] == []

    @pytest.mark.asyncio
    async def test_process_with_function_calls(self, agent, basic_context, mock_customer):
        """Test processing with function calls"""
        # Mock LLM initial response with tool calls
        mock_function = MagicMock()
        mock_function.name = "get_customer_by_phone"
        mock_function.arguments = json.dumps({"phone": "+6281234567890"})

        mock_tool_call = MagicMock()
        mock_tool_call.id = "call_123"
        mock_tool_call.type = "function"
        mock_tool_call.function = mock_function

        mock_initial_response = MagicMock()
        mock_initial_response.choices = [
            MagicMock(
                message=MagicMock(
                    content="",
                    tool_calls=[mock_tool_call]
                )
            )
        ]

        # Mock LLM final response after function execution
        mock_final_response = MagicMock()
        mock_final_response.choices = [
            MagicMock(
                message=MagicMock(
                    content="Selamat datang kembali, John Doe! Mau pesan apa hari ini?"
                )
            )
        ]

        with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.side_effect = [mock_initial_response, mock_final_response]

            with patch.object(agent, '_execute_function', new_callable=AsyncMock) as mock_exec:
                mock_exec.return_value = {"customer": mock_customer}

                result = await agent.process(
                    user_message="mau pesan 2 kimchi",
                    context=basic_context
                )

                assert "response" in result
                assert "John Doe" in result["response"]
                assert len(result["function_calls"]) == 1
                assert result["function_calls"][0]["function"] == "get_customer_by_phone"

    @pytest.mark.asyncio
    async def test_process_create_order(self, agent, basic_context, mock_customer, mock_order):
        """Test full order creation process"""
        # Mock tool calls for order creation
        mock_func_1 = MagicMock()
        mock_func_1.name = "get_customer_by_phone"
        mock_func_1.arguments = json.dumps({"phone": "+6281234567890"})

        mock_func_2 = MagicMock()
        mock_func_2.name = "create_order"
        mock_func_2.arguments = json.dumps({
            "customer_id": "customer-123",
            "outlet_id": "outlet-123",
            "items": [{"product_id": "product-123", "quantity": 2, "price": 25000.0}],
            "total_amount": 50000.0,
            "delivery_address": "Jl. Sudirman No. 123, Jakarta",
            "notes": ""
        })

        tool_calls = [
            MagicMock(
                id="call_1",
                type="function",
                function=mock_func_1
            ),
            MagicMock(
                id="call_2",
                type="function",
                function=mock_func_2
            )
        ]

        mock_initial_response = MagicMock()
        mock_initial_response.choices = [
            MagicMock(message=MagicMock(content="", tool_calls=tool_calls))
        ]

        mock_final_response = MagicMock()
        mock_final_response.choices = [
            MagicMock(
                message=MagicMock(
                    content="Pesanan Anda berhasil dibuat dengan nomor ORD-2025-0001. Total Rp 50,000. Terima kasih!"
                )
            )
        ]

        with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.side_effect = [mock_initial_response, mock_final_response]

            with patch.object(agent, '_execute_function', new_callable=AsyncMock) as mock_exec:
                mock_exec.side_effect = [
                    {"customer": mock_customer},
                    mock_order
                ]

                result = await agent.process(
                    user_message="ya betul, proses saja",
                    context=basic_context
                )

                assert result["transaction_created"] is True
                assert result["transaction_id"] == "order-123"
                assert len(result["function_calls"]) == 2


# ============================================================================
# TEST: Error Handling
# ============================================================================

class TestErrorHandling:
    """Test error handling in Transaction Agent"""

    @pytest.mark.asyncio
    async def test_llm_error_fallback(self, agent, basic_context):
        """Test fallback response when LLM call fails"""
        with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.side_effect = Exception("OpenAI API error")

            result = await agent.process(
                user_message="mau pesan kimchi",
                context=basic_context
            )

            assert "response" in result
            assert "Maaf, terjadi kesalahan" in result["response"]
            assert result["transaction_created"] is False
            assert "error" in result

    @pytest.mark.asyncio
    async def test_function_execution_error(self, agent, basic_context):
        """Test handling function execution errors"""
        mock_function = MagicMock()
        mock_function.name = "get_customer_by_phone"
        mock_function.arguments = json.dumps({"phone": "+6281234567890"})

        mock_tool_call = MagicMock()
        mock_tool_call.id = "call_123"
        mock_tool_call.type = "function"
        mock_tool_call.function = mock_function

        mock_initial_response = MagicMock()
        mock_initial_response.choices = [
            MagicMock(message=MagicMock(content="", tool_calls=[mock_tool_call]))
        ]

        mock_final_response = MagicMock()
        mock_final_response.choices = [
            MagicMock(
                message=MagicMock(
                    content="Maaf, terjadi kesalahan saat mencari data customer. Silakan coba lagi."
                )
            )
        ]

        with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.side_effect = [mock_initial_response, mock_final_response]

            with patch.object(agent, '_execute_function', new_callable=AsyncMock) as mock_exec:
                mock_exec.return_value = {"error": "Database connection failed"}

                result = await agent.process(
                    user_message="mau pesan",
                    context=basic_context
                )

                # Should still return a response even with function error
                assert "response" in result
                assert result["function_calls"][0]["result"]["error"] == "Database connection failed"


# ============================================================================
# TEST: System Prompt
# ============================================================================

class TestSystemPrompt:
    """Test system prompt construction"""

    def test_system_prompt_contains_workflows(self, agent):
        """Test system prompt has workflow instructions"""
        prompt = agent.system_prompt

        assert "WORKFLOW - ORDER PLACEMENT" in prompt
        assert "WORKFLOW - BOOKING CREATION" in prompt
        assert "CUSTOMER INFORMATION COLLECTION" in prompt
        assert "VALIDATION RULES" in prompt

    def test_system_prompt_contains_functions(self, agent):
        """Test system prompt describes available functions"""
        prompt = agent.system_prompt

        assert "get_customer_by_phone" in prompt
        assert "create_customer" in prompt
        assert "create_order" in prompt
        assert "create_booking" in prompt

    def test_system_prompt_has_validation_rules(self, agent):
        """Test system prompt includes validation rules"""
        prompt = agent.system_prompt

        assert "Minimum 3 characters" in prompt
        assert "Indonesian format" in prompt
        assert "positive integer" in prompt
