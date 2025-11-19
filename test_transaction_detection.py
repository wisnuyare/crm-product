"""
Test script to verify transaction detection logic
Tests the pattern matching that determines if a message is part of a transaction workflow
"""
import re


def test_transaction_detection(user_message: str) -> dict:
    """
    Test the transaction detection logic from multi_agent_router.py

    Args:
        user_message: User's message to test

    Returns:
        Dictionary with detection results
    """
    msg_lower = user_message.lower().strip()

    # Split message into lines for better multi-line analysis
    lines = user_message.strip().split('\n')
    first_line = lines[0].strip() if lines else ""

    # Phone number pattern (Indonesian format)
    phone_pattern = r'^(0|\+62)[0-9]{9,13}$'
    is_phone = bool(re.match(phone_pattern, msg_lower.replace(' ', '').replace('-', '')))

    # Name pattern (2-4 words with proper capitalization)
    # Check FIRST LINE only for name patterns (handles multi-line responses)
    first_line_words = first_line.split()
    is_name = (
        len(first_line_words) >= 2 and len(first_line_words) <= 4 and
        all(w[0].isupper() for w in first_line_words if len(w) > 0) and
        not any(char.isdigit() for char in first_line)
    )

    # Address pattern (contains address keywords)
    address_keywords = ['jl.', 'jalan', 'no.', 'nomor', 'rt', 'rw', 'blok', 'gang', 'gg.', 'pick up', 'pickup', 'ambil sendiri']
    is_address = any(keyword in msg_lower for keyword in address_keywords)

    # Single word responses (likely answering yes/no or providing simple info)
    all_words = user_message.strip().split()
    is_simple_response = len(all_words) == 1 and len(user_message) < 20

    # Date/time pattern (likely booking response)
    date_pattern = r'\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?'  # Matches 12/1, 12-1-2024, etc.
    time_pattern = r'\d{1,2}[:\.]\d{2}|jam\s+\d{1,2}'  # Matches 14:00, 14.00, jam 2
    is_datetime = bool(re.search(date_pattern, msg_lower)) or bool(re.search(time_pattern, msg_lower))

    # Confirmation pattern (yes/no responses)
    confirmation_keywords = ['ya', 'iya', 'ok', 'oke', 'benar', 'betul', 'tidak', 'nggak', 'batal', 'jadi']
    is_confirmation = any(msg_lower == keyword or msg_lower.startswith(keyword + ' ') for keyword in confirmation_keywords)

    transaction_in_progress = is_phone or is_name or is_address or is_simple_response or is_datetime or is_confirmation

    return {
        "message": user_message,
        "transaction_detected": transaction_in_progress,
        "patterns": {
            "is_phone": is_phone,
            "is_name": is_name,
            "is_address": is_address,
            "is_simple_response": is_simple_response,
            "is_datetime": is_datetime,
            "is_confirmation": is_confirmation
        },
        "analysis": {
            "first_line": first_line,
            "first_line_words": first_line_words,
            "total_words": len(all_words),
            "lines": len(lines)
        }
    }


# Test cases
test_cases = [
    # The critical test case from the bug report
    "Wisnu Wardana\nSaya akan pick up",

    # Other transaction response patterns
    "Wisnu Wardana",
    "John Doe Smith",
    "081234567890",
    "+6281234567890",
    "Jl. Sudirman No. 123",
    "ya",
    "iya jadi",
    "ok",
    "tidak",
    "12/1/2024",
    "jam 2 sore",
    "14:00",

    # Multi-line variations
    "Wisnu Wardana\nJl. Sudirman No. 123",
    "John Smith\n081234567890",

    # Should NOT be detected as transaction (new orders)
    "halo mau pesan kimchi sawi 2 bisa?",
    "ada apa?",
    "terima kasih",
]

print("=" * 80)
print("TRANSACTION DETECTION TEST RESULTS")
print("=" * 80)

for test_msg in test_cases:
    result = test_transaction_detection(test_msg)

    print(f"\nMessage: {repr(test_msg)}")
    print(f"Transaction Detected: {'[YES]' if result['transaction_detected'] else '[NO]'}")

    # Show which patterns matched
    matched_patterns = [k for k, v in result['patterns'].items() if v]
    if matched_patterns:
        print(f"Matched Patterns: {', '.join(matched_patterns)}")

    # Show analysis for multi-line messages
    if result['analysis']['lines'] > 1:
        print(f"Analysis: {result['analysis']['lines']} lines, first line: {repr(result['analysis']['first_line'])}")

    print("-" * 80)

print("\n" + "=" * 80)
print("TEST COMPLETE")
print("=" * 80)
