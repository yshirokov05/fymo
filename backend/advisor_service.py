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

_news_cache = {"timestamp": 0, "content": ""}
NEWS_CACHE_TTL = 900 # 15 minutes

def get_market_news():
    """
    Fetches the latest financial and economic headlines using yfinance for major market indices.
    Parallelizes calls to reduce latency and caches results for 15 minutes.
    """
    import yfinance as yf
    import time
    from concurrent.futures import ThreadPoolExecutor, as_completed
    
    # Check cache
    if time.time() - _news_cache["timestamp"] < NEWS_CACHE_TTL:
        return _news_cache["content"]

    indices = ['SPY', 'QQQ', 'BTC-USD']
    news_items = []
    
    def fetch_ticker_news(symbol):
        try:
            ticker = yf.Ticker(symbol)
            return symbol, ticker.news[:2]
        except Exception as e:
            logging.warning(f"Failed to fetch news for {symbol}: {e}")
            return symbol, []

    try:
        logging.info("Fetching market news in parallel for AI Brief...")
        with ThreadPoolExecutor(max_workers=3) as executor:
            future_to_symbol = {executor.submit(fetch_ticker_news, s): s for s in indices}
            # Use as_completed with a global timeout for the entire batch
            for future in as_completed(future_to_symbol, timeout=3): 
                symbol, headlines = future.result()
                for h in headlines:
                    news_items.append(f"[{symbol}] {h.get('title')} - {h.get('publisher')}")
        
        content = "\n".join(news_items) if news_items else "No major market headlines detected."
        
        # Update cache
        _news_cache["timestamp"] = time.time()
        _news_cache["content"] = content
        
        return content
    except Exception as e:
        logging.error(f"Parallel news fetch error: {e}")
        return _news_cache["content"] if _news_cache["content"] else "Market news currently unavailable."

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
        return "I'm sorry, but the Gemini API Key is missing. I cannot provide advice at this time."

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
        memory_str = financial_data.get('contextual_memory', "No previous habits or goals recorded yet.")

        system_instruction = f"""
        You are the Financial Headquarters (FHQ) AI Advisor. 
        
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

        DEBTS & LIABILITIES (Analyze Names for APR/Benefits):
        {json.dumps(financial_data.get('debts', []))}

        INSURANCE POLICIES:
        {json.dumps(financial_data.get('insurances', []))}

        IMPORTANT GUIDELINES:
        1. Professional & Honest: If the user is overspending, point it out firmly but professionally.
        2. Data-Driven: Use the PoP insights above to give specific examples (e.g., "Your dining spend is up 20%").
        3. Credit Card Analysis: If the user asks about credit cards, use your internal knowledge to describe the benefits and estimated APRs for the cards listed in DEBTS based on their names (e.g. "Chase Sapphire Reserve").
        4. Professional Disclosure: Always include this at the end: "This advice is for informational purposes only. Consult a human professional for regulated financial decisions."
        5. Conciseness: Keep the response under 300 words unless deeply complex.
        """

        model = genai.GenerativeModel(
            model_name='gemini-1.5-flash',
            system_instruction=system_instruction,
            tools=[search_current_deals]
        )
        
        chat = model.start_chat(enable_automatic_function_calling=True)
        response = chat.send_message(user_prompt, request_options={"timeout": 30}) # Higher timeout for interactive
        return response.text
    except Exception as e:
        import traceback
        logging.error(f"Advisor Service Error: {e} - Traceback: {traceback.format_exc()}")
        return "I encountered an error while analyzing your data. Please try again later."

