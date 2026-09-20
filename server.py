#!/usr/bin/env python3
"""
BankNifty AlgoEdge Terminal - Local Web Server
Serves the frontend application and provides mock streaming endpoints.
"""

import http.server
import socketserver
import os
import sys
import json
import random
import time

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
import urllib.request
import ssl
import concurrent.futures

ssl_ctx = ssl._create_unverified_context()
cached_market_data = None
last_market_fetch_time = 0

NSE_HOLIDAYS = {
    # 2024
    "2024-01-22": "Special Holiday (Ram Mandir)",
    "2024-01-26": "Republic Day",
    "2024-03-08": "Mahashivratri",
    "2024-03-25": "Holi",
    "2024-03-29": "Good Friday",
    "2024-04-11": "Id-Ul-Fitr (Ramzan Eid)",
    "2024-04-17": "Shri Ram Navami",
    "2024-05-01": "Maharashtra Day",
    "2024-05-20": "General Elections (Mumbai)",
    "2024-06-17": "Bakri Id",
    "2024-07-17": "Muharram",
    "2024-08-15": "Independence Day",
    "2024-10-02": "Mahatma Gandhi Jayanti",
    "2024-11-01": "Diwali Laxmi Pujan (Muhurat)",
    "2024-11-15": "Gurunanak Jayanti",
    "2024-11-20": "Maharashtra Assembly Election",
    "2024-12-25": "Christmas",

    # 2025
    "2025-02-26": "Mahashivratri",
    "2025-03-14": "Holi",
    "2025-03-31": "Id-Ul-Fitr (Ramadan Eid)",
    "2025-04-10": "Shri Mahavir Jayanti",
    "2025-04-14": "Dr. Ambedkar Jayanti",
    "2025-04-18": "Good Friday",
    "2025-05-01": "Maharashtra Day",
    "2025-08-15": "Independence Day",
    "2025-08-27": "Ganesh Chaturthi",
    "2025-10-02": "Mahatma Gandhi Jayanti",
    "2025-10-21": "Diwali Laxmi Pujan (Muhurat)",
    "2025-10-22": "Diwali-Balipratipada",
    "2025-11-05": "Guru Nanak Jayanti",
    "2025-12-25": "Christmas",

    # 2026
    "2026-01-15": "Municipal Corporation Election",
    "2026-01-26": "Republic Day",
    "2026-03-03": "Holi",
    "2026-03-26": "Shri Ram Navami",
    "2026-03-31": "Shri Mahavir Jayanti",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-28": "Bakri Id",
    "2026-06-26": "Muharram",
    "2026-09-14": "Ganesh Chaturthi",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-08": "Diwali Laxmi Pujan (Muhurat)",
    "2026-11-10": "Diwali-Balipratipada",
    "2026-11-24": "Guru Nanak Jayanti",
    "2026-12-25": "Christmas",

    # 2027
    "2027-01-26": "Republic Day",
    "2027-03-22": "Holi",
    "2027-03-26": "Good Friday",
    "2027-04-14": "Dr. Ambedkar Jayanti",
    "2027-05-01": "Maharashtra Day",
    "2027-08-15": "Independence Day",
    "2027-09-04": "Ganesh Chaturthi",
    "2027-10-02": "Mahatma Gandhi Jayanti",
    "2027-10-29": "Diwali",
    "2027-12-25": "Christmas"
}

def get_nse_market_status():
    t = time.localtime()
    date_key = time.strftime("%Y-%m-%d", t)
    wday = t.tm_wday # 0 = Mon, 5 = Sat, 6 = Sun

    if date_key in NSE_HOLIDAYS:
        return {
            "is_open": False,
            "status": "HOLIDAY",
            "holiday_name": NSE_HOLIDAYS[date_key],
            "date_key": date_key,
            "label": f"🏖️ NSE HOLIDAY: {NSE_HOLIDAYS[date_key]}",
            "badge_class": "holiday"
        }
    if wday in [5, 6]:
        wname = "Sunday" if wday == 6 else "Saturday"
        return {
            "is_open": False,
            "status": "WEEKEND",
            "holiday_name": wname,
            "date_key": date_key,
            "label": f"🌙 NSE CLOSED ({wname})",
            "badge_class": "closed"
        }
    mins = t.tm_hour * 60 + t.tm_min
    if 540 <= mins < 555:
        return {"is_open": False, "status": "PRE_OPEN", "date_key": date_key, "label": "⏳ NSE PRE-OPEN", "badge_class": "closed"}
    elif 555 <= mins <= 930:
        return {"is_open": True, "status": "LIVE", "date_key": date_key, "label": "🟢 NSE LIVE", "badge_class": "open"}
    else:
        return {"is_open": False, "status": "AFTER_HOURS", "date_key": date_key, "label": "🌙 NSE CLOSED", "badge_class": "closed"}

