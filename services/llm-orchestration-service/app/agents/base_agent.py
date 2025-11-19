"""
Base Agent Abstract Class

All LLM agents inherit from this base class.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from openai import AsyncOpenAI
import logging

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Base class for all LLM agents"""

    def __init__(self, model: str = "gpt-4o-mini", temperature: float = 0.1):
        """
        Initialize base agent

        Args:
            model: OpenAI model to use (default: gpt-4o-mini)
            temperature: Sampling temperature (default: 0.1 for deterministic)
        """
        self.model = model
        self.temperature = temperature
        self.client = AsyncOpenAI()
        self.system_prompt = self._build_system_prompt()

        logger.info(f"Initialized {self.__class__.__name__} with model={model}")

    @abstractmethod
    def _build_system_prompt(self) -> str:
        """
        Build agent-specific system prompt

        Returns:
            System prompt string
        """
        pass

    @abstractmethod
    async def process(self, user_message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process user message and return result

        Args:
            user_message: The user's message
            context: Additional context (tenant_id, conversation_history, etc.)

        Returns:
            Processing result dictionary
        """
        pass

    async def _call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        response_format: Optional[Dict[str, str]] = None,
        tools: Optional[List[Dict]] = None,
    ) -> Any:
        """
        Call OpenAI API

        Args:
            messages: List of message dictionaries
            temperature: Override default temperature
            response_format: Optional response format (e.g., {"type": "json_object"})
            tools: Optional function calling tools

        Returns:
            OpenAI response object
        """
        params = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature if temperature is not None else self.temperature,
        }

        if response_format:
            params["response_format"] = response_format

        if tools:
            params["tools"] = tools

        try:
            response = await self.client.chat.completions.create(**params)
            return response
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}")
            raise

    def _build_messages(
        self,
        user_message: str,
        conversation_history: Optional[List[Any]] = None,
        system_prompt: Optional[str] = None,
    ) -> List[Dict[str, str]]:
        """
        Build messages array for OpenAI API

        Args:
            user_message: Current user message
            conversation_history: Optional conversation history
            system_prompt: Optional override system prompt

        Returns:
            List of message dictionaries
        """
        messages = [{"role": "system", "content": system_prompt or self.system_prompt}]

        # Add conversation history
        if conversation_history:
            for msg in conversation_history:
                role = "user" if msg.sender_type == "customer" else "assistant"
                messages.append({"role": role, "content": msg.content})

        # Add current user message
        messages.append({"role": "user", "content": user_message})

        return messages

    def get_agent_name(self) -> str:
        """Get agent name"""
        return self.__class__.__name__

    def get_model(self) -> str:
        """Get model name"""
        return self.model

    def get_system_prompt_length(self) -> int:
        """Get system prompt token count (approximate)"""
        return len(self.system_prompt.split())
