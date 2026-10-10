import urllib.request, json, ssl, math, time

ssl_ctx = ssl._create_unverified_context()
headers = {'User-Agent': 'Mozilla/5.0'}
url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEBANK?interval=5m&range=5d'
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req, context=ssl_ctx) as resp:
    raw = json.loads(resp.read().decode())['chart']['result'][0]

timestamps = raw.get('timestamp', [])
quotes = raw['indicators']['quote'][0]

candles = []
for i, t in enumerate(timestamps):
    if quotes['open'][i] is not None and quotes['close'][i] is not None:
        candles.append({
            'idx': len(candles),
            'timestamp': t,
            'date': time.strftime('%Y-%m-%d', time.localtime(t)),
            'time': time.strftime('%H:%M', time.localtime(t)),
            'open': quotes['open'][i],
            'high': quotes['high'][i],
            'low': quotes['low'][i],
            'close': quotes['close'][i],
            'volume': quotes['volume'][i] or 1000
        })

def calc_supertrend(c_list, period=10, multiplier=1.0):
    n = len(c_list)
    if n == 0: return []
    tr = [0.0] * n
    tr[0] = c_list[0]['high'] - c_list[0]['low']
    for i in range(1, n):
        hl = c_list[i]['high'] - c_list[i]['low']
        hpc = abs(c_list[i]['high'] - c_list[i-1]['close'])
        lpc = abs(c_list[i]['low'] - c_list[i-1]['close'])
        tr[i] = max(hl, hpc, lpc)
    
    atr = [0.0] * n
    tr_sum = 0
    for i in range(min(period, n)):
        tr_sum += tr[i]
        atr[i] = tr_sum / (i + 1)
    for i in range(period, n):
        atr[i] = (atr[i-1] * (period - 1) + tr[i]) / period
        
    st = []
    prev_upper = 0.0
    prev_lower = 0.0
    prev_trend = 1
    for i in range(n):
        c = c_list[i]
        cur_atr = atr[i] or (c['high'] - c['low'])
        hl2 = (c['high'] + c['low']) / 2.0
        basic_upper = hl2 + multiplier * cur_atr
        basic_lower = hl2 - multiplier * cur_atr
        
        final_upper = basic_upper
        final_lower = basic_lower
        if i > 0:
            prev_close = c_list[i-1]['close']
            if basic_upper < prev_upper or prev_close > prev_upper:
                final_upper = basic_upper
            else:
                final_upper = prev_upper
            if basic_lower > prev_lower or prev_close < prev_lower:
                final_lower = basic_lower
            else:
                final_lower = prev_lower
                
        trend = prev_trend
        if i > 0:
            if prev_trend == 1 and c['close'] < prev_lower:
                trend = -1
            elif prev_trend == -1 and c['close'] > prev_upper:
                trend = 1
        else:
            trend = 1 if c['close'] >= hl2 else -1
            
        val = final_lower if trend == 1 else final_upper
        st.append({'trend': trend, 'value': val, 'signalFlip': (i > 0 and trend != prev_trend)})
        prev_upper = final_upper
        prev_lower = final_lower
        prev_trend = trend
    return st

def calc_ema(c_list, period):
    if not c_list: return []
    k = 2.0 / (period + 1)
    ema_vals = []
    cur = c_list[0]['close']
    ema_vals.append(cur)
    for i in range(1, len(c_list)):
        cur = c_list[i]['close'] * k + cur * (1.0 - k)
        ema_vals.append(cur)
    return ema_vals

def calc_rsi(c_list, period=14):
    if len(c_list) < period + 1:
        return [50.0] * len(c_list)
    rsi_vals = [50.0] * period
    gains = []
    losses = []
    for i in range(1, period + 1):
        diff = c_list[i]['close'] - c_list[i-1]['close']
        gains.append(max(0.0, diff))
        losses.append(max(0.0, -diff))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    rs = (avg_gain / avg_loss) if avg_loss > 0 else 100.0
    rsi_vals.append(100.0 - (100.0 / (1.0 + rs)))
    
    for i in range(period + 1, len(c_list)):
        diff = c_list[i]['close'] - c_list[i-1]['close']
        gain = max(0.0, diff)
        loss = max(0.0, -diff)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        rs = (avg_gain / avg_loss) if avg_loss > 0 else 100.0
        rsi_vals.append(100.0 - (100.0 / (1.0 + rs)))
    return rsi_vals