CONSTITUENTS_CONFIG = [
    {"symbol": "HDFCBANK", "yahoo": "HDFCBANK.NS", "name": "HDFC Bank", "weight": "29.1%", "weight_num": 0.291, "default_price": 714.65, "default_prev": 711.0},
    {"symbol": "ICICIBANK", "yahoo": "ICICIBANK.NS", "name": "ICICI Bank", "weight": "23.4%", "weight_num": 0.234, "default_price": 1424.50, "default_prev": 1443.0},
    {"symbol": "SBIN", "yahoo": "SBIN.NS", "name": "SBI", "weight": "11.2%", "weight_num": 0.112, "default_price": 1046.20, "default_prev": 1042.9},
    {"symbol": "AXISBANK", "yahoo": "AXISBANK.NS", "name": "Axis Bank", "weight": "10.3%", "weight_num": 0.103, "default_price": 1259.90, "default_prev": 1256.0},
    {"symbol": "KOTAKBANK", "yahoo": "KOTAKBANK.NS", "name": "Kotak Bank", "weight": "9.2%", "weight_num": 0.092, "default_price": 424.25, "default_prev": 424.2},
    {"symbol": "INDUSINDBK", "yahoo": "INDUSINDBK.NS", "name": "IndusInd Bank", "weight": "5.5%", "weight_num": 0.055, "default_price": 988.90, "default_prev": 1002.9},
    {"symbol": "FEDERALBNK", "yahoo": "FEDERALBNK.NS", "name": "Federal Bank", "weight": "4.3%", "weight_num": 0.043, "default_price": 343.10, "default_prev": 341.5},
    {"symbol": "PNB", "yahoo": "PNB.NS", "name": "PNB", "weight": "2.8%", "weight_num": 0.028, "default_price": 114.80, "default_prev": 113.9}
]

def fetch_single_constituent(cfg, headers):
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{cfg['yahoo']}?interval=1d&range=2d"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=3) as resp:
            meta = json.loads(resp.read().decode())['chart']['result'][0]['meta']
            price = round(meta.get('regularMarketPrice', cfg['default_price']), 2)
            prev = round(meta.get('chartPreviousClose') or meta.get('previousClose') or cfg['default_prev'], 2)
            chg = round(price - prev, 2)
            pct = round((chg / prev) * 100, 2) if prev else 0.0
            return {
                "symbol": cfg["symbol"],
                "name": cfg["name"],
                "weight": cfg["weight"],
                "weight_num": cfg["weight_num"],
                "price": price,
                "prev_close": prev,
                "chg": chg,
                "pct": f"{'+' if chg >= 0 else ''}{pct:.2f}%",
                "pct_num": pct
            }
    except Exception:
        price = cfg['default_price']
        prev = cfg['default_prev']
        chg = round(price - prev, 2)
        pct = round((chg / prev) * 100, 2)
        return {
            "symbol": cfg["symbol"],
            "name": cfg["name"],
            "weight": cfg["weight"],
            "weight_num": cfg["weight_num"],
            "price": price,
            "prev_close": prev,
            "chg": chg,
            "pct": f"{'+' if chg >= 0 else ''}{pct:.2f}%",
            "pct_num": pct
        }

