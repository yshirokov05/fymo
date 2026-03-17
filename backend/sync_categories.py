import os
import sys

# Add the backend directory to python path for imports
sys.path.append(r'c:\Projects\personal-finance-app-pfa\backend')

from firebase_admin import credentials, firestore, initialize_app
import firebase_admin
from plaid_service import categorize_transaction
from firestore_db import get_user_data, save_user_data

def force_recategorize():
    # Attempt to use the existing default app or re-initialize
    if not firebase_admin._apps:
        cred = credentials.Certificate(r'c:\Projects\personal-finance-app-pfa\backend\serviceAccountKey.json')
        initialize_app(cred)
        
    db = firestore.client()
    user_id = 'default_user' # Assuming default_user for now based on previous requests
    
    print(f"Fetching user data for {user_id}...")
    user, incomes, assets, debts, retirement_accounts, insurances, plaid_items, budgets, transactions, paystubs, custom_rules, has_completed_onboarding, custom_categories = get_user_data(user_id)
    
    updated_count = 0
    print(f"Found {len(transactions)} cached transactions. Re-evaluating categories...")
    
    for t in transactions:
        # Save old category to compare
        old_cat = t.category
        
        # Plaid API doesn't store original plaid_categories in our DB, so we pass None 
        # Since our robust logic runs primarily off the transaction name anyway.
        new_cat = categorize_transaction(t.name, None)
        
        if old_cat != new_cat:
            t.category = new_cat
            updated_count += 1
            print(f"Updated '{t.name}': {old_cat} -> {new_cat}")
            
    if updated_count > 0:
        print(f"Saving {updated_count} updated transactions back to DB...")
        save_user_data(user, incomes, assets, debts, retirement_accounts, insurances, plaid_items=plaid_items, budgets=budgets, transactions=transactions, paystubs=paystubs, custom_rules=custom_rules, has_completed_onboarding=has_completed_onboarding, custom_categories=custom_categories, user_id=user_id)
        print("Save complete!")
    else:
        print("No transactions needed updating based on the new logic.")

if __name__ == '__main__':
    force_recategorize()
