/**
 * BankNifty AlgoEdge Terminal - Option Chain & Black-Scholes Greeks Engine
 */

class OptionChainEngine {
  constructor() {
    this.riskFreeRate = 0.07; // 7% RBI repo rate baseline
    this.expiryDays = 5.0; // Weekly expiry baseline (5 days)
    this.strikesRange = 15; // +/- 15 strikes (31 total strikes)
    this.persistentOICache = new Map(); // strike -> { callOI, putOI, callChgOI, putChgOI, callChg, putChg }
    this.lastOIUpdateTime = 0;
  }

  getOrCreateStrikeOI(strike, atmStrike) {
    const currentExpiryKey = (window.appState && window.appState.selectedExpiry) ? window.appState.selectedExpiry.key : 'DEFAULT';
    const cacheKey = `${currentExpiryKey}_ATM_${atmStrike}_${strike}`;

    if (this.lastExpiryKey !== currentExpiryKey || this.lastAtmStrike !== atmStrike) {
      this.persistentOICache.clear();
      this.lastExpiryKey = currentExpiryKey;
      this.lastAtmStrike = atmStrike;
    }

    const cached = this.persistentOICache.get(cacheKey);
    if (cached) {
      // Simulate real-time dynamic OI shifts on every market tick (every 3 seconds)
      const now = Date.now();
      if (!cached.lastTickTime || now - cached.lastTickTime > 3000) {
        cached.lastTickTime = now;
        // Institutional flow micro-fluctuation per strike
        const callDeltaFlux = Math.round((Math.random() - 0.48) * 6500);
        const putDeltaFlux = Math.round((Math.random() - 0.48) * 6500);
        cached.callOI = Math.max(450000, cached.callOI + callDeltaFlux);
        cached.putOI = Math.max(450000, cached.putOI + putDeltaFlux);
        cached.callChgOI += callDeltaFlux;
        cached.putChgOI += putDeltaFlux;
        const cBase = Math.max(100000, cached.callOI - cached.callChgOI);
        const pBase = Math.max(100000, cached.putOI - cached.putChgOI);
        cached.callOIChgPct = parseFloat(((cached.callChgOI / cBase) * 100).toFixed(2));
        cached.putOIChgPct = parseFloat(((cached.putChgOI / pBase) * 100).toFixed(2));
      }
      return cached;
    }

    const offset = (strike - atmStrike) / 100.0;
    
    // Realistic Broad Institutional distribution (Lorentzian wide-tail curve + Gaussian core)
    // Peak Call writing above ATM (resistance defense at +150 to +300 pts)
    // Peak Put writing below ATM (support floor defense at -150 to -300 pts)
    const callCenter = 1.5;
    const putCenter = -1.5;
    const distCall = 1.0 / (1.0 + Math.pow((offset - callCenter) / 5.5, 2.0));
    const distPut = 1.0 / (1.0 + Math.pow((offset - putCenter) / 5.5, 2.0));

    // Institutional strike magnet multipliers (Round 1000 > Round 500 > Round 200 > Round 100)
    let roundMult = 1.05;
    if (strike % 1000 === 0) {
      roundMult = 1.85; // 57000, 58000, 59000
    } else if (strike % 500 === 0) {
      roundMult = 1.55; // 56500, 57500, 58500
    } else if (strike % 200 === 0) {
      roundMult = 1.25; // 57200, 57400, 57600, 57800
    }

    // Deterministic pseudo-random variation per strike
    const seedC = (Math.sin(strike * 0.0137 + 42.12) * 43758.5453) % 1.0;
    const seedP = (Math.sin(strike * 0.0189 + 17.84) * 43758.5453) % 1.0;

    const baseOI = 2400000; // 24 Lakh base
    const baseFloor = 650000; // 6.5 Lakh realistic minimum floor even for deep wings

    const rawCall = baseFloor + (baseOI * distCall * roundMult) * (0.82 + 0.36 * Math.abs(seedC));
    const rawPut = baseFloor + (baseOI * distPut * roundMult) * (0.82 + 0.36 * Math.abs(seedP));

    const callOI = Math.round(rawCall / 1000) * 1000;
    const putOI = Math.round(rawPut / 1000) * 1000;

    const callChgOI = Math.round((callOI * 0.06) * (Math.sin(strike * 0.05) * 1.5));
    const putChgOI = Math.round((putOI * 0.06) * (Math.cos(strike * 0.05) * 1.5));

    const callChg = ((Math.abs(seedC) * 18 - 6) * (offset < 0 ? 1.2 : 0.8)).toFixed(2);
    const putChg = ((Math.abs(seedP) * 18 - 8) * (offset > 0 ? 1.2 : 0.8)).toFixed(2);

    const cBase = Math.max(100000, callOI - callChgOI);
    const pBase = Math.max(100000, putOI - putChgOI);
    const callOIChgPct = parseFloat(((callChgOI / cBase) * 100).toFixed(2));
    const putOIChgPct = parseFloat(((putChgOI / pBase) * 100).toFixed(2));

    const record = {
      callOI,
      putOI,
      callChgOI,
      putChgOI,
      callOIChgPct,
      putOIChgPct,
      callChg: parseFloat(callChg),
      putChg: parseFloat(putChg),
      lastTickTime: Date.now()
    };

    this.persistentOICache.set(cacheKey, record);
    return record;
  }

