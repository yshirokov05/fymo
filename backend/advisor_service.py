import os
import google.generativeai as genai
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta

# --- Define Tools (Function Calling) ---
def search_current_deals(query: str) -> str:
    """
    Simulates searching the internet for current travel deals, credit card offers, or financial news.
    Args:
        query: What to search for (e.g., 'flights to Tokyo October', 'best cash back credit cards 2026')
    """
    logging.info(f"AI Advisor called Tool: search_current_deals with query '{query}'")
    
    query = query.lower()
    if 'flight' in query or 'travel' in query:
        return json.dumps({
            "results": "Found a hypothetical deal: Round-trip flights averaging $1,100-$1,350 to major hubs in October. Economy class availability is high."
        })
    elif 'card' in query:
        return json.dumps({
            "results": "Top current offers: 1) Chase Freedom Unlimited (1.5% everywhere, 3% dining), 2) Amex Gold (4x dining/groceries). 3) Wells Fargo Active Cash (2% everywhere)."
        })
    return json.dumps({
        "results": f"General search results for '{query}': Average costs align with standard market rates for 2026."
    })

def get_period_comparison(transactions, days=30):
    """
    Aggregates spending into categories for a specific window of days.
    Returns a dictionary of {category: amount} and the total.
    """
    spending = defaultdict(float)
    total_spent = 0.0
    
    # Calculate cutoff
    cutoff = datetime.now() - timedelta(days=days)
    
    for t in transactions:
        # Transactions may have date strings "YYYY-MM-DD"
        t_date = datetime.strptime(t.get('date'), '%Y-%m-%d')
        if t_date < cutoff:
            continue

        if not t.get('pending', False) and t.get('amount', 0) > 0:
            cat = t.get('category', 'Uncategorized')
            spending[cat] += t['amount']
            total_spent += t['amount']
            
    return spending, total_spent

def get_financial_advice(user_prompt, financial_data):
    """
    SEC-6: Uses Gemini's system_instruction for explicit separation of instructions and user input.
    Provides personalized financial advice based on user data, with RAG context injection and Tool Calling.
    Now includes Period-over-Period (PoP) analysis.
    """
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        return "I'm sorry, Mr. Bean, but the Gemini API Key is missing. I cannot provide advice at this time."

    genai.configure(api_key=api_key)
    
    try:
        transactions = financial_data.get('transactions', [])
        
        # 1. Calculate Period-over-Period (PoP) Metrics
        # Current Period (Last 30 days)
        current_spending, current_total = get_period_comparison(transactions, days=30)
        
        # Previous Period (30-60 days ago) - Simple approach for now
        # We'll filter twice for clarity
        cutoff_30 = datetime.now() - timedelta(days=30)
        cutoff_60 = datetime.now() - timedelta(days=60)
        prev_transactions = [t for t in transactions if cutoff_60 <= datetime.strptime(t.get('date'), '%Y-%m-%d') < cutoff_30]
        prev_spending = defaultdict(float)
        prev_total = 0.0
        for t in prev_transactions:
            if not t.get('pending', False) and t.get('amount', 0) > 0:
                cat = t.get('category', 'Uncategorized')
                prev_spending[cat] += t['amount']
                prev_total += t['amount']

        # 2. Identify Top Changes
        insights = []
        all_categories = set(list(current_spending.keys()) + list(prev_spending.keys()))
        for cat in all_categories:
            curr = current_spending.get(cat, 0)
            prev = prev_spending.get(cat, 0)
            if prev > 0:
                change = ((curr - prev) / prev) * 100
                if abs(change) >= 10: # Significant change
                    insights.append(f"- {cat}: {'Up' if change > 0 else 'Down'} {abs(change):.1f}% (${curr:,.2f} vs ${prev:,.2f})")
            elif curr > 50: # New significant spend
                insights.append(f"- {cat}: New spend of ${curr:,.2f}")

        # 3. Budget Normalization (Monthly Equivalent)
        budgets = financial_data.get('budgets', [])
        normalized_budgets = []
        for b in budgets:
            limit = b.get('limit_amount', 0)
            period = b.get('period', 'MONTHLY').upper()
            monthly_equiv = limit * 4.345 if period == 'WEEKLY' else limit
            normalized_budgets.append({
                "category": b.get('category'),
                "monthly_limit": monthly_equiv,
                "current_period_spend": current_spending.get(b.get('category'), 0)
            })

        # 4. Fetch persistent AI memory
        ai_insights = financial_data.get('ai_insights', [])
        memory_str = json.dumps(ai_insights) if ai_insights else "No previous habits or goals recorded yet."

        system_instruction = f"""
        You are the Financial Headquarters (FHQ) AI Advisor. 
        Always address the user as "Mr. Bean". This is mandatory for your identity protocol.
        
        GOAL: Provide high-precision financial advice based strictly on ACTUAL spending data and longitudinal habits.
        
        USER FINANCIAL PROFILE:
        - Net Worth: ${financial_data.get('real_time_net_worth', 0):,.2f}
        - Total Annual Income: ${financial_data.get('total_annual_income', 0):,.2f}
        - Debt: ${financial_data.get('total_debt', 0):,.2f}
        - State: {financial_data.get('state', 'Unknown')}
        
        PERSISTENT MEMORY (Habits & Long-term Goals):
        {memory_str}

        PERIOD-OVER-PERIOD INSIGHTS (Last 30 days vs Prev 30 days):
        {chr(10).join(insights) if insights else "No significant spending changes detected."}
        - Total Spend (Current): ${current_total:,.2f}
        - Total Spend (Previous): ${prev_total:,.2f}
        
        BUDGET STATUS (Normalized to Monthly):
        {json.dumps(normalized_budgets)}

        IMPORTANT GUIDELINES:
        1. Professional & Honest: If Mr. Bean is overspending, point it out firmly but professionally.
        2. Data-Driven: Use the PoP insights above to give specific examples (e.g., "Your dining spend is up 20%").
        3. Professional Disclosure: Always include this at the end: "This advice is for informational purposes only. Consult a human professional for regulated financial decisions."
        4. Conciseness: Keep the response under 300 words unless deeply complex.
        """

        model = genai.GenerativeModel(
            model_name='gemini-1.5-flash',
            system_instruction=system_instruction,
            tools=[search_current_deals]
        )
        
        chat = model.start_chat(enable_automatic_function_calling=True)
        response = chat.send_message(user_prompt)
        return response.text
    except Exception as e:
        import traceback
        logging.error(f"Advisor Service Error: {e} - Traceback: {traceback.format_exc()}")
        return "I encountered an error while analyzing your data, Mr. Bean. Please try again later."
