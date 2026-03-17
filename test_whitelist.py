
import sys
import os

# Mock firestore_db and firebase_admin before importing api
class MockDB:
    def collection(self, name):
        return self
    def document(self, id):
        return self
    def get(self):
        class MockDoc:
            exists = False
        return MockDoc()
    def where(self, *args, **kwargs):
        return self
    def limit(self, *args, **kwargs):
        return self

sys.modules['firestore_db'] = type('module', (), {
    'get_db': lambda: MockDB(),
    'get_user_data': lambda **kwargs: (None,) * 11,
    'save_user_data': lambda *args, **kwargs: None,
    'wipe_user_subcollections': lambda *args, **kwargs: None
})
sys.modules['firebase_admin'] = type('module', (), {'auth': None})
sys.modules['price_service'] = type('module', (), {
    'get_current_price': lambda *args, **kwargs: None,
    'get_multiple_prices': lambda *args, **kwargs: {},
    'validate_ticker': lambda *args, **kwargs: True
})
sys.modules['plaid_service'] = type('module', (), {})
sys.modules['advisor_service'] = type('module', (), {})

from backend.api import is_user_authorized

def test_whitelist():
    test_cases = [
        ("yshirokov05@gmail.com", True),
        ("schirokova.n@gmail.com", True),
        ("yury.shirokov@gmail.com", False),
        ("unknown@gmail.com", False),
    ]
    
    for email, expected in test_cases:
        result = is_user_authorized("some_uid", email)
        print(f"Testing {email}: Expected {expected}, Got {result}")
        assert result == expected

if __name__ == "__main__":
    try:
        test_whitelist()
        print("All tests passed!")
    except Exception as e:
        print(f"Test failed: {e}")
        sys.exit(1)
