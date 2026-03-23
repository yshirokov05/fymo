import csv
import io
import uuid
from datetime import datetime
from typing import List, Dict, Any
from models import Transaction

def parse_apple_card_csv(file_content: str, user_id: str) -> List[Transaction]:
    """
    Parses an Apple Card CSV file and returns a list of Transaction objects.
    Supports both observed Apple Card CSV formats.
    """
    transactions = []
    f = io.StringIO(file_content)
    reader = csv.DictReader(f)
    
    # Normalize field names (remove BOM or extra spaces if any)
    fieldnames = [fn.strip() for fn in reader.fieldnames] if reader.fieldnames else []
    
    for row in reader:
        # Clean up row keys to match normalized fieldnames
        row = {k.strip(): v for k, v in row.items()}
        
        try:
            # Format A: Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD)
            if 'Transaction Date' in row and 'Amount (USD)' in row:
                date_str = row['Transaction Date']
                amount = float(row['Amount (USD)'])
                name = row.get('Merchant') or row.get('Description') or "Unknown Merchant"
                category = row.get('Category', 'Other')
                
                # Apple Card CSV: positive is purchase, negative is refund (reversed for our app balance logic?)
                # In our app, expenses are usually negative? 
                # Wait, looking at sample_data in api.py: SafeWay -150.
                # So we keep negative for expenses. 
                # If Apple Card says 150.00 for a purchase, we should make it -150.00.
                if row.get('Type') == 'Purchase':
                    amount = -abs(amount)
                elif row.get('Type') == 'Refund':
                    amount = abs(amount)
                
            # Format B: Date, Type, Description, Amount
            elif 'Date' in row and 'Amount' in row:
                date_str = row['Date']
                amount = float(row['Amount'])
                name = row.get('Description', 'Unknown Merchant')
                category = 'Other'
                
                # Deduce type if possible
                t_type = row.get('Type', '').lower()
                if 'payment' in t_type or 'credit' in t_type or 'refund' in t_type:
                    amount = abs(amount)
                else:
                    amount = -abs(amount)
            else:
                continue

            # Standardize date format (M/D/YYYY or YYYY-MM-DD)
            try:
                date_obj = datetime.strptime(date_str, '%m/%d/%Y')
            except ValueError:
                try:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError:
                    date_obj = datetime.now()

            transactions.append(Transaction(
                id=str(uuid.uuid4()),
                user_id=user_id,
                account_id="manual_apple_card",
                amount=amount,
                date=date_obj.strftime('%Y-%m-%d'),
                name=name,
                category=category,
                pending=False
            ))
        except (ValueError, KeyError) as e:
            print(f"Skipping row due to error: {e}")
            continue
            
    return transactions

def detect_and_parse_csv(file_content: str, user_id: str) -> List[Transaction]:
    """
    Detects the CSV type and parses it.
    """
    # For now, we only support Apple Card, but we can expand this.
    return parse_apple_card_csv(file_content, user_id)
