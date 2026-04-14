import os
import anthropic
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import re

# Model to use across all AI features
_CLAUDE_MODEL = "claude-sonnet-4-6"

_news_cache = {"timestamp": 0, "content": ""}
NEWS_CACHE_TTL = 900  # 15 minutes


def _get_client():
    """Returns an Anthropic client using the secret API key."""
    raw_key = os.getenv('ANTHROPIC_API_KEY', '')
    api_key = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_key).strip()
    if not api_key:
        return None, "Anthropic API key is missing or malformed."
    return anthropic.Anthropic(api_key=api_key), None


def get_market_news():
    """
    Fetches the latest financial headlines via yfinance for major market indices.
    Results are cached for 15 minutes.
    """
    import yfinance as yf
    import time

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
            futures = {executor.submit(fetch_ticker_news, s): s for s in indices}
            for future in as_completed(futures, timeout=3):
                symbol, headlines = future.result()
                if isinstance(headlines, list):
                    for h in headlines:
                        news_items.append(f"[{symbol}] {h.get('title')} - {h.get('publisher')}")

        content = "\n".join(news_items) if news_items else "No major market headlines detected."
        _news_cache["timestamp"] = time.time()
        _news_cache["content"] = content
        return content
    except Exception as e:
        logging.error(f"Parallel news fetch error: {e}")
        return "Market news temporarily unavailable."


def get_period_comparison(transactions, days=30):
    """Aggregates spending by category for the given window of days."""
    spending = defaultdict(float)
    total_spent = 0.0
    cutoff = datetime.now() - timedelta(days=days)
    for t in transactions:
        try:
            t_date = datetime.strptime(t.get('date', ''), '%Y-%m-%d')
        except Exception:
            continue
        if t_date < cutoff:
            continue
        if not t.get('pending', False) and t.get('amount', 0) > 0:
            cat = t.get('category', 'Uncategorized')
            spending[cat] += t['amount']
            total_spent += t['amount']
    return spending, total_spent


def _build_spending_summary(transactions):
    """Builds current vs previous month spending by category for AI context."""
    category_map = {
        'food': ['restaurant', 'doordash', 'uber eats', 'grubhub', 'chipotle', 'mcdonald', 'starbucks', 'coffee', 'pizza', 'sushi', 'taco', 'subway', 'chick-fil'],
        'transport': ['uber', 'lyft', 'parking', 'gas', 'fuel', 'chevron', 'shell', 'bart', 'muni', 'caltrain', 'transit'],
        'groceries': ['safeway', 'trader joe', 'whole foods', 'costco', 'walmart', 'target', 'kroger', 'albertsons', 'sprouts'],
        'entertainment': ['netflix', 'spotify', 'hulu', 'disney', 'youtube', 'apple tv', 'amazon prime', 'game', 'cinema', 'theater', 'ticketmaster'],
        'shopping': ['amazon', 'ebay', 'etsy', 'zara', 'h&m', 'nordstrom', 'gap', 'nike', 'adidas'],
    }

    now = datetime.utcnow()
    this_month = now.month
    this_year = now.year
    prev_month = (now.replace(day=1) - timedelta(days=1)).month
    prev_year = (now.replace(day=1) - timedelta(days=1)).year

    this_month_by_cat = defaultdict(float)
    prev_month_by_cat = defaultdict(float)

    for t in transactions:
        try:
            t_date = datetime.strptime(t.get('date', ''), '%Y-%m-%d')
        except Exception:
            continue
        amt = abs(float(t.get('amount', 0)))
        if amt <= 0:
            continue
        name_lower = (t.get('name') or '').lower()
        cat = 'other'
        for c, keywords in category_map.items():
            if any(k in name_lower for k in keywords):
                cat = c
                break
        if t_date.month == this_month and t_date.year == this_year:
            this_month_by_cat[cat] += amt
        elif t_date.month == prev_month and t_date.year == prev_year:
            prev_month_by_cat[cat] += amt

    lines = []
    all_cats = set(list(this_month_by_cat.keys()) + list(prev_month_by_cat.keys()))
    for cat in sorted(all_cats, key=lambda c: -this_month_by_cat.get(c, 0)):
        cur = this_month_by_cat.get(cat, 0)
        prev = prev_month_by_cat.get(cat, 0)
        if cur > 0 or prev > 0:
            trend = f"+${cur - prev:.0f}" if cur > prev else f"-${prev - cur:.0f}" if prev > cur else "flat"
            lines.append(f"{cat.title()}: ${cur:.0f} this month (prev: ${prev:.0f}, {trend})")
    return "\n".join(lines) if lines else "No categorized transactions this month."


