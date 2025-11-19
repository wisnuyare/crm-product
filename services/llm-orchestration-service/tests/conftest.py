"""
Pytest configuration and fixtures

Sets up test environment including mock API keys and shared fixtures.
"""

import os
import pytest

# Set dummy OpenAI API key for testing
os.environ["OPENAI_API_KEY"] = "sk-test-key-for-unit-tests"


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Set up test environment variables"""
    # Ensure API key is set for all tests
    os.environ.setdefault("OPENAI_API_KEY", "sk-test-key-for-unit-tests")

    # Set test mode flag
    os.environ["TESTING"] = "true"

    yield

    # Cleanup after all tests
    if "TESTING" in os.environ:
        del os.environ["TESTING"]