st_series = calc_supertrend(candles, 10, 1.0)
ema9_series = calc_ema(candles, 9)
ema21_series = calc_ema(candles, 21)
rsi_series = calc_rsi(candles, 14)

def calc_vwap(c_sub):
    cum_vol = sum(c['volume'] for c in c_sub)
    if cum_vol == 0: return c_sub[-1]['close']
    cum_pv = sum(((c['high'] + c['low'] + c['close'])/3.0) * c['volume'] for c in c_sub)
    return cum_pv / cum_vol

def black_scholes(spot, strike, opt_type, dte=1.5, iv=11.5):
    T = max(0.0012, dte / 365.0)
    moneyness = (strike - spot) / spot
    skew_iv = iv + (abs(moneyness)*20.0 if moneyness < 0 else moneyness*15.0)
    sigma = max(0.05, skew_iv / 100.0)
    r = 0.0
    d1 = (math.log(spot / strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    
    def cnd(x):
        a1, a2, a3, a4, a5 = 0.31938153, -0.356563782, 1.781477937, -1.821255978, 1.330274429
        p = 0.2316419
        sign = -1 if x < 0 else 1
        abs_x = abs(x)
        t = 1.0 / (1.0 + p * abs_x)
        pdf = math.exp(-0.5 * abs_x * abs_x) / math.sqrt(2 * math.pi)
        cdf = 1.0 - pdf * (a1*t + a2*(t**2) + a3*(t**3) + a4*(t**4) + a5*(t**5))
        return 1.0 - cdf if sign == -1 else cdf
        
    call = spot * cnd(d1) - strike * cnd(d2)
    put = strike * cnd(-d2) - spot * cnd(-d1)
    if opt_type == 'CE': return max(max(0.0, spot - strike) + 0.5, round(call * 20)/20)
    if opt_type == 'PE': return max(max(0.0, strike - spot) + 0.5, round(put * 20)/20)
    if opt_type == 'STRADDLE': return round((call + put) * 20)/20
    return call

unique_dates = sorted(list(set(c['date'] for c in candles)))
target_dates = unique_dates[-3:] # 2026-09-07, 2026-09-08, 2026-09-09

all_suggestions = []

for cur_date in target_dates:
    day_candles = [c for c in candles if c['date'] == cur_date]
    last_scan_time = 0
    last_spot = day_candles[0]['open']
    
    for i, c in enumerate(day_candles):
        global_idx = c['idx']
        spot = c['close']
        t_sec = c['timestamp']
        elapsed = t_sec - last_scan_time
        spot_shift = abs(spot - last_spot)
        st_res = st_series[global_idx]
        
        trigger = (i == 0) or (elapsed >= 15 * 60) or (spot_shift >= 120) or st_res['signalFlip']
        
        if trigger:
            last_scan_time = t_sec
            last_spot = spot
            atm_strike = round(spot / 100.0) * 100
            
            day_candles_so_far = day_candles[:i+1]
            vwap = calc_vwap(day_candles_so_far)
            vwap_diff = spot - vwap
            
            ema9 = ema9_series[global_idx]
            ema21 = ema21_series[global_idx]
            rsi = rsi_series[global_idx]
            
            score = 0
            if st_res['trend'] == 1: score += 35
            else: score -= 35
            if st_res['signalFlip']:
                score += (15 if st_res['trend'] == 1 else -15)
            if vwap_diff >= 15: score += 25
            elif vwap_diff <= -15: score -= 25
            if ema9 > ema21: score += 15
            else: score -= 15
            if rsi > 58: score += 15
            elif rsi < 42: score -= 15
            
            if score >= 20: regime = 'BULLISH'
            elif score <= -20: regime = 'BEARISH'
            else: regime = 'RANGEBOUND'
            
            batch = []
            if regime == 'BEARISH':
                s1 = atm_strike - 100
                ltp1 = black_scholes(spot, s1, 'PE')
                batch.append({
                    'type': 'MOMENTUM_BUY',
                    'symbol': f'{s1} PE',
                    'action': 'BUY',
                    'strike': s1,
                    'opt_type': 'PE',
                    'entry_ltp': ltp1,
                    'sl': round(ltp1 * 0.82 * 20)/20,
                    'target': round(ltp1 * 1.55 * 20)/20
                })
                s2 = atm_strike - 300
                ltp2 = black_scholes(spot, s2, 'PE')
                batch.append({
                    'type': 'RUNNER_BUY',
                    'symbol': f'{s2} PE',
                    'action': 'BUY',
                    'strike': s2,
                    'opt_type': 'PE',
                    'entry_ltp': ltp2,
                    'sl': round(ltp2 * 0.74 * 20)/20,
                    'target': round(ltp2 * 2.25 * 20)/20
                })
                s3 = atm_strike + 200
                ltp3 = black_scholes(spot, s3, 'CE')
                batch.append({
                    'type': 'CREDIT_SPREAD',
                    'symbol': f'{s3} CE SELL',
                    'action': 'SELL',
                    'strike': s3,
                    'opt_type': 'CE',
                    'entry_ltp': ltp3,
                    'sl': round(ltp3 * 1.35 * 20)/20,
                    'target': round(ltp3 * 0.35 * 20)/20
                })
                s4 = atm_strike + 200
                ltp4 = black_scholes(spot, s4, 'PE')
                batch.append({
                    'type': 'DEEP_ITM_SCALP',
                    'symbol': f'{s4} PE',
                    'action': 'BUY',
                    'strike': s4,
                    'opt_type': 'PE',
                    'entry_ltp': ltp4,
                    'sl': round(ltp4 * 0.88 * 20)/20,
                    'target': round(ltp4 * 1.38 * 20)/20
                })
            elif regime == 'BULLISH':
                s1 = atm_strike + 100
                ltp1 = black_scholes(spot, s1, 'CE')
                batch.append({
                    'type': 'MOMENTUM_BUY',
                    'symbol': f'{s1} CE',
                    'action': 'BUY',
                    'strike': s1,
                    'opt_type': 'CE',
                    'entry_ltp': ltp1,
                    'sl': round(ltp1 * 0.82 * 20)/20,
                    'target': round(ltp1 * 1.55 * 20)/20
                })
                s2 = atm_strike + 300
                ltp2 = black_scholes(spot, s2, 'CE')
                batch.append({
                    'type': 'RUNNER_BUY',
                    'symbol': f'{s2} CE',
                    'action': 'BUY',
                    'strike': s2,
                    'opt_type': 'CE',
                    'entry_ltp': ltp2,
                    'sl': round(ltp2 * 0.74 * 20)/20,
                    'target': round(ltp2 * 2.25 * 20)/20
                })
                s3 = atm_strike - 200
                ltp3 = black_scholes(spot, s3, 'PE')
                batch.append({
                    'type': 'CREDIT_SPREAD',
                    'symbol': f'{s3} PE SELL',
                    'action': 'SELL',
                    'strike': s3,
                    'opt_type': 'PE',
                    'entry_ltp': ltp3,
                    'sl': round(ltp3 * 1.35 * 20)/20,
                    'target': round(ltp3 * 0.35 * 20)/20
                })
                s4 = atm_strike - 200
                ltp4 = black_scholes(spot, s4, 'CE')
                batch.append({
                    'type': 'DEEP_ITM_SCALP',
                    'symbol': f'{s4} CE',
                    'action': 'BUY',
                    'strike': s4,
                    'opt_type': 'CE',
                    'entry_ltp': ltp4,
                    'sl': round(ltp4 * 0.88 * 20)/20,
                    'target': round(ltp4 * 1.38 * 20)/20
                })
            else:
                s_straddle = atm_strike
                ltp_str = black_scholes(spot, s_straddle, 'STRADDLE')
                batch.append({
                    'type': 'THETA_STRADDLE',
                    'symbol': f'{s_straddle} STRADDLE SELL',
                    'action': 'SELL',
                    'strike': s_straddle,
                    'opt_type': 'STRADDLE',
                    'entry_ltp': ltp_str,
                    'sl': round(ltp_str * 1.25 * 20)/20,
                    'target': round(ltp_str * 0.65 * 20)/20
                })
                ce_rev = black_scholes(spot, atm_strike, 'CE')
                batch.append({
                    'type': 'MEAN_REVERSION',
                    'symbol': f'{atm_strike} CE BUY',
                    'action': 'BUY',
                    'strike': atm_strike,
                    'opt_type': 'CE',
                    'entry_ltp': ce_rev,
                    'sl': round(ce_rev * 0.85 * 20)/20,
                    'target': round(ce_rev * 1.30 * 20)/20
                })
                pe_rev = black_scholes(spot, atm_strike, 'PE')
                batch.append({
                    'type': 'MEAN_REVERSION',
                    'symbol': f'{atm_strike} PE BUY',
                    'action': 'BUY',
                    'strike': atm_strike,
                    'opt_type': 'PE',
                    'entry_ltp': pe_rev,
                    'sl': round(pe_rev * 0.85 * 20)/20,
                    'target': round(pe_rev * 1.30 * 20)/20
                })

            for item in batch:
                item['date'] = cur_date
                item['entry_time'] = c['time']
                item['entry_spot'] = spot
                item['regime'] = regime
                item['outcome'] = 'ACTIVE'
                item['exit_time'] = day_candles[-1]['time']
                item['exit_ltp'] = item['entry_ltp']
                item['pnl_pts'] = 0.0
                item['max_pnl_pct'] = 0.0
                item['min_pnl_pct'] = 0.0

                for fut_c in day_candles[i+1:]:
                    fut_spot_high = fut_c['high']
                    fut_spot_low = fut_c['low']
                    fut_spot_close = fut_c['close']
                    
                    if item['opt_type'] == 'STRADDLE':
                        cur_ltp = black_scholes(fut_spot_close, item['strike'], 'STRADDLE')
                        opt_high = cur_ltp
                        opt_low = cur_ltp
                    elif item['opt_type'] == 'CE':
                        opt_high = black_scholes(fut_spot_high, item['strike'], 'CE')
                        opt_low = black_scholes(fut_spot_low, item['strike'], 'CE')
                        cur_ltp = black_scholes(fut_spot_close, item['strike'], 'CE')
                    else: # PE
                        opt_high = black_scholes(fut_spot_low, item['strike'], 'PE')
                        opt_low = black_scholes(fut_spot_high, item['strike'], 'PE')
                        cur_ltp = black_scholes(fut_spot_close, item['strike'], 'PE')

                    if item['action'] == 'BUY':
                        gain_pct = ((opt_high - item['entry_ltp']) / item['entry_ltp']) * 100
                        loss_pct = ((opt_low - item['entry_ltp']) / item['entry_ltp']) * 100
                        item['max_pnl_pct'] = max(item['max_pnl_pct'], gain_pct)
                        item['min_pnl_pct'] = min(item['min_pnl_pct'], loss_pct)
                        
                        if opt_high >= item['target']:
                            item['outcome'] = 'TARGET_HIT'
                            item['exit_time'] = fut_c['time']
                            item['exit_ltp'] = item['target']
                            item['pnl_pts'] = round(item['target'] - item['entry_ltp'], 2)
                            break
                        if opt_low <= item['sl']:
                            item['outcome'] = 'SL_HIT'
                            item['exit_time'] = fut_c['time']
                            item['exit_ltp'] = item['sl']
                            item['pnl_pts'] = round(item['sl'] - item['entry_ltp'], 2)
                            break
                    else: # SELL
                        gain_pct = ((item['entry_ltp'] - opt_low) / item['entry_ltp']) * 100
                        loss_pct = ((item['entry_ltp'] - opt_high) / item['entry_ltp']) * 100
                        item['max_pnl_pct'] = max(item['max_pnl_pct'], gain_pct)
                        item['min_pnl_pct'] = min(item['min_pnl_pct'], loss_pct)

                        if opt_low <= item['target']:
                            item['outcome'] = 'TARGET_HIT'
                            item['exit_time'] = fut_c['time']
                            item['exit_ltp'] = item['target']
                            item['pnl_pts'] = round(item['entry_ltp'] - item['target'], 2)
                            break
                        if opt_high >= item['sl']:
                            item['outcome'] = 'SL_HIT'
                            item['exit_time'] = fut_c['time']
                            item['exit_ltp'] = item['sl']
                            item['pnl_pts'] = round(item['entry_ltp'] - item['sl'], 2)
                            break
                
                if item['outcome'] == 'ACTIVE':
                    item['exit_ltp'] = cur_ltp
                    item['pnl_pts'] = round((cur_ltp - item['entry_ltp']) if item['action'] == 'BUY' else (item['entry_ltp'] - cur_ltp), 2)

                all_suggestions.append(item)

# Summary statistics
total = len(all_suggestions)
wins = [s for s in all_suggestions if s['outcome'] == 'TARGET_HIT']
losses = [s for s in all_suggestions if s['outcome'] == 'SL_HIT']
active = [s for s in all_suggestions if s['outcome'] == 'ACTIVE']
resolved = len(wins) + len(losses)

win_rate = (len(wins) / resolved * 100) if resolved > 0 else 0
fail_rate = (len(losses) / resolved * 100) if resolved > 0 else 0

print("=================================================")
print(f"BANKNIFTY STRIKE SUGGESTIONS AUDIT (LAST 2+ DAYS)")
print(f"Dates Covered: {target_dates}")
print("=================================================")
print(f"Total Strike Suggestions Generated: {total}")
print(f"Resolved Trades (Target or SL Hit): {resolved}")
print(f"Active / End-of-Day Trades:         {len(active)}")
print(f"Target Hits (SUCCESS / WINS):       {len(wins)}  ({win_rate:.1f}%)")
print(f"Stop-Loss Hits (FAILURES / LOSSES): {len(losses)}  ({fail_rate:.1f}%)")
print(f"Net Realized Points:                {sum(s['pnl_pts'] for s in wins + losses):+.1f} pts")
print("=================================================\n")

# Breakdown by Date
for d in target_dates:
    d_items = [s for s in all_suggestions if s['date'] == d]
    d_wins = [s for s in d_items if s['outcome'] == 'TARGET_HIT']
    d_losses = [s for s in d_items if s['outcome'] == 'SL_HIT']
    d_res = len(d_wins) + len(d_losses)
    d_rate = (len(d_wins)/d_res*100) if d_res > 0 else 0
    d_fail = (len(d_losses)/d_res*100) if d_res > 0 else 0
    pts = sum(s['pnl_pts'] for s in d_items)
    print(f"📅 Day {d}:")
    print(f"   Suggestions: {len(d_items)} | Target Hits: {len(d_wins)} ({d_rate:.1f}%) | SL Hits: {len(d_losses)} ({d_fail:.1f}%) | Net Pts: {pts:+.1f}")

# Breakdown by Setup Type
print("\n=================================================")
print("BREAKDOWN BY STRATEGY / SETUP TYPE")
print("=================================================")
categories = sorted(list(set(s['type'] for s in all_suggestions)))
for cat in categories:
    cat_items = [s for s in all_suggestions if s['type'] == cat]
    cat_wins = [s for s in cat_items if s['outcome'] == 'TARGET_HIT']
    cat_losses = [s for s in cat_items if s['outcome'] == 'SL_HIT']
    cat_res = len(cat_wins) + len(cat_losses)
    cat_rate = (len(cat_wins)/cat_res*100) if cat_res > 0 else 0
    cat_fail = (len(cat_losses)/cat_res*100) if cat_res > 0 else 0
    avg_pts = sum(s['pnl_pts'] for s in cat_items) / len(cat_items)
    max_gain_avg = sum(s['max_pnl_pct'] for s in cat_items) / len(cat_items)
    print(f"🔹 {cat}:")
    print(f"   Total: {len(cat_items)} | Wins: {len(cat_wins)} ({cat_rate:.1f}%) | Losses: {len(cat_losses)} ({cat_fail:.1f}%) | Avg Points: {avg_pts:+.1f} pts | Avg Peak Gain Reached: +{max_gain_avg:.1f}%")

# Deep Dive into Failures: Why did they fail?
print("\n=================================================")
print("FAILURE ANALYSIS: WHY DID LOSSES HAPPEN?")
print("=================================================")
failure_reasons = {
    'REVERSED_AFTER_PEAK_PROFIT': 0, # Was up > 15% but reversed and hit SL
    'IMMEDIATE_WHIPSAW': 0,          # Stopped out quickly with max gain < 5%
    'CHOPPY_VWAP_FALSE_BREAK': 0,    # Entered in mild regime, false breakout
    'OTM_PREMIUM_BLEED': 0           # High strike distance decay
}

for l in losses:
    if l['max_pnl_pct'] >= 15.0:
        failure_reasons['REVERSED_AFTER_PEAK_PROFIT'] += 1
    elif l['max_pnl_pct'] < 5.0:
        failure_reasons['IMMEDIATE_WHIPSAW'] += 1
    elif 'RUNNER' in l['type']:
        failure_reasons['OTM_PREMIUM_BLEED'] += 1
    else:
        failure_reasons['CHOPPY_VWAP_FALSE_BREAK'] += 1

for r, count in failure_reasons.items():
    pct = (count / len(losses) * 100) if losses else 0
    print(f"❌ {r}: {count} occurrences ({pct:.1f}% of all failures)")