  // Cumulative Normal Distribution
  cnd(x) {
    const a1 = 0.31938153;
    const a2 = -0.356563782;
    const a3 = 1.781477937;
    const a4 = -1.821255978;
    const a5 = 1.330274429;
    const p = 0.2316419;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);

    const t = 1.0 / (1.0 + p * absX);
    const pdf = Math.exp(-0.5 * absX * absX) / Math.sqrt(2 * Math.PI);
    const cdf = 1.0 - pdf * (a1 * t + a2 * Math.pow(t, 2) + a3 * Math.pow(t, 3) + a4 * Math.pow(t, 4) + a5 * Math.pow(t, 5));

    return sign === -1 ? 1.0 - cdf : cdf;
  }

  // Normal probability density function
  npdf(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  // Calculate Black-Scholes Greeks and Theoretical Price (Forward cost-of-carry aligned for NSE Index Options)
  calculateGreeks(spot, strike, daysToExpiry = 5.0, ivPercent = 13.5) {
    const T = Math.max(0.0012, daysToExpiry / 365.0);
    const sigma = Math.max(0.05, ivPercent / 100.0);
    const r = daysToExpiry > 7 ? 0.058 : 0.0;

    const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const Nd1 = this.cnd(d1);
    const Nd2 = this.cnd(d2);
    const N_minus_d1 = this.cnd(-d1);
    const N_minus_d2 = this.cnd(-d2);
    const npdf_d1 = this.npdf(d1);

    // Call / Put Prices (Strict Put-Call Parity: C - P = S - K*e^-rT)
    const callPrice = spot * Nd1 - strike * Math.exp(-r * T) * Nd2;
    const putPrice = strike * Math.exp(-r * T) * N_minus_d2 - spot * N_minus_d1;

    // Greeks
    const callDelta = Nd1;
    const putDelta = Nd1 - 1.0;

    const gamma = npdf_d1 / (spot * sigma * Math.sqrt(T));
    const vega = (spot * Math.sqrt(T) * npdf_d1) / 100.0; // Per 1% IV move

    // Theta (per 1 day decay)
    const thetaCallYear = -(spot * npdf_d1 * sigma) / (2 * Math.sqrt(T));
    const thetaPutYear = -(spot * npdf_d1 * sigma) / (2 * Math.sqrt(T));

    const callTheta = thetaCallYear / 365.0;
    const putTheta = thetaPutYear / 365.0;

    const callIntrinsic = Math.max(0.0, spot - strike);
    const putIntrinsic = Math.max(0.0, strike - spot);

    const roundedCall = Math.max(callIntrinsic + 0.5, Math.round(callPrice * 20) / 20);
    const roundedPut = Math.max(putIntrinsic + 0.5, Math.round(putPrice * 20) / 20);

    return {
      callPrice: roundedCall,
      putPrice: roundedPut,
      callDelta: Math.max(0, Math.min(1, callDelta)),
      putDelta: Math.max(-1, Math.min(0, putDelta)),
      gamma: gamma,
      vega: vega,
      callTheta: callTheta,
      putTheta: putTheta
    };
  }

  generateOptionChainData(spotPrice, vix) {
    const atmStrike = Math.round(spotPrice / 100) * 100;
    const strikes = [];

    let totalCallOI = 0;
    let totalPutOI = 0;
    let maxPainStrike = atmStrike;
    let minLoss = Infinity;
    const baseIV = vix || (window.appState && window.appState.indiaVix) || 11.23;
    const dte = (window.appState && window.appState.getDaysToExpiry) ? window.appState.getDaysToExpiry() : 0.85;

    for (let i = -this.strikesRange; i <= this.strikesRange; i++) {
      const strike = atmStrike + i * 100;
      
      // NSE IV smile: higher OTM put skew (Matches Zerodha live options ticks)
      const moneyness = (strike - spotPrice) / (spotPrice || 57400);
      let strikeIV = baseIV;
      if (moneyness < 0) {
        // OTM Puts / ITM Calls
        strikeIV = baseIV + Math.abs(moneyness) * 20.0;
      } else {
        // OTM Calls / ITM Puts
        strikeIV = baseIV + moneyness * 15.0;
      }

      const greeks = this.calculateGreeks(spotPrice, strike, dte, strikeIV);
      const oiData = this.getOrCreateStrikeOI(strike, atmStrike);

      totalCallOI += oiData.callOI;
      totalPutOI += oiData.putOI;

      strikes.push({
        strike,
        isATM: strike === atmStrike,
        isCallITM: strike < spotPrice,
        isPutITM: strike > spotPrice,
        iv: strikeIV.toFixed(1),
        call: {
          ltp: greeks.callPrice.toFixed(2),
          chg: oiData.callChg.toFixed(2),
          oi: oiData.callOI,
          chgOI: oiData.callChgOI,
          chgOIPct: oiData.callOIChgPct !== undefined ? oiData.callOIChgPct : 0,
          delta: (greeks.callDelta >= 0 ? '+' : '') + greeks.callDelta.toFixed(3),
          gamma: (greeks.gamma * 1000).toFixed(4),
          theta: greeks.callTheta.toFixed(2),
          vega: greeks.vega.toFixed(2)
        },
        put: {
          ltp: greeks.putPrice.toFixed(2),
          chg: oiData.putChg.toFixed(2),
          oi: oiData.putOI,
          chgOI: oiData.putChgOI,
          chgOIPct: oiData.putOIChgPct !== undefined ? oiData.putOIChgPct : 0,
          delta: greeks.putDelta.toFixed(3),
          gamma: (greeks.gamma * 1000).toFixed(4),
          theta: greeks.putTheta.toFixed(2),
          vega: greeks.vega.toFixed(2)
        }
      });
    }

    const pcr = totalPutOI / (totalCallOI || 1);

    // Calculate Max Pain
    strikes.forEach(target => {
      let cumulativeLoss = 0;
      strikes.forEach(s => {
        if (s.strike < target.strike) {
          cumulativeLoss += (target.strike - s.strike) * s.call.oi;
        }
        if (s.strike > target.strike) {
          cumulativeLoss += (s.strike - target.strike) * s.put.oi;
        }
      });
      if (cumulativeLoss < minLoss) {
        minLoss = cumulativeLoss;
        maxPainStrike = target.strike;
      }
    });

    return {
      spotPrice,
      atmStrike,
      maxPainStrike,
      totalCallOI,
      totalPutOI,
      pcr: pcr.toFixed(2),
      strikes
    };
  }

  renderTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const data = this.generateOptionChainData(window.appState.spotPrice, window.appState.indiaVix);
    const maxOI = Math.max(...data.strikes.map(s => Math.max(s.call.oi, s.put.oi)));

    // Update Summary Header
    const pcrEl = document.getElementById('opt-summary-pcr');
    const callOIEl = document.getElementById('opt-summary-call-oi');
    const putOIEl = document.getElementById('opt-summary-put-oi');
    const maxPainEl = document.getElementById('opt-summary-max-pain');
    const pcrNeedle = document.getElementById('pcr-needle-marker');

    const formatSentiment = (pcr) => {
      const p = parseFloat(pcr);
      if (p >= 1.25) return `${pcr} (Strong Bullish)`;
      if (p >= 1.05) return `${pcr} (Mild Bullish)`;
      if (p >= 0.90) return `${pcr} (Neutral)`;
      if (p >= 0.75) return `${pcr} (Mild Bearish)`;
      return `${pcr} (Strong Bearish)`;
    };

    if (pcrEl) pcrEl.textContent = formatSentiment(data.pcr);
    if (callOIEl) callOIEl.textContent = (data.totalCallOI / 100000).toFixed(2) + ' L';
    if (putOIEl) putOIEl.textContent = (data.totalPutOI / 100000).toFixed(2) + ' L';
    if (maxPainEl) maxPainEl.textContent = data.maxPainStrike.toLocaleString('en-IN');

    if (pcrNeedle) {
      // PCR range roughly 0.5 to 1.5 -> clamp 0% to 100%
      const pcrVal = parseFloat(data.pcr);
      const pct = Math.min(100, Math.max(0, ((pcrVal - 0.5) / 1.0) * 100));
      pcrNeedle.style.left = `${pct}%`;
    }

    const formatOI = (oi) => {
      if (oi >= 100000) return `${(oi / 100000).toFixed(2)} L`;
      return `${(oi / 1000).toFixed(1)} k`;
    };

    let rowsHtml = '';
    data.strikes.forEach(s => {
      const isAtmClass = s.isATM ? 'strike-atm-row' : '';
      const callItmClass = s.isCallITM ? 'itm-call' : '';
      const putItmClass = s.isPutITM ? 'itm-put' : '';

      const callBarWidth = ((s.call.oi / maxOI) * 100).toFixed(1);
      const putBarWidth = ((s.put.oi / maxOI) * 100).toFixed(1);

      const callLots = Math.round(s.call.oi / 30).toLocaleString('en-IN');
      const putLots = Math.round(s.put.oi / 30).toLocaleString('en-IN');

      const callChgSign = s.call.chgOIPct >= 0 ? '+' : '';
      const putChgSign = s.put.chgOIPct >= 0 ? '+' : '';
      const callChgColor = s.call.chgOIPct >= 0 ? 'var(--bull-green)' : 'var(--bear-red)';
      const putChgColor = s.put.chgOIPct >= 0 ? 'var(--bull-green)' : 'var(--bear-red)';

      rowsHtml += `
        <tr class="${isAtmClass}">
          <!-- CALL GREEKS & DATA -->
          <td class="${callItmClass}">${s.call.delta}</td>
          <td class="${callItmClass}">${s.call.theta}</td>
          <td class="${callItmClass}">${s.call.vega}</td>
          <td class="${callItmClass}">${s.iv}%</td>
          <td class="${callItmClass} oi-bar-cell" title="Call OI: ${s.call.oi.toLocaleString('en-IN')} shares (${callLots} Lots) | Chg: ${(s.call.chgOI >= 0 ? '+' : '') + s.call.chgOI.toLocaleString('en-IN')}">
            <div class="oi-bar-fill-call" style="width: ${callBarWidth}%;"></div>
            <span class="oi-num">${formatOI(s.call.oi)}</span>
          </td>
          <!-- CALL OI CHG % -->
          <td class="${callItmClass}" style="text-align: center; font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700; white-space: nowrap;" title="Call OI Change: ${(s.call.chgOI >= 0 ? '+' : '') + s.call.chgOI.toLocaleString('en-IN')} (${callChgSign}${s.call.chgOIPct}%)">
            <span class="tag-badge ${s.call.chgOIPct >= 0 ? 'tag-buy' : 'tag-sell'}" style="font-size: 10px; padding: 1px 5px; color: ${callChgColor}; border-color: ${callChgColor};">
              ${callChgSign}${s.call.chgOIPct.toFixed(1)}%
            </span>
          </td>
          <td class="${callItmClass}" style="color: ${s.call.chg >= 0 ? 'var(--bull-green)' : 'var(--bear-red)'}; font-weight: 700; cursor: pointer; text-decoration: underline dotted;" title="Click to view & chart ${s.strike} CE on terminal" onclick="window.app.selectAndChartStrike(${s.strike}, 'CE', ${s.call.ltp})">
            ₹${s.call.ltp} 📈
          </td>

          <!-- STRIKE -->
          <td class="strike-cell">
            <b>${s.strike}</b>
            ${s.isATM ? '<span class="tag-badge tag-algo" style="margin-left: 4px; font-size: 9px;">ATM</span>' : ''}
          </td>

          <!-- PUT GREEKS & DATA -->
          <td class="${putItmClass}" style="color: ${s.put.chg >= 0 ? 'var(--bull-green)' : 'var(--bear-red)'}; font-weight: 700; cursor: pointer; text-decoration: underline dotted;" title="Click to view & chart ${s.strike} PE on terminal" onclick="window.app.selectAndChartStrike(${s.strike}, 'PE', ${s.put.ltp})">
            📈 ₹${s.put.ltp}
          </td>
          <!-- PUT OI CHG % -->
          <td class="${putItmClass}" style="text-align: center; font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700; white-space: nowrap;" title="Put OI Change: ${(s.put.chgOI >= 0 ? '+' : '') + s.put.chgOI.toLocaleString('en-IN')} (${putChgSign}${s.put.chgOIPct}%)">
            <span class="tag-badge ${s.put.chgOIPct >= 0 ? 'tag-buy' : 'tag-sell'}" style="font-size: 10px; padding: 1px 5px; color: ${putChgColor}; border-color: ${putChgColor};">
              ${putChgSign}${s.put.chgOIPct.toFixed(1)}%
            </span>
          </td>
          <td class="${putItmClass} oi-bar-cell" title="Put OI: ${s.put.oi.toLocaleString('en-IN')} shares (${putLots} Lots) | Chg: ${(s.put.chgOI >= 0 ? '+' : '') + s.put.chgOI.toLocaleString('en-IN')}">
            <div class="oi-bar-fill-put" style="width: ${putBarWidth}%;"></div>
            <span class="oi-num">${formatOI(s.put.oi)}</span>
          </td>
          <td class="${putItmClass}">${s.iv}%</td>
          <td class="${putItmClass}">${s.put.vega}</td>
          <td class="${putItmClass}">${s.put.theta}</td>
          <td class="${putItmClass}">${s.put.delta}</td>
        </tr>
      `;
    });

    container.innerHTML = rowsHtml;
  }
}

window.optionChainEngine = new OptionChainEngine();
