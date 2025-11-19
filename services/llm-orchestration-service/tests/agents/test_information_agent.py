"""
Test Information Agent

Tests for product inquiry handling, RAG integration, and order intent detection.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import List, Dict, Any

from app.agents.information_agent import InformationAgent, information_agent
from app.models import Message


class MockRAGContext:
    """Mock RAG context object"""
    def __init__(self, text: str, source: str, score: float):
        self.text = text
        self.source = source
        self.score = score


@pytest.fixture
def agent():
    """Fixture for Information Agent instance"""
    return information_agent


@pytest.fixture
def mock_rag_context():
    """Fixture for mock RAG context"""
    return [
        MockRAGContext(
            text="Kimchi Sawi - Rp 25,000. Fresh Korean-style fermented cabbage. Spicy and tangy.",
            source="products.md",
            score=0.92
        ),
        MockRAGContext(
            text="Kimchi Lobak - Rp 20,000. Korean-style fermented radish. Crunchy and refreshing.",
            source="products.md",
            score=0.85
        ),
        MockRAGContext(
            text="Business Hours: Monday-Saturday 9 AM - 6 PM. Closed on Sundays.",
            source="info.md",
            score=0.78
        ),
    ]


@pytest.fixture
def basic_context():
    """Basic context for testing"""
    return {
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "conversation_id": "test-conversation-123",
        "kb_ids": ["kb-1", "kb-2"],
        "conversation_history": [],
    }


# ============================================================================
# TEST: RAG Context Retrieval
# ============================================================================

class TestRAGContextRetrieval:
    """Test RAG context retrieval functionality"""

    @pytest.mark.asyncio
    async def test_rag_context_retrieval_success(self, agent, basic_context, mock_rag_context):
        """Test successful RAG context retrieval"""
        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.return_value = mock_rag_context

            result = await agent._get_rag_context(
                user_message="ada kimchi?",
                tenant_id=basic_context["tenant_id"],
                kb_ids=basic_context["kb_ids"]
            )

            assert len(result) == 3
            assert result[0].text.startswith("Kimchi Sawi")
            assert result[0].score == 0.92
            mock_get_rag.assert_called_once_with(
                query="ada kimchi?",
                tenant_id=basic_context["tenant_id"],
                kb_ids=basic_context["kb_ids"],
                top_k=3,
                min_score=0.7
            )

    @pytest.mark.asyncio
    async def test_rag_context_retrieval_empty(self, agent, basic_context):
        """Test RAG context retrieval with no results"""
        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.return_value = []

            result = await agent._get_rag_context(
                user_message="random unknown query",
                tenant_id=basic_context["tenant_id"],
                kb_ids=basic_context["kb_ids"]
            )

            assert result == []

    @pytest.mark.asyncio
    async def test_rag_context_retrieval_error(self, agent, basic_context):
        """Test RAG context retrieval handles errors gracefully"""
        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.side_effect = Exception("Knowledge base unavailable")

            # Should return empty list on error
            result = await agent._get_rag_context(
                user_message="ada kimchi?",
                tenant_id=basic_context["tenant_id"],
                kb_ids=basic_context["kb_ids"]
            )

            assert result == []


# ============================================================================
# TEST: RAG Context Enhancement
# ============================================================================

class TestRAGContextEnhancement:
    """Test adding RAG context to system prompt"""

    def test_add_rag_context_with_results(self, agent, mock_rag_context):
        """Test enhancing prompt with RAG context"""
        base_prompt = "You are a helpful assistant."
        enhanced = agent._add_rag_context(base_prompt, mock_rag_context)

        assert "You are a helpful assistant." in enhanced
        assert "Relevant Information from Knowledge Base:" in enhanced
        assert "Kimchi Sawi" in enhanced
        assert "Kimchi Lobak" in enhanced
        assert "Source 1: products.md (relevance: 0.92)" in enhanced
        assert "Source 2: products.md (relevance: 0.85)" in enhanced

    def test_add_rag_context_empty(self, agent):
        """Test enhancing prompt with no RAG context"""
        base_prompt = "You are a helpful assistant."
        enhanced = agent._add_rag_context(base_prompt, [])

        assert "You are a helpful assistant." in enhanced
        assert "No knowledge base info found" in enhanced
        assert "Ask customer to be more specific" in enhanced

    def test_add_rag_context_truncation(self, agent):
        """Test RAG context text truncation for long texts"""
        long_context = [
            MockRAGContext(
                text="A" * 1000,  # Very long text
                source="test.md",
                score=0.9
            )
        ]

        base_prompt = "You are a helpful assistant."
        enhanced = agent._add_rag_context(base_prompt, long_context)

        # Should be truncated to 500 chars + "..."
        assert "A" * 500 + "..." in enhanced
        assert len(enhanced) < 1000  # Significantly shorter than original


# ============================================================================
# TEST: Order Intent Detection
# ============================================================================

class TestOrderIntentDetection:
    """Test order intent detection for re-routing"""

    def test_detect_order_intent_in_response(self, agent):
        """Test detecting order intent from agent response"""
        response = "Baik, saya akan bantu proses pesanan Anda."
        user_message = "mau pesan 2 kimchi"

        should_reroute = agent._detect_order_intent(response, user_message)
        assert should_reroute is True

    def test_detect_order_intent_in_user_message(self, agent):
        """Test detecting order intent from user message"""
        test_cases = [
            ("mau pesan 2 kimchi", "Baik"),
            ("mau order dong", "Oke"),
            ("saya mau beli", "Siap"),
            ("order dong 3 porsi", "Ya"),
            ("pesan dong", "Baik"),
        ]

        for user_msg, response in test_cases:
            should_reroute = agent._detect_order_intent(response, user_msg)
            assert should_reroute is True, f"Failed to detect order intent in: {user_msg}"

    def test_no_order_intent_product_inquiry(self, agent):
        """Test no false positives for product inquiries"""
        test_cases = [
            ("ada kimchi?", "Ya, kami punya Kimchi Sawi seharga Rp 25,000."),
            ("harga berapa?", "Kimchi Sawi Rp 25,000, Kimchi Lobak Rp 20,000."),
            ("apa yang ada?", "Kami punya berbagai jenis kimchi."),
        ]

        for user_msg, response in test_cases:
            should_reroute = agent._detect_order_intent(response, user_msg)
            assert should_reroute is False, f"False positive for: {user_msg}"

    def test_order_intent_case_insensitive(self, agent):
        """Test order intent detection is case insensitive"""
        test_cases = [
            ("MAU PESAN", "ok"),
            ("Mau Order", "baik"),
            ("SAYA MAU BELI", "ya"),
        ]

        for user_msg, response in test_cases:
            should_reroute = agent._detect_order_intent(response, user_msg)
            assert should_reroute is True


# ============================================================================
# TEST: Full Process Flow
# ============================================================================

class TestInformationAgentProcess:
    """Test end-to-end information agent processing"""

    @pytest.mark.asyncio
    async def test_product_inquiry_with_rag(self, agent, basic_context, mock_rag_context):
        """Test product inquiry with RAG context"""
        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.return_value = mock_rag_context

            # Mock LLM response
            mock_llm_response = MagicMock()
            mock_llm_response.choices = [
                MagicMock(message=MagicMock(
                    content="Ya, kami punya Kimchi Sawi seharga Rp 25,000 dan Kimchi Lobak Rp 20,000. Ada yang bisa saya bantu lagi?"
                ))
            ]

            with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
                mock_llm.return_value = mock_llm_response

                result = await agent.process(
                    user_message="ada kimchi?",
                    context=basic_context
                )

                assert "response" in result
                assert "Kimchi Sawi" in result["response"]
                assert result["rag_sources"] == ["products.md", "products.md", "info.md"]
                assert result["should_reroute"] is False
                assert result["new_intent"] is None

    @pytest.mark.asyncio
    async def test_order_intent_triggers_reroute(self, agent, basic_context, mock_rag_context):
        """Test order intent triggers re-routing"""
        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.return_value = mock_rag_context

            # Mock LLM response with order acknowledgment
            mock_llm_response = MagicMock()
            mock_llm_response.choices = [
                MagicMock(message=MagicMock(
                    content="Baik, saya akan bantu proses pesanan Anda."
                ))
            ]

            with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
                mock_llm.return_value = mock_llm_response

                result = await agent.process(
                    user_message="mau pesan 2 kimchi",
                    context=basic_context
                )

                assert result["should_reroute"] is True
                assert result["new_intent"] == "place_order"

    @pytest.mark.asyncio
    async def test_general_question_business_hours(self, agent, basic_context, mock_rag_context):
        """Test general question about business hours"""
        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.return_value = mock_rag_context

            mock_llm_response = MagicMock()
            mock_llm_response.choices = [
                MagicMock(message=MagicMock(
                    content="Jam buka kami Senin-Sabtu pukul 9 pagi sampai 6 sore. Tutup hari Minggu. Ada yang bisa saya bantu lagi?"
                ))
            ]

            with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
                mock_llm.return_value = mock_llm_response

                result = await agent.process(
                    user_message="jam berapa buka?",
                    context=basic_context
                )

                assert "response" in result
                assert "9 pagi" in result["response"] or "Monday" in result["response"]
                assert result["should_reroute"] is False

    @pytest.mark.asyncio
    async def test_no_rag_context_fallback(self, agent, basic_context):
        """Test handling when no RAG context is available"""
        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.return_value = []

            mock_llm_response = MagicMock()
            mock_llm_response.choices = [
                MagicMock(message=MagicMock(
                    content="Informasi tersebut tidak tersedia saat ini. Silakan hubungi customer service kami."
                ))
            ]

            with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
                mock_llm.return_value = mock_llm_response

                result = await agent.process(
                    user_message="random unknown query",
                    context=basic_context
                )

                assert "response" in result
                assert result["rag_sources"] == []
                assert "error" not in result


# ============================================================================
# TEST: Error Handling
# ============================================================================

class TestErrorHandling:
    """Test error handling in Information Agent"""

    @pytest.mark.asyncio
    async def test_llm_error_fallback(self, agent, basic_context):
        """Test fallback response when LLM call fails"""
        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.return_value = []

            with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
                mock_llm.side_effect = Exception("OpenAI API error")

                result = await agent.process(
                    user_message="ada kimchi?",
                    context=basic_context
                )

                assert "response" in result
                assert "Maaf, terjadi kesalahan" in result["response"]
                assert result["should_reroute"] is False
                assert result["new_intent"] is None
                assert "error" in result

    @pytest.mark.asyncio
    async def test_rag_error_continues_processing(self, agent, basic_context):
        """Test that RAG errors don't stop processing"""
        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.side_effect = Exception("Knowledge base error")

            mock_llm_response = MagicMock()
            mock_llm_response.choices = [
                MagicMock(message=MagicMock(
                    content="Informasi tidak tersedia. Silakan hubungi customer service."
                ))
            ]

            with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
                mock_llm.return_value = mock_llm_response

                result = await agent.process(
                    user_message="ada kimchi?",
                    context=basic_context
                )

                # Should still return a response even with RAG error
                assert "response" in result
                assert result["rag_sources"] == []


