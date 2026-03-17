
import sys

def mock_is_user_authorized(uid, email=None):
    if uid == "guest": return False
    
    # HARDCODED WHITELIST (Add family/special users here)
    WHITELISTED_EMAILS = [
        "yshirokov05@gmail.com",
        "samanthagorvad@gmail.com",
        "yurievf@gmail.com",
        "schirokova.n@gmail.com"
    ]
    if email and email.lower() in WHITELISTED_EMAILS:
        return True
    return False

def test_whitelist():
    test_cases = [
        ("yshirokov05@gmail.com", True),
        ("schirokova.n@gmail.com", True),
        ("yury.shirokov@gmail.com", False),
        ("unknown@gmail.com", False),
    ]
    
    for email, expected in test_cases:
        result = mock_is_user_authorized("some_uid", email)
        print(f"Testing {email}: Expected {expected}, Got {result}")
        assert result == expected

if __name__ == "__main__":
    try:
        test_whitelist()
        print("Logic verification passed!")
    except Exception as e:
        print(f"Test failed: {e}")
        sys.exit(1)