def extract_user_memory(user_prompt, existing_memory_str):
    """
    Reflection Middleware:
    Uses a secondary instance of Gemini 1.5 Flash to automatically identify and extract
    permanent financial facts, goals, or habits from the user's message.
    Returns a dict matching the UserMemory schema if a new fact is found, else None.
    """
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key: return None
    
    genai.configure(api_key=api_key)
    
    system_instruction = f"""
    You are the Semantic Memory Extractor for Financial Headquarters (FHQ).
    Your job is to read the user's message and extract any NEW permanent financial facts, goals, constraints, or background context.
    
    EXISTING MEMORIES:
    {existing_memory_str}
    
    RULES:
    1. If the user mentions a fact, goal, or habit that is NOT clearly present in EXISTING MEMORIES, extract it.
    2. If the user's message does not contain any permanent facts, or if the facts are already known, you MUST return `null`.
    3. You must respond ONLY with a valid JSON object matching this schema (or the literal word null):
    {{
        "fact_id": "a_short_unique_snake_case_string",
        "category": "Goal", // Must be one of: Goal, Habit, Constraint, EconBackground, Fact
        "content": "The concise fact extracted."
    }}
    """
    
    try:
        model = genai.GenerativeModel(
            model_name='gemini-1.5-flash',
            system_instruction=system_instruction,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        response = model.generate_content(user_prompt, request_options={"timeout": 10})
        response.resolve()
        text = response.text.strip()
        if text == "null" or not text:
            return None
            
        data = json.loads(text)
        if "category" in data and "content" in data:
            return data
        return None
    except Exception as e:
        logging.error(f"Memory Extraction Error: {e}")
        return None

def _sanitize_for_ai(text):
    """Removes non-printable or illegal characters that might crash gRPC headers."""
    if not text: return ""
    return "".join(char for char in str(text) if char.isprintable() or char in "\n\r\t")

def generate_overview(financial_data, brief_type="morning"):
    """
    Stage 1: Generates the core financial health bullets (Liquidity, Protection, Goals).
    Fast and data-heavy from local context.
    """
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key: return "API Key missing."
    
    genai.configure(api_key=api_key)
    
    transactions = financial_data.get('transactions', [])[:15]
    net_worth = financial_data.get('real_time_net_worth', 0)
    recent_spend = sum(t.get('amount', 0) for t in transactions if not t.get('pending') and t.get('amount', 0) > 0)
    
    insurances = financial_data.get('insurances', [])
    insurance_summary = ", ".join([f"{i.get('insurance_type', 'Policy')} ({i.get('name', '')})" for i in insurances]) if insurances else "No policies recorded."

    brief_descriptions = {
        "morning": "a high-energy 'Morning Brief' focused on planning, liquidity, and upcoming events.",
        "afternoon": "an 'Mid-Day Update' reflecting on morning spending and goal tracking.",
        "evening": "an 'Evening Review' summarizing the day's financial wins or losses and reviewing protection.",
        "night": "a 'Nightly Audit' for a calm review of the balance sheet and trajectory."
    }
    current_persona = brief_descriptions.get(brief_type, brief_descriptions["morning"])

    system_instruction = f"""
    You are the FHQ AI Analyst preparing {current_persona}.
    Provide a 'Brutally Honest' report with:
    
    1. Three concise bullet points (1-2 sentences each) covering:
       - **Liquidity Check:** (Pending checks or recent spend impact on cash.)
       - **Insurance & Protection:** (Gaps in coverage.)
       - **Goal Progress:** (Are they on track?)
    
    CONTEXT:
    - Net Worth: ${net_worth:,.2f}
    - Recent Spend: ${recent_spend:,.2f}
    - Debts (Analyze APR): {json.dumps(financial_data.get('debts', []))[:500]}
    - Insurance: {insurance_summary}
    
    RULES:
    1. Be direct. No filler.
    2. Respond within 450 characters.
    """
    
    system_instruction = _sanitize_for_ai(system_instruction)
    
    try:
        model = genai.GenerativeModel('gemini-1.5-flash', system_instruction=system_instruction)
        response = model.generate_content(f"Generate my {brief_type} overview now.", request_options={"timeout": 12})
        return response.text.strip()
    except Exception as e:
        logging.error(f"Overview Generation Error: {e}")
        return "**Liquidity Check:** Analysis timed out.\n**Insurance:** Analysis timed out.\n**Goal Progress:** Analysis timed out."

def generate_market_intelligence(financial_data):
    """
    Stage 2: Generates market context connecting news to the user's profile.
    Slow due to external news fetch.
    """
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key: return "API Key missing."
    
    genai.configure(api_key=api_key)
    
    net_worth = financial_data.get('real_time_net_worth', 0)
    market_news = get_market_news()

    system_instruction = f"""
    You are the FHQ AI Analyst. Provide a section titled `### Market Intelligence` with 2 concise sentences connecting the daily news to the user's financial profile.
    
    CONTEXT:
    - Net Worth: ${net_worth:,.2f}
    - Market News: {market_news}
    
    RULES:
    1. Respond with ONLY the Market Intelligence section. 
    2. No filler. Max 300 characters.
    """
    
    system_instruction = _sanitize_for_ai(system_instruction)
    
    try:
        model = genai.GenerativeModel('gemini-1.5-flash', system_instruction=system_instruction)
        response = model.generate_content("Connect market news to my profile.", request_options={"timeout": 12})
        return response.text.strip()
    except Exception as e:
        logging.error(f"News Generation Error: {e}")
        return "### Market Intelligence\nMarket news analysis is currently unavailable. Please try again later."

def generate_health_brief(financial_data, brief_type="morning", section="all"):
    """
    Legacy wrapper / Single entry point for backward compatibility.
    """
    if section == "news":
        return generate_market_intelligence(financial_data)
    elif section == "overview":
        return generate_overview(financial_data, brief_type)
    else:
        # 'all' combination
        overview = generate_overview(financial_data, brief_type)
        news = generate_market_intelligence(financial_data)
        return f"{overview}\n\n{news}"
