"""
Security Service - Detects and prevents jailbreak/prompt injection attempts
"""
import re
from typing import Tuple, Optional


class SecurityService:
    """Service for security validation of user inputs"""

    # Jailbreak detection patterns
    JAILBREAK_PATTERNS = [
        # Role manipulation
        r"(?i)(forget|ignore|disregard).*(prompt|instruction|rule|guideline)",
        r"(?i)(act as|pretend to be|roleplay|you are now)",
        r"(?i)(new role|change role|override)",

        # Prompt injection
        r"(?i)(system:|assistant:|user:)",
        r"(?i)\[system\]|\[assistant\]|\[user\]",
        r"(?i)(reveal|show|tell me).*(prompt|instruction|system message)",

        # Code generation requests
        r"(?i)(write|code|program|script).*(python|javascript|java|rust|go|c\+\+|html|code)",
        r"(?i)(def |function |class |import |from |require\(|const |let |var )",
        r"(?i)(hello world|fibonacci|factorial|sorting algorithm)",

        # DAN/jailbreak attempts
        r"(?i)DAN mode|developer mode|god mode",
        r"(?i)jailbreak|bypass|hack",
        r"(?i)(now you can|you can now|from now on)",

        # Instruction override
        r"(?i)(previous instructions|above instructions|earlier instructions)",
        r"(?i)(new instructions|updated instructions|revised instructions)",
        r"(?i)(stop being|don't be|cease being)",

        # Recipe and cooking instructions (out of scope)
        r"(?i)(resep|recipe|cara membuat|how to make|cara bikin)",
        r"(?i)(bahan.*buat|ingredients for|komposisi)",
        r"(?i)(langkah.*membuat|steps to make|tutorial.*buat)",
    ]

    # Business scope keywords (allowed)
    BUSINESS_KEYWORDS = [
        "produk", "harga", "stock", "stok", "beli", "pesan", "booking",
        "available", "ada", "tersedia", "order", "barang", "layanan",
        "service", "help", "bantuan", "info", "informasi"
    ]

    def __init__(self):
        self.jailbreak_regex = [re.compile(pattern) for pattern in self.JAILBREAK_PATTERNS]

    def validate_user_message(self, message: str) -> Tuple[bool, Optional[str]]:
        """
        Validate user message for security threats

        Args:
            message: User's message

        Returns:
            Tuple of (is_safe, error_message)
            - (True, None) if safe
            - (False, "reason") if dangerous
        """
        # Check for jailbreak patterns
        for regex in self.jailbreak_regex:
            if regex.search(message):
                return False, "jailbreak_detected"

        # Check for excessive special characters (possible injection)
        special_char_ratio = sum(1 for c in message if c in "{}[]<>|\\") / max(len(message), 1)
        if special_char_ratio > 0.3:  # More than 30% special chars
            return False, "suspicious_characters"

        # Check for very long messages (possible stuffing attack)
        if len(message) > 2000:
            return False, "message_too_long"

        return True, None

    def get_safe_error_response(self, error_type: str) -> str:
        """
        Get appropriate error response for security violation

        Args:
            error_type: Type of security violation

        Returns:
            Safe error message in Indonesian
        """
        responses = {
            "jailbreak_detected": "Maaf, saya hanya bisa membantu dengan pertanyaan terkait produk dan layanan kami. Ada yang bisa saya bantu?",
            "suspicious_characters": "Maaf, pesan Anda mengandung karakter yang tidak valid. Silakan coba lagi.",
            "message_too_long": "Maaf, pesan Anda terlalu panjang. Silakan persingkat pertanyaan Anda.",
        }
        return responses.get(error_type, "Maaf, terjadi kesalahan. Silakan coba lagi.")


security_service = SecurityService()