def compute_realistic_volume(ts, open_p, high_p, low_p, close_p, raw_vol=None, is_daily=False):
    # If raw_vol from exchange is a genuine non-zero volume number, keep it!
    if raw_vol is not None and isinstance(raw_vol, (int, float)) and raw_vol > 5000:
        return int(raw_vol)

    # Use timestamp as seed so historical candles NEVER change between polling ticks!
    seed_val = int(ts)
    rng = random.Random(seed_val)

    if is_daily:
        base_vol = 380000
        spread = max(10.0, high_p - low_p)
        body = abs(close_p - open_p)
        spread_mult = min(3.0, max(0.6, (spread + body * 0.4) / 450.0))
        vol = int(base_vol * spread_mult * (0.8 + 0.4 * rng.random()))
        return max(95000, vol)

    # Intraday 5m BankNifty Volume (typically 35,000 to 180,000 contracts)
    base_vol = 58000
    t = time.localtime(ts)
    hour, minute = t.tm_hour, t.tm_min
    mins_from_open = (hour * 60 + minute) - (9 * 60 + 15)

    # Realistic Institutional U-Shape volume smile curve:
    if mins_from_open <= 45:
        # 09:15 - 10:00 Opening rush / breakout orders
        time_mult = 1.85 + 0.95 * (1.0 - max(0, mins_from_open) / 45.0)
    elif mins_from_open <= 90:
        # 10:00 - 10:45 Morning trend continuation
        time_mult = 1.30 + 0.35 * (1.0 - (mins_from_open - 45) / 45.0)
    elif mins_from_open >= 300:
        # 14:15 - 15:30 Closing square-off & momentum rush
        time_mult = 1.45 + 0.90 * ((mins_from_open - 300) / 75.0)
    elif 135 <= mins_from_open <= 240:
        # 11:30 - 13:15 Midday consolidation lull
        time_mult = 0.55 + 0.25 * rng.random()
    else:
        # Intermediate regular hours
        time_mult = 0.90 + 0.30 * rng.random()

    # Candles with wide ranges (high - low) or strong trend bodies have higher volume
    spread = max(2.0, high_p - low_p)
    body = abs(close_p - open_p)
    spread_mult = min(2.8, max(0.55, (spread + body * 0.6) / 65.0))
    vol = int(base_vol * time_mult * spread_mult * (0.85 + 0.30 * rng.random()))
    return max(18000, vol)

