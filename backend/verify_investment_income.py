import sys
import os
import unittest
from unittest.mock import MagicMock, patch
from datetime import datetime

# Add the backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import plaid_service
from models import IncomeType, AssetType

class TestInvestmentIncomeDetection(unittest.TestCase):
    
    @patch('plaid_service.client')
    def test_sync_investment_income(self, mock_plaid_client):
        # Mock Accounts Response
        mock_plaid_client.accounts_get.return_value.to_dict.return_value = {
            'accounts': [
                {
                    'account_id': 'acc_123',
                    'name': 'Brokerage Account',
                    'type': 'investment',
                    'subtype': 'brokerage',
                    'balances': {'current': 10000.0}
                }
            ]
        }
        
        # Mock Holdings Response
        mock_plaid_client.investments_holdings_get.return_value.to_dict.return_value = {
            'holdings': [],
            'securities': []
        }
        
        # Mock Transactions Response with a Dividend and a Sale
        mock_plaid_client.transactions_get.return_value.to_dict.return_value = {
            'transactions': [
                {
                    'transaction_id': 'tx_div_1',
                    'account_id': 'acc_123',
                    'amount': -50.25, # Negative is income in Plaid
                    'date': datetime.now().date(),
                    'name': 'AAPL DIVIDEND',
                    'category': ['Investment', 'Dividend'],
                    'pending': False
                },
                {
                    'transaction_id': 'tx_sell_1',
                    'account_id': 'acc_123',
                    'amount': -1200.00,
                    'date': datetime.now().date(),
                    'name': 'Sold 10 NVDA',
                    'category': ['Investment', 'Sell'],
                    'pending': False
                },
                {
                    'transaction_id': 'tx_normal',
                    'account_id': 'acc_123',
                    'amount': 25.00, # Positive is expense
                    'date': datetime.now().date(),
                    'name': 'Starbucks',
                    'category': ['Food', 'Dining'],
                    'pending': False
                }
            ]
        }
        
        # Mock Liabilities response
        mock_plaid_client.liabilities_get.return_value.to_dict.return_value = {
            'liabilities': {'credit': []}
        }

        # Run sync
        res = plaid_service.sync_plaid_data("fake_token", "user_123")
        new_assets, new_ra, new_transactions, new_debts, new_paystubs, new_incomes, synced_ids = res
        
        # Assertions
        print(f"Detected {len(new_incomes)} income entries")
        for inc in new_incomes:
            print(f" - {inc.income_type.name}: {inc.description} (${inc.amount})")
            
        self.assertEqual(len(new_incomes), 2)
        
        div_inc = next(i for i in new_incomes if i.income_type == IncomeType.DIVIDENDS)
        self.assertEqual(div_inc.amount, 50.25)
        self.assertEqual(div_inc.description, 'AAPL DIVIDEND')
        
        gain_inc = next(i for i in new_incomes if i.income_type == IncomeType.CAPITAL_GAINS)
        self.assertEqual(gain_inc.amount, 1200.00)
        self.assertEqual(gain_inc.description, 'Sold 10 NVDA')

if __name__ == '__main__':
    unittest.main()