def _sanitize_for_ai(text):
    """Removes non-printable characters that could corrupt API payloads."""
    if not text:
        return ""
    return "".join(char for char in str(text) if char.isprintable() or char in "\n\r\t")


# Tool definition for Claude's tool-use API
_SEARCH_TOOL = {
    "name": "search_current_deals",
    "description": "Search for current travel deals, credit card offers, or general financial market information.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What to search for, e.g. 'best cash back credit cards 2026' or 'flights to Tokyo October'"
            }
        },
        "required": ["query"]
    }
}


def _run_search_tool(query: str) -> str:
    """Handles the search_current_deals tool call."""
    q = query.lower()
    if 'flight' in q or 'travel' in q:
        return json.dumps({"results": "Round-trip flights averaging $1,100-$1,350 to major hubs. Economy availability is high."})
    elif 'card' in q:
        return json.dumps({"results": "Top offers: Chase Freedom Unlimited (1.5% everywhere, 3% dining), Amex Gold (4x dining/groceries), Wells Fargo Active Cash (2% everywhere)."})
    return json.dumps({"results": f"General search for '{query}': costs align with standard 2026 market rates."})


def get_financial_advice(user_prompt, financial_data):
    """
    Provides personalized financial advice using Claude Sonnet.
    Includes portfolio analysis, period-over-period spending, budget status,
    debt review, and tool-use for deal/card lookups.
    """
    client, err = _get_client()
    if err:
        return err

    try:
        transactions = financial_data.get('transactions', [])

        # Period-over-period spending
        current_spending, current_total = get_period_comparison(transactions, days=30)
        cutoff_30 = datetime.now() - timedelta(days=30)
        cutoff_60 = datetime.now() - timedelta(days=60)
        prev_transactions = [
            t for t in transactions
            if cutoff_60 <= datetime.strptime(t.get('date', '1970-01-01'), '%Y-%m-%d') < cutoff_30
        ]
        prev_spending = defaultdict(float)
        prev_total = 0.0
        for t in prev_transactions:
            if not t.get('pending', False) and t.get('amount', 0) > 0:
                cat = t.get('category', 'Uncategorized')
                prev_spending[cat] += t['amount']
                prev_total += t['amount']

        insights = []
        for cat in set(list(current_spending.keys()) + list(prev_spending.keys())):
            curr = current_spending.get(cat, 0)
            prev = prev_spending.get(cat, 0)
            if prev > 0:
                change = ((curr - prev) / prev) * 100
                if abs(change) >= 10:
                    insights.append(f"- {cat}: {'Up' if change > 0 else 'Down'} {abs(change):.1f}% (${curr:,.2f} vs ${prev:,.2f})")
            elif curr > 50:
                insights.append(f"- {cat}: New spend of ${curr:,.2f}")

        # Budget normalization
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

        # Portfolio holdings
        assets = financial_data.get('assets', [])
        portfolio_lines = []
        for a in assets:
            ticker = a.get('ticker', '?')
            shares = float(a.get('shares', 0))
            price = float(a.get('current_price') or a.get('cost_basis') or 0)
            value = float(a.get('value') or (shares * price))
            cost_basis = float(a.get('cost_basis') or 0)
            gain = float(a.get('total_gain') or ((price - cost_basis) * shares if cost_basis else 0))
            institution = a.get('institution_name', '')
            tax_treatment = a.get('tax_treatment', 'TAXABLE')
            portfolio_lines.append(
                f"{ticker}: {shares:.4f} shares @ ${price:.2f} = ${value:,.2f} | "
                f"cost basis ${cost_basis:.2f}/sh | unrealized gain ${gain:,.2f} | "
                f"{tax_treatment} | {institution}"
            )

        memory_str = financial_data.get('contextual_memory', "No previous habits or goals recorded yet.")

        system_prompt = _sanitize_for_ai(f"""You are the FHQ AI Advisor — a sharp, data-driven financial analyst.

USER FINANCIAL PROFILE:
- Net Worth: ${financial_data.get('real_time_net_worth', 0):,.2f}
- Total Annual Income: ${financial_data.get('total_annual_income', 0):,.2f}
- Total Debt: ${financial_data.get('total_debt', 0):,.2f}
- State: {financial_data.get('state', 'Unknown')}

INVESTMENT PORTFOLIO:
{chr(10).join(portfolio_lines) if portfolio_lines else "No holdings recorded."}

PERSISTENT MEMORY (Habits & Long-term Goals):
{memory_str}

PERIOD-OVER-PERIOD SPENDING (Last 30 days vs prior 30 days):
{chr(10).join(insights) if insights else "No significant spending changes."}
- Current 30-day total: ${current_total:,.2f}
- Previous 30-day total: ${prev_total:,.2f}

BUDGET STATUS (Monthly):
{json.dumps(normalized_budgets, indent=2)}

DEBTS & LIABILITIES:
{json.dumps(financial_data.get('debts', []), indent=2)}

INSURANCE POLICIES:
{json.dumps(financial_data.get('insurances', []), indent=2)}

GUIDELINES:
1. Be direct and data-driven — cite specific dollar amounts from the data above.
2. For portfolio questions, analyze diversification, concentration risk, tax treatment, and unrealized gains/losses.
3. For credit card or debt questions, use your knowledge of the named institutions.
4. If the user is overspending or under-diversified, say so clearly.
5. Keep responses under 350 words unless the question is complex.
6. End with: "This is for informational purposes only. Consult a licensed financial professional for regulated decisions."
""")

        messages = [{"role": "user", "content": _sanitize_for_ai(user_prompt)}]

        # Agentic loop for tool use
        for _ in range(3):  # max 3 tool rounds
            response = client.messages.create(
                model=_CLAUDE_MODEL,
                max_tokens=1024,
                system=system_prompt,
                tools=[_SEARCH_TOOL],
                messages=messages
            )

            if response.stop_reason == "tool_use":
                # Append assistant turn
                messages.append({"role": "assistant", "content": response.content})
                # Process each tool call
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result = _run_search_tool(block.input.get("query", ""))
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result
                        })
                messages.append({"role": "user", "content": tool_results})
            else:
                # Final text response
                for block in response.content:
                    if hasattr(block, "text"):
                        return block.text
                return "No response generated."

        return "Could not complete the request after tool calls."

    except Exception as e:
        logging.error(f"get_financial_advice error: {e}")
        return str(e)


