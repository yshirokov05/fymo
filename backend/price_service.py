import logging
import time
from concurrent.futures import ThreadPoolExecutor

# ARCH-1: Simple in-memory cache for ticker prices (5-minute TTL)
_price_cache = {}
CACHE_TTL_SECONDS = 300 # 5 minutes

def get_current_price(ticker_symbol):
    """
    Fetches the current market price and daily change for a given ticker symbol using yfinance.
    Returns a dict with current_price, daily_change_usd, daily_change_percent.
    Uses an in-memory cache to avoid redundant hits.
    """
    import yfinance as yf
    
    if not ticker_symbol:
        return None
        
    # Standardize ticker
    ticker_symbol = ticker_symbol.upper().strip()
    
    # 1. Handle Cash & Money Market
    if ticker_symbol in ['CASH', 'CUR:USD', 'USD', 'VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'CASH:USD', 'VMFXX']:
        return {
            'current_price': 1.0,
            'daily_change_usd': 0.0,
            'daily_change_percent': 0.0,
            'sector': 'Financial Services'
        }

    # 2. Check Cache
    cached_data = _price_cache.get(ticker_symbol)
    if cached_data:
        timestamp, data = cached_data
        if time.time() - timestamp < CACHE_TTL_SECONDS:
            logging.debug(f"Cache hit for {ticker_symbol}")
            return data

    try:
        ticker = yf.Ticker(ticker_symbol)
        # Fetch 2 days to get previous close
        hist = ticker.history(period='2d')
        
        if hist.empty or len(hist) < 1:
            return None
            
        current_price = float(hist['Close'].iloc[-1])
        
        # Calculate daily change if 2 days of data are available
        if len(hist) >= 2:
            prev_close = float(hist['Close'].iloc[-2])
            daily_change_usd = current_price - prev_close
            daily_change_percent = (daily_change_usd / prev_close) * 100
        else:
            daily_change_usd = 0.0
            daily_change_percent = 0.0

        # Fetch sector/industry info (Optimized with timeout to prevent hangs)
        sector = 'Other'
        try:
            # Ticker.info is notoriously slow; we isolate it to prevent blocking the entire sync
            with ThreadPoolExecutor(max_workers=1) as sub_executor:
                info_future = sub_executor.submit(lambda: ticker.info)
                info = info_future.result(timeout=2.0)
                sector = info.get('sector')
                if not sector:
                    # Fallback for ETFs and Mutual Funds
                    sector = info.get('category') or info.get('fund_family') or info.get('quoteType', 'Other').replace('_', ' ').capitalize()
        except Exception:
            logging.warning(f"Timeout or error fetching metadata for {ticker_symbol}. Using 'Other'.")

        result = {
            'current_price': round(current_price, 2),
            'daily_change_usd': round(daily_change_usd, 2),
            'daily_change_percent': round(daily_change_percent, 2),
            'sector': sector or 'Other'
        }
        
        # Update Cache
        _price_cache[ticker_symbol] = (time.time(), result)
        return result
        
    except Exception as e:
        logging.error(f"Error fetching price for {ticker_symbol}: {e}")
        return None

def get_multiple_prices(tickers):
    """
    ARCH-1: Parallel price fetching for multiple tickers.
    Deduplicates tickers and uses a ThreadPoolExecutor.
    """
    unique_tickers = list(set([t.upper().strip() for t in tickers if t]))
    if not unique_tickers:
        return {}
        
    results = {}
    
    # Reduced max_workers to be more Cloud Function friendly (less resource contention)
    with ThreadPoolExecutor(max_workers=5) as executor:
        # map returns results in the same order as unique_tickers
        future_to_ticker = {executor.submit(get_current_price, t): t for t in unique_tickers}
        
        # Hard cap at 12 seconds for the entire batch to avoid function timeout
        start_time = time.time()
        for future in future_to_ticker:
            ticker = future_to_ticker[future]
            elapsed = time.time() - start_time
            remaining = max(0.1, 12 - elapsed)
            
            try:
                results[ticker] = future.result(timeout=remaining)
            except Exception as e:
                logging.error(f"Parallel fetch error or timeout for {ticker}: {e}")
                results[ticker] = None
                
    return results

def validate_ticker(ticker_symbol):
    """Returns True if ticker is valid, False otherwise."""
    if not ticker_symbol or ticker_symbol.upper() == 'CASH':
        return True
    price = get_current_price(ticker_symbol)
    return price is not None

def get_period_return(ticker_symbol, period='ytd'):
    """Returns the % price return for a ticker over a given yfinance period string."""
    import yfinance as yf
    try:
        hist = yf.Ticker(ticker_symbol.upper()).history(period=period)
        if len(hist) >= 2:
            return round(((float(hist['Close'].iloc[-1]) / float(hist['Close'].iloc[0])) - 1) * 100, 2)
        return None
    except Exception:
        return None

if __name__ == '__main__':
    # Test batch fetch
    # print(get_multiple_prices(['AAPL', 'MSFT', 'GOOGL', 'CASH']))
    pass