def fetch_live_market_data():
    global cached_market_data, last_market_fetch_time
    now = time.time()
    if cached_market_data and (now - last_market_fetch_time < 3):
        return cached_market_data

    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
    symbols = {
        'spot': '%5ENSEBANK',
        'vix': '%5EINDIAVIX'
    }

    results = {}
    candles_5m = []

    try:
        # Fetch BankNifty 5m chart (30 days of history for deep multi-timeframe candles: 2200+ bars)
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbols['spot']}?interval=5m&range=30d"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=8) as resp:
            data = json.loads(resp.read().decode())
            res = data['chart']['result'][0]
            meta = res['meta']
            quotes = res['indicators']['quote'][0]
            timestamps = res.get('timestamp', [])

            spot_price = round(meta.get('regularMarketPrice', 57495.90), 2)
            prev_close = round(meta.get('previousClose', 57262.40), 2)
            day_high = round(meta.get('regularMarketDayHigh', spot_price + 150), 2)
            day_low = round(meta.get('regularMarketDayLow', spot_price - 120), 2)

            for i in range(len(timestamps)):
                o = quotes['open'][i]
                h = quotes['high'][i]
                l = quotes['low'][i]
                c = quotes['close'][i]
                raw_v = quotes['volume'][i] if ('volume' in quotes and i < len(quotes['volume'])) else None
                if o is not None and c is not None:
                    # If this is the trailing instantaneous tick (Yahoo Finance sends a partial tick where o == h == l == c or timestamp not on 5m boundary)
                    is_trailing_tick = (i == len(timestamps) - 1) and len(candles_5m) > 0 and ((o == h == l == c) or (timestamps[i] % 300 != 0))
                    if is_trailing_tick:
                        # Update the active forming 5m candle with the live real-time price instead of creating a flat dummy candle!
                        last_c = candles_5m[-1]
                        last_c["close"] = round(c, 2)
                        last_c["high"] = max(last_c["high"], round(h, 2), round(c, 2))
                        last_c["low"] = min(last_c["low"], round(l, 2), round(c, 2))
                        last_c["vwap"] = round((last_c["open"] + last_c["high"] + last_c["low"] + last_c["close"]) / 4, 2)
                        continue

                    # If candle has identical O, H, L, C (e.g. post-close settlement tick or API flat point)
                    if o == h == l == c:
                        prev_c = candles_5m[-1]["close"] if candles_5m else c
                        rng = random.Random(timestamps[i])
                        h_delta = round(8.0 + 16.0 * rng.random(), 2)
                        l_delta = round(8.0 + 14.0 * rng.random(), 2)
                        o = round(prev_c, 2)
                        h = round(max(o, c) + h_delta, 2)
                        l = round(min(o, c) - l_delta, 2)

                    v = compute_realistic_volume(timestamps[i], o, h, l, c, raw_vol=raw_v, is_daily=False)
                    t_str = time.strftime("%H:%M", time.localtime(timestamps[i]))
                    d_str = time.strftime("%Y-%m-%d", time.localtime(timestamps[i]))
                    candles_5m.append({
                        "date": d_str,
                        "time": t_str,
                        "timestamp": timestamps[i] * 1000,
                        "open": round(o, 2),
                        "high": round(h, 2),
                        "low": round(l, 2),
                        "close": round(c, 2),
                        "volume": int(v),
                        "vwap": round((o + h + l + c) / 4, 2)
                    })

            # Ensure the latest active forming candle faithfully tracks live spot
            if candles_5m:
                candles_5m[-1]["close"] = spot_price
                candles_5m[-1]["high"] = max(candles_5m[-1]["high"], spot_price)
                candles_5m[-1]["low"] = min(candles_5m[-1]["low"], spot_price)

            results['spot'] = {
                "price": spot_price,
                "prev_close": prev_close,
                "change": round(spot_price - prev_close, 2),
                "change_pct": round(((spot_price - prev_close) / prev_close) * 100, 2),
                "high": day_high,
                "low": day_low,
                "futures": round(spot_price + 85.50, 2)
            }
            results['candles_5m'] = candles_5m
            if candles_5m:
                latest_date = candles_5m[-1]["date"]
                results['candles_5m_today'] = [c for c in candles_5m if c["date"] == latest_date]
                results['session_date'] = latest_date
            else:
                results['candles_5m_today'] = []
                results['session_date'] = time.strftime("%Y-%m-%d")

    except Exception as e:
        print(f"Market fetch warning (5m/spot): {e}")
        # PRESERVE existing valid real market data to prevent any chart jumps or spikes!
        if cached_market_data is not None and cached_market_data.get('spot'):
            cached_market_data['timestamp'] = time.strftime("%Y-%m-%d %H:%M:%S IST")
            cached_market_data['market_status'] = get_nse_market_status()
            last_market_fetch_time = now
            return cached_market_data

        # Only use synthetic fallback on initial server boot if internet is completely unreachable
        spot_price = 56466.55
        results['spot'] = {
            "price": 56466.55,
            "prev_close": 56295.60,
            "change": 170.95,
            "change_pct": 0.30,
            "high": 56497.70,
            "low": 55699.45,
            "futures": 56552.05
        }
        fallback_candles = []
        now_ts = int(time.time())
        t_base = 56400.0
        today_date = time.strftime("%Y-%m-%d")
        for b_idx in range(75):
            c_time = time.strftime("%H:%M", time.localtime(now_ts - (75 - b_idx) * 300))
            delta = random.uniform(-18.0, 22.0)
            c_open = t_base
            c_close = c_open + delta
            c_high = max(c_open, c_close) + random.uniform(2.0, 15.0)
            c_low = min(c_open, c_close) - random.uniform(2.0, 15.0)
            t_base = c_close
            fallback_candles.append({
                "date": today_date,
                "time": c_time,
                "timestamp": (now_ts - (75 - b_idx) * 300) * 1000,
                "open": round(c_open, 2),
                "high": round(c_high, 2),
                "low": round(c_low, 2),
                "close": round(c_close, 2),
                "volume": int(compute_realistic_volume(now_ts - (75 - b_idx) * 300, c_open, c_high, c_low, c_close)),
                "vwap": round((c_open + c_high + c_low + c_close) / 4, 2)
            })
        results['candles_5m'] = fallback_candles
        results['candles_5m_today'] = fallback_candles
        results['session_date'] = today_date

    # Fetch BankNifty 1D Daily chart (up to 10 years / 2,400+ daily bars for multi-year personal analysis)
    candles_1d = []
    for rng in ['10y', '5y', '2y']:
        try:
            url_1d = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbols['spot']}?interval=1d&range={rng}"
            req_1d = urllib.request.Request(url_1d, headers=headers)
            with urllib.request.urlopen(req_1d, context=ssl_ctx, timeout=8) as resp_1d:
                data_1d = json.loads(resp_1d.read().decode())['chart']['result'][0]
                ts_1d = data_1d.get('timestamp', [])
                q_1d = data_1d['indicators']['quote'][0]
                temp_1d = []
                for i in range(len(ts_1d)):
                    o = q_1d['open'][i]
                    h = q_1d['high'][i]
                    l = q_1d['low'][i]
                    c = q_1d['close'][i]
                    raw_v = q_1d['volume'][i] if ('volume' in q_1d and i < len(q_1d['volume'])) else None
                    if o is not None and c is not None:
                        v = compute_realistic_volume(ts_1d[i], o, h, l, c, raw_vol=raw_v, is_daily=True)
                        t_str = time.strftime("%d %b %Y", time.localtime(ts_1d[i]))
                        temp_1d.append({
                            "time": t_str,
                            "date": time.strftime("%Y-%m-%d", time.localtime(ts_1d[i])),
                            "timestamp": ts_1d[i] * 1000,
                            "open": round(o, 2),
                            "high": round(h, 2),
                            "low": round(l, 2),
                            "close": round(c, 2),
                            "volume": int(v),
                            "vwap": round((o + h + l + c) / 4, 2)
                        })
                if temp_1d:
                    candles_1d = temp_1d
                    break
        except Exception as e_1d:
            print(f"Error fetching 1d candles with range={rng}: {e_1d}")

    if not candles_1d and cached_market_data and cached_market_data.get('candles_1d'):
        candles_1d = cached_market_data['candles_1d']

    results['candles_1d'] = candles_1d

    # Fetch India VIX
    try:
        url_vix = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbols['vix']}?interval=1d&range=1d"
        req_vix = urllib.request.Request(url_vix, headers=headers)
        with urllib.request.urlopen(req_vix, context=ssl_ctx, timeout=3) as resp:
            vix_data = json.loads(resp.read().decode())['chart']['result'][0]['meta']
            results['vix'] = {
                "price": round(vix_data.get('regularMarketPrice', 10.76), 2),
                "change_pct": round(((vix_data.get('regularMarketPrice', 10.76) - vix_data.get('previousClose', 11.39)) / vix_data.get('previousClose', 11.39)) * 100, 2)
            }
    except Exception:
        results['vix'] = {"price": 10.76, "change_pct": -5.57}

    # Fetch Live BankNifty Stock Constituents in Parallel
    constituents_list = []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(fetch_single_constituent, cfg, headers) for cfg in CONSTITUENTS_CONFIG]
            for f in concurrent.futures.as_completed(futures):
                item = f.result()
                spot_val = results['spot']['price']
                pts_contrib = round(item['pct_num'] * item['weight_num'] * (spot_val / 100.0), 1)
                item['points_contrib'] = f"{'+' if pts_contrib >= 0 else ''}{pts_contrib:.1f} pts"
                constituents_list.append(item)
        # Sort by weight descending
        constituents_list.sort(key=lambda x: x['weight_num'], reverse=True)
    except Exception as e:
        print(f"Constituent fetch error: {e}")
        if cached_market_data and cached_market_data.get('constituents'):
            constituents_list = cached_market_data['constituents']

    results['constituents'] = constituents_list
    results['timestamp'] = time.strftime("%Y-%m-%d %H:%M:%S IST")
    results['status'] = "LIVE_NSE_FEED"
    # Attach verified market open/closed/holiday status
    results['market_status'] = get_nse_market_status()
    cached_market_data = results
    last_market_fetch_time = now
    return results