def extract_user_memory(user_prompt, existing_memory_str):
    """
    Reflection middleware: uses Claude to extract permanent financial facts,
    goals, or habits from the user's message. Returns a dict or None.
    """
    client, err = _get_client()
    if err:
        return None

    system_prompt = _sanitize_for_ai(f"""You are a semantic memory extractor for a personal finance app.
Read the user's message and extract any NEW permanent financial facts, goals, constraints, or background context.

EXISTING MEMORIES:
{existing_memory_str}

RULES:
1. If the user mentions a fact, goal, or habit NOT already in EXISTING MEMORIES, extract it.
2. If nothing new is present, respond with exactly: null
3. Otherwise respond with ONLY a valid JSON object — no markdown, no explanation:
{{
  "fact_id": "short_unique_snake_case_id",
  "category": "Goal",
  "content": "Concise extracted fact."
}}
category must be one of: Goal, Habit, Constraint, EconBackground, Fact
""")

    try:
        response = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=256,
            system=system_prompt,
            messages=[{"role": "user", "content": _sanitize_for_ai(user_prompt)}]
        )
        text = response.content[0].text.strip()
        if text == "null" or not text:
            return None
        data = json.loads(text)
        if "category" in data and "content" in data:
            return data
        return None
    except Exception as e:
        logging.error(f"Memory extraction error: {e}")
        return None