# ============================================================================
# TEST: Conversation History Integration
# ============================================================================

class TestConversationHistory:
    """Test conversation history handling"""

    @pytest.mark.asyncio
    async def test_with_conversation_history(self, agent, basic_context, mock_rag_context):
        """Test processing with conversation history"""
        context_with_history = {
            **basic_context,
            "conversation_history": [
                Message(sender_type="customer", content="halo", timestamp="2025-01-01T10:00:00Z"),
                Message(sender_type="llm", content="Halo! Ada yang bisa saya bantu?", timestamp="2025-01-01T10:00:01Z"),
                Message(sender_type="customer", content="ada kimchi?", timestamp="2025-01-01T10:00:02Z"),
            ]
        }

        with patch('app.services.context_service.context_service.get_rag_context',
                   new_callable=AsyncMock) as mock_get_rag:
            mock_get_rag.return_value = mock_rag_context

            mock_llm_response = MagicMock()
            mock_llm_response.choices = [
                MagicMock(message=MagicMock(
                    content="Ya, kami punya Kimchi Sawi dan Kimchi Lobak."
                ))
            ]

            with patch.object(agent, '_call_llm', new_callable=AsyncMock) as mock_llm:
                mock_llm.return_value = mock_llm_response

                result = await agent.process(
                    user_message="harga berapa?",
                    context=context_with_history
                )

                assert "response" in result
                # Verify conversation history was passed to _build_messages
                mock_llm.assert_called_once()


# ============================================================================
# TEST: System Prompt
# ============================================================================

class TestSystemPrompt:
    """Test system prompt construction"""

    def test_system_prompt_contains_key_instructions(self, agent):
        """Test system prompt has all key instructions"""
        prompt = agent.system_prompt

        # Check key sections
        assert "KNOWLEDGE BASE USAGE" in prompt
        assert "PRODUCT RECOMMENDATIONS" in prompt
        assert "CONVERSION TO ORDER" in prompt
        assert "GENERAL QUESTIONS" in prompt
        assert "RESPONSE GUIDELINES" in prompt

        # Check specific instructions
        assert "ada apa?" in prompt
        assert "mau pesan" in prompt
        assert "Bahasa Indonesia" in prompt
        assert "Transaction Agent" in prompt

    def test_system_prompt_length_reasonable(self, agent):
        """Test system prompt is not too long (cost-effective)"""
        prompt = agent.system_prompt

        # Rough estimate: ~800 tokens target
        # 1 token ≈ 4 chars, so ~3200 chars
        assert len(prompt) < 4000, "System prompt may be too long (high token cost)"
