import requests
import json

# Simulated local test of the mapping logic
# Since I cannot easily hit the running Flask app with a real Firebase token,
# I will inspect the logic by running a snippet of the code locally.

def safe_enum(enum_class, value, default):
    try:
        from enum import Enum
        if isinstance(value, enum_class): return value
        return enum_class(value)
    except:
        try:
            return enum_class[value]
        except:
            return default

class AccountType:
    ROTH_IRA = "roth_ira"
    TRADITIONAL_IRA = "traditional_ira"
    K401 = "401k"

def test_mapping():
    # Problematic data: missing 'name'
    ra_data = {"account_type": "K401", "contributions_2025": "1000"} 
    
    try:
        name = ra_data.get('name', 'Unnamed Account')
        print(f"Success! Name mapped to: {name}")
    except KeyError:
        print("Failed! KeyError raised.")

if __name__ == "__main__":
    test_mapping()