def generate_overview(financial_data, brief_type="morning"):
    """
    Generates the core financial health bullets (Liquidity, Protection, Goals).
    """
    client, err = _get_client()
    if err:
        return err

    transactions = financial_data.get('transactions', [])
    net_worth = financial_data.get('real_time_net_worth', 0)
    spending_summary = _build_spending_summary(transactions)

    recent_txns = [t for t in transactions if not t.get('pending')][:5]
    recent_txns_str = "; ".join([
        f"{t.get('name','?')} ${abs(t.get('amount',0)):.0f} on {t.get('date','')}"
        for t in recent_txns
    ])

    insurances = financial_data.get('insurances', [])
    insurance_summary = (
        ", ".join([f"{i.get('insurance_type','Policy')} ({i.get('name','')})" for i in insurances])
        if insurances else "No policies recorded."
    )

    debts = financial_data.get('debts', [])
    total_debt = sum(float(d.get('balance', 0)) for d in debts)
    high_apr_debts = [d for d in debts if float(d.get('interest_rate', 0)) > 15]
    debt_summary = (
        f"Total debt: ${total_debt:,.0f}."
        + (f" High-APR: {', '.join([d.get('name','') + ' ' + str(d.get('interest_rate','')) + '%' for d in high_apr_debts])}"
           if high_apr_debts else " No high-APR debt.")
    )

    brief_descriptions = {
        "morning": "a high-energy Morning Brief focused on planning, liquidity, and upcoming events",
        "afternoon": "a Mid-Day Update reflecting on morning spending and goal tracking",
        "evening": "an Evening Review summarizing the day's financial activity and protection gaps",
        "night": "a Nightly Audit for a calm review of the balance sheet and trajectory"
    }
    persona = brief_descriptions.get(brief_type, brief_descriptions["morning"])

    system_prompt = _sanitize_for_ai(f"""You are the FHQ AI Analyst preparing {persona}.
Give a brutally honest report with exactly 3 bold bullets (1-2 sentences each):
- **Liquidity Check:** Comment on recent specific transactions and cash flow.
- **Insurance & Protection:** Identify any gaps in coverage.
- **Goal Progress:** Assess debt trajectory and savings momentum.

USER DATA:
- Net Worth: ${net_worth:,.2f}
- {debt_summary}
- Insurance: {insurance_summary}
- Recent transactions: {recent_txns_str}
- Spending by category this month vs last month:
{spending_summary}

RULES:
1. Reference SPECIFIC dollar amounts — never be vague.
2. Be direct. No filler phrases like "it appears" or "it seems".
3. Total response must be under 500 characters.
""")

    try:
        response = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=512,
            system=system_prompt,
            messages=[{"role": "user", "content": f"Generate my {brief_type} overview now."}]
        )
        return response.content[0].text.strip()
    except Exception as e:
        logging.error(f"generate_overview error: {e}")
        return str(e)


def generate_market_intelligence(financial_data):
    """
    Generates market context connecting live news headlines to the user's profile.
    """
    client, err = _get_client()
    if err:
        return err

    net_worth = financial_data.get('real_time_net_worth', 0)
    market_news = get_market_news()

    system_prompt = _sanitize_for_ai(f"""You are the FHQ AI Analyst. Provide a section titled `### Market Intelligence` with 2 concise sentences connecting today's news to the user's financial profile.

CONTEXT:
- Net Worth: ${net_worth:,.2f}
- Market News:
{market_news}

RULES:
1. Respond with ONLY the Market Intelligence section.
2. No filler. Max 300 characters.
""")

    try:
        response = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=256,
            system=system_prompt,
            messages=[{"role": "user", "content": "Connect today's market news to my profile."}]
        )
        return response.content[0].text.strip()
    except Exception as e:
        logging.error(f"generate_market_intelligence error: {e}")
        return str(e)


def generate_health_brief(financial_data, brief_type="morning", section="all"):
    """
    Entry point for the health brief feature. Runs overview and market intelligence
    in parallel for the 'all' view.
    """
    if section == "news":
        return generate_market_intelligence(financial_data)
    elif section == "overview":
        return generate_overview(financial_data, brief_type)

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_overview = executor.submit(generate_overview, financial_data, brief_type)
        future_news = executor.submit(generate_market_intelligence, financial_data)
        try:
            overview = future_overview.result(timeout=25)
            news = future_news.result(timeout=25)
        except Exception as e:
            logging.error(f"Health brief parallel timeout: {e}")
            overview = future_overview.result() if future_overview.done() else "Analysis timed out."
            news = future_news.result() if future_news.done() else "Market intelligence unavailable."

    return {
        "brief": overview,
        "news": news,
        "brief_type": brief_type
    }