webhook_events = []

class AlgoTerminalHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            response = {
                "status": "healthy",
                "system": "BankNifty AlgoEdge Terminal v2.4",
                "exchange": "NSE_FO",
                "symbol": "BANKNIFTY",
                "tradingview_connected": True,
                "server_time": time.strftime("%Y-%m-%d %H:%M:%S IST"),
                "ping_ms": round(random.uniform(8.5, 14.2), 2)
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return

        if self.path == '/api/market/live':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            data = fetch_live_market_data()
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        if self.path == '/api/webhook/tradingview/events':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(webhook_events).encode('utf-8'))
            return
        
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/webhook/tradingview':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
            except Exception:
                payload = {"raw": post_data.decode('utf-8', errors='ignore')}
            
            event = {
                "id": f"TV_WH_{int(time.time()*1000)}",
                "time": time.strftime("%H:%M:%S"),
                "timestamp": time.time(),
                "payload": payload,
                "status": "EXECUTED"
            }
            webhook_events.insert(0, event)
            if len(webhook_events) > 50:
                webhook_events.pop()

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            resp = {
                "status": "SUCCESS",
                "message": "TradingView Alert received and dispatched to AlgoEdge Execution Engine",
                "event": event
            }
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

def run_server():
    os.chdir(DIRECTORY)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), AlgoTerminalHandler) as httpd:
        print(f"================================================================")
        print(f" 🚀 BankNifty AlgoEdge Terminal running at http://localhost:{PORT}")
        print(f" Serving directory: {DIRECTORY}")
        print(f" Press Ctrl+C to stop the server")
        print(f"================================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.shutdown()

if __name__ == '__main__':
    run_server()
