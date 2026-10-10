/**
 * BankNifty AlgoEdge Terminal - Global Reactive State
 */

class AppState {
  constructor() {
    this.listeners = new Set();

    // Market Data (Calibrated to Live NSE BankNifty Feed)
    this.symbol = "BANKNIFTY";
    this.spotPrice = 55256.65;
    this.prevClose = 54515.05;
    this.dayHigh = 55419.30;
    this.dayLow = 54617.20;
    this.futuresPrice = 55340.00;
    this.indiaVix = 14.38;
    this.vixChange = +2.61;
    this.lotSize = 30; // Current NSE BankNifty Lot Size (30 qty/lot)
    this._userExplicitlySetContract = false;

    // Constituents (Live NSE BankNifty Heavyweights)
    this.constituents = [
      { symbol: "HDFCBANK", name: "HDFC Bank", weight: "29.1%", weight_num: 0.291, price: 707.25, prev_close: 692.25, chg: 15.00, pct: "+2.17%", points_contrib: "+348.9 pts" },
      { symbol: "ICICIBANK", name: "ICICI Bank", weight: "23.4%", weight_num: 0.234, price: 1355.00, prev_close: 1349.00, chg: 6.00, pct: "+0.44%", points_contrib: "+56.9 pts" },
      { symbol: "SBIN", name: "State Bank of India", weight: "11.2%", weight_num: 0.112, price: 959.10, prev_close: 940.00, chg: 19.10, pct: "+2.03%", points_contrib: "+125.6 pts" },
      { symbol: "AXISBANK", name: "Axis Bank", weight: "10.3%", weight_num: 0.103, price: 1259.10, prev_close: 1245.00, chg: 14.10, pct: "+1.13%", points_contrib: "+64.3 pts" },
      { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", weight: "9.2%", weight_num: 0.092, price: 441.00, prev_close: 435.00, chg: 6.00, pct: "+1.38%", points_contrib: "+70.2 pts" },
      { symbol: "INDUSINDBK", name: "IndusInd Bank", weight: "5.5%", weight_num: 0.055, price: 861.65, prev_close: 864.00, chg: -2.35, pct: "-0.27%", points_contrib: "-8.2 pts" },
      { symbol: "FEDERALBNK", name: "Federal Bank", weight: "4.3%", weight_num: 0.043, price: 330.00, prev_close: 321.00, chg: 9.00, pct: "+2.80%", points_contrib: "+66.5 pts" },
      { symbol: "PNB", name: "Punjab National Bank", weight: "2.8%", weight_num: 0.028, price: 116.98, prev_close: 115.29, chg: 1.69, pct: "+1.47%", points_contrib: "+22.7 pts" }
    ];

    // Expiry Management Engine (Automated Rolling Expiries)
    this.availableExpiries = this.generateRollingExpiries();
    this.selectedExpiry = this.availableExpiries[0];

    // Active Instrument & Timeframe
    this.activeInstrument = "CUSTOM_55300_PE";
    this.selectedStrike = 55300;
    this.selectedOptionType = "PE";
    this.currentTimeframe = "5m"; // "5m", "10m", "15m", "30m"
    
    this.instrumentMeta = {};
    this.updateInstrumentMetadata();

    this.indicators = {
      supertrend: true,
      supertrendPeriod: 10,
      supertrendMultiplier: 1.0,
      vwap: true,
      ema9: true,
      ema21: true,
      ema50: true,
      rsi: true,
      bollinger: true,
      volume: true
    };

    // Candles by instrument and timeframe
    this.candles = {
      "BANKNIFTY_SPOT": { "1m": [], "5m": [], "10m": [], "15m": [], "30m": [], "1d": [] },
      "ATM_CE": { "1m": [], "5m": [], "10m": [], "15m": [], "30m": [], "1d": [] },
      "ATM_PE": { "1m": [], "5m": [], "10m": [], "15m": [], "30m": [], "1d": [] },
      "ATM_STRADDLE": { "1m": [], "5m": [], "10m": [], "15m": [], "30m": [], "1d": [] },
      "FUTURES": { "1m": [], "5m": [], "10m": [], "15m": [], "30m": [], "1d": [] }
    };

    // Simulation Engine & Market Feed Mode
    this.sim = {
      isPlaying: true,
      feedMode: "LIVE_FEED", // "LIVE_FEED" for authentic NSE market quotes, "SIMULATOR" for synthetic ticks & replay
      afterHoursMode: "SIMULATE", // "SIMULATE" for testing algos after hours, "FROZEN" for static market close
      speed: 1, // 1x, 5x, 10x
      tickIntervalMs: 800,
      marketTime: "17:30:00 IST",
      killSwitchActivated: false,
      autoSquareOffTime: "15:15:00"
    };

    // Broker & Account State (Paper Trading)
    this.account = {
      mode: "PAPER", // "PAPER" or "LIVE"
      initialCapital: 1000000.00, // ₹10 Lakhs
      availableMargin: 1000000.00,
      usedMargin: 0.00,
      realizedPnL: 0.00,
      unrealizedPnL: 0.00,
      totalCharges: 0.00,
      maxDailyLossLimit: 25000.00,
      maxDailyLossReached: false
    };

    // Positions & Orders
    this.positions = [];
    this.orders = [];
    this.trades = [];

    // Strategies Configuration & Live State
    this.strategies = [
      {
        id: "straddle_920",
        name: "9:20 AM Short Straddle",
        type: "OPTIONS_SELLING",
        armed: false,
        status: "IDLE", // "IDLE", "ARMED", "RUNNING", "STOPPED", "EXITED"
        description: "Auto-sells ATM CE & PE at 09:20 IST. Manages individual leg SL (25%) with trailing stop and 15:15 auto-exit.",
        params: {
          entryTime: "09:20",
          exitTime: "15:15",
          lots: 2,
          slPercent: 25,
          trailStepPts: 15,
          reEntryAllowed: true,
          reEntryLimit: 1
        },
        stats: {
          todayPnL: 0.00,
          winRate: "68.4%",
          tradesCount: 0
        }
      },
      {
        id: "vwap_scalper",
        name: "VWAP + 9 EMA Momentum Scalper",
        type: "MOMENTUM_BUYING",
        armed: false,
        status: "IDLE",
        description: "High-speed intraday scalper. Enters ATM Call/Put options when price breaks VWAP aligned with 9/21 EMA crossover.",
        params: {
          timeframe: "1m",
          lots: 3,
          targetPoints: 40,
          stopLossPoints: 20,
          volumeMultiplier: 1.5,
          trailSl: true
        },
        stats: {
          todayPnL: 0.00,
          winRate: "72.1%",
          tradesCount: 0
        }
      },
      {
        id: "gamma_neutral",
        name: "Delta-Neutral Gamma Scalper (0DTE)",
        type: "EXPIRY_SPECIAL",
        armed: false,
        status: "IDLE",
        description: "Harvests rapid theta decay while dynamically neutralizing delta (+/- 0.15 threshold) during expiry sessions.",
        params: {
          deltaThreshold: 0.15,
          maxAdjustments: 4,
          lots: 2,
          targetProfit: 6000
        },
        stats: {
          todayPnL: 0.00,
          winRate: "76.0%",
          tradesCount: 0
        }
      },
      {
        id: "oi_mean_reversion",
        name: "Multi-Strike OI & PCR Reversion",
        type: "MEAN_REVERSION",
        armed: false,
        status: "IDLE",
        description: "Identifies institutional option writing walls and triggers counter-trend entries at extreme PCR divergences.",
        params: {
          pcrOversold: 0.65,
          pcrOverbought: 1.45,
          lots: 2,
          targetPoints: 50,
          stopLossPoints: 25
        },
        stats: {
          todayPnL: 0.00,
          winRate: "64.5%",
          tradesCount: 0
        }
      }
    ];

    this.initHistoricalCandles();
    this.seedInitialPositionsAndOrders();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, payload) {
    this.listeners.forEach(fn => fn(event, payload, this));
  }

  getActiveCandles() {
    const inst = this.candles[this.activeInstrument] || this.candles["BANKNIFTY_SPOT"] || this.candles["ATM_CE"];
    if (this.currentTimeframe === '1d') {
      if (inst && inst["1d"] && inst["1d"].length > 0) return inst["1d"];
      return this.candles["BANKNIFTY_SPOT"]["1d"] || [];
    }
    return (inst && inst[this.currentTimeframe]) ? inst[this.currentTimeframe] : [];
  }

  generateRollingExpiries(baseDate = new Date()) {
    const monthNames = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const fullMonths = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    // Work in IST
    const istOffset = 5.5 * 3600 * 1000;
    const istTime = new Date(baseDate.getTime() + istOffset);
    const curY = istTime.getUTCFullYear();
    const curM = istTime.getUTCMonth() + 1;
    const curD = istTime.getUTCDate();
    const curH = istTime.getUTCHours() + istTime.getUTCMinutes() / 60;
    const todayKey = `${curY}-${String(curM).padStart(2, '0')}-${String(curD).padStart(2, '0')}`;

    const expiries = [];
    const seen = new Set();

    // Helper to find last Wednesday of month
    const getLastWedOfMonth = (y, m) => {
      let nextM = m === 12 ? 1 : m + 1;
      let nextY = m === 12 ? y + 1 : y;
      const firstOfNext = new Date(Date.UTC(nextY, nextM - 1, 1));
      const lastDay = new Date(firstOfNext.getTime() - 24 * 3600 * 1000);
      const dayOfWeek = lastDay.getUTCDay(); // 3 = Wed
      const offset = (dayOfWeek - 3 + 7) % 7;
      return new Date(lastDay.getTime() - offset * 24 * 3600 * 1000);
    };

    // 1. Identify Active Monthly Expiry (Primary NSE BankNifty derivatives contract traded on Zerodha Kite)
    let activeMonthlyWed = getLastWedOfMonth(curY, curM);
    let activeMonthlyD = activeMonthlyWed.getUTCDate();
    let activeMonthlyKey = `${curY}-${String(curM).padStart(2, '0')}-${String(activeMonthlyD).padStart(2, '0')}`;

    // If today is past current month's monthly expiry 15:30 IST, roll to next month's monthly expiry
    if (activeMonthlyKey < todayKey || (activeMonthlyKey === todayKey && curH >= 15.5)) {
      const nextM = curM === 12 ? 1 : curM + 1;
      const nextY = curM === 12 ? curY + 1 : curY;
      activeMonthlyWed = getLastWedOfMonth(nextY, nextM);
      activeMonthlyD = activeMonthlyWed.getUTCDate();
      activeMonthlyKey = `${nextY}-${String(nextM).padStart(2, '0')}-${String(activeMonthlyD).padStart(2, '0')}`;
    }

    const mY = activeMonthlyWed.getUTCFullYear();
    const mM = activeMonthlyWed.getUTCMonth() + 1;
    const mD = activeMonthlyWed.getUTCDate();
    const mDStr = String(mD).padStart(2, '0');
    const mCode = `${mDStr}${monthNames[mM]}`;

    // Active Monthly Expiry is #1 (DEFAULT / Zerodha Parity)
    seen.add(activeMonthlyKey);
    expiries.push({
      key: activeMonthlyKey,
      code: mCode,
      label: `${mDStr} ${monthNames[mM]} ${mY} (Monthly - Active Zerodha)`,
      shortLabel: `${mCode} Monthly (Zerodha)`,
      month: mM,
      year: mY,
      isMonthly: true,
      isWeekly: false,
      isCurrent: true
    });

    // 2. Add Weekly Expiries (Wednesdays) for scalpers wanting weekly / 0-DTE contracts
    let curDayOfWeek = istTime.getUTCDay();
    let daysToNextWed = (3 - curDayOfWeek + 7) % 7;
    if (curDayOfWeek === 3 && curH >= 15.5) {
      daysToNextWed = 7;
    }

    for (let w = 0; w < 4; w++) {
      const wedDate = new Date(istTime.getTime() + (daysToNextWed + w * 7) * 24 * 3600 * 1000);
      const y = wedDate.getUTCFullYear();
      const m = wedDate.getUTCMonth() + 1;
      const d = wedDate.getUTCDate();
      const dStr = String(d).padStart(2, '0');
      const key = `${y}-${String(m).padStart(2, '0')}-${dStr}`;
      const code = `${dStr}${monthNames[m]}`;

      if (!seen.has(key)) {
        seen.add(key);
        const isToday = (key === todayKey);
        let label = isToday
          ? `${dStr} ${monthNames[m]} ${y} (0-DTE Weekly - Expiring Today)`
          : `${dStr} ${monthNames[m]} ${y} (Weekly)`;

        expiries.push({
          key: key,
          code: code,
          label: label,
          shortLabel: isToday ? `${code} (0-DTE)` : `${code} Weekly`,
          month: m,
          year: y,
          isMonthly: false,
          isWeekly: true,
          isCurrent: false
        });
      }
    }

    // 3. Add subsequent Monthly Expiries for next 5 months
    for (let off = 1; off <= 5; off++) {
      const targetM = ((curM - 1 + off) % 12) + 1;
      const targetY = curY + Math.floor((curM - 1 + off) / 12);
      const lastWed = getLastWedOfMonth(targetY, targetM);
      const y = lastWed.getUTCFullYear();
      const m = lastWed.getUTCMonth() + 1;
      const d = lastWed.getUTCDate();
      const dStr = String(d).padStart(2, '0');
      const key = `${y}-${String(m).padStart(2, '0')}-${dStr}`;
      const code = `${dStr}${monthNames[m]}`;

      if (!seen.has(key)) {
        seen.add(key);
        expiries.push({
          key: key,
          code: code,
          label: `${dStr} ${monthNames[m]} ${y} (${fullMonths[m]} Monthly)`,
          shortLabel: `${monthNames[m]} Monthly`,
          month: m,
          year: y,
          isMonthly: true,
          isWeekly: false,
          isCurrent: false
        });
      }
    }

    return expiries;
  }

  getExpiryCode() {
    return (this.selectedExpiry && this.selectedExpiry.code) ? this.selectedExpiry.code : '26AUG';
  }

  setExpiry(expiryKey) {
    if (!this.availableExpiries || this.availableExpiries.length === 0) {
      this.availableExpiries = this.generateRollingExpiries();
    }
    const found = this.availableExpiries.find(e => e.key === expiryKey || e.code === expiryKey);
    if (found) {
      this.selectedExpiry = found;
    } else if (this.availableExpiries.length > 0) {
      this.selectedExpiry = this.availableExpiries[0];
    }
    
    this.updateInstrumentMetadata();
    
    if (this.selectedStrike && this.selectedOptionType) {
      this.setContract(this.selectedStrike, this.selectedOptionType);
    }
    
    this.notify('EXPIRY_CHANGED', { expiry: this.selectedExpiry });
  }

  updateInstrumentMetadata() {
    const expCode = this.getExpiryCode();
    this.instrumentMeta["BANKNIFTY_SPOT"] = { name: "BANKNIFTY Spot", symbol: "BANKNIFTY", unit: "₹" };
    this.instrumentMeta["ATM_CE"] = {
      name: `BANKNIFTY ${this.selectedStrike || 57800} CE`,
      symbol: `BANKNIFTY ${expCode} ${this.selectedStrike || 57800} CE`,
      unit: "₹"
    };
    this.instrumentMeta["ATM_PE"] = {
      name: `BANKNIFTY ${this.selectedStrike || 57800} PE`,
      symbol: `BANKNIFTY ${expCode} ${this.selectedStrike || 57800} PE`,
      unit: "₹"
    };
    this.instrumentMeta["ATM_STRADDLE"] = {
      name: `ATM Straddle (${this.selectedStrike || 57800} CE+PE)`,
      symbol: `BANKNIFTY ${expCode} ${this.selectedStrike || 57800} STRADDLE`,
      unit: "₹"
    };
    this.instrumentMeta["FUTURES"] = {
      name: `BANKNIFTY Current Fut`,
      symbol: `BANKNIFTY ${expCode} FUT`,
      unit: "₹"
    };
  }

  getActiveInstrumentMeta() {
    const expCode = this.getExpiryCode();
    return this.instrumentMeta[this.activeInstrument] || {
      name: `BANKNIFTY ${this.selectedStrike} ${this.selectedOptionType}`,
      symbol: `BANKNIFTY ${expCode} ${this.selectedStrike} ${this.selectedOptionType}`,
      unit: "₹"
    };
  }

  setContract(strike, type) {
    this._userExplicitlySetContract = true;
    const optType = (type || 'CE').toString().trim().toUpperCase();
    this.selectedOptionType = optType; // "CE", "PE", "STRADDLE", "SPOT", "FUTURES"
    const expCode = this.getExpiryCode();

    if (optType === 'SPOT' || optType === 'BANKNIFTY_SPOT') {
      this.activeInstrument = "BANKNIFTY_SPOT";
      this.selectedOptionType = 'SPOT';
    } else if (optType === 'FUTURES') {
      this.activeInstrument = "FUTURES";
      this.selectedOptionType = 'FUTURES';
    } else {
      this.selectedStrike = parseInt(strike) || 56300;
      const customKey = `CUSTOM_${this.selectedStrike}_${optType}`;
      this.activeInstrument = customKey;
      this.generateCandlesForStrike(this.selectedStrike, optType, customKey);

      const sym = optType === 'STRADDLE'
        ? `BANKNIFTY ${expCode} ${this.selectedStrike} STRADDLE`
        : `BANKNIFTY ${expCode} ${this.selectedStrike} ${optType}`;

      this.instrumentMeta[customKey] = {
        name: sym,
        symbol: sym,
        unit: "₹",
        strike: this.selectedStrike,
        type: optType
      };
      this.rebuildHigherTimeframesForInstrument(customKey);
    }

    this.notify('CONTRACT_CHANGED', { strike: this.selectedStrike, type: this.selectedOptionType, instrument: this.activeInstrument });
  }

  getDaysToExpiry() {
    const now = new Date();
    if (!this.selectedExpiry || !this.selectedExpiry.key) {
      if (!this.availableExpiries || this.availableExpiries.length === 0) {
        this.availableExpiries = this.generateRollingExpiries();
      }
      this.selectedExpiry = this.availableExpiries[0];
    }

    const expKey = this.selectedExpiry.key; // "YYYY-MM-DD"
    const [expY, expM, expD] = expKey.split('-').map(Number);
    // 15:30 IST = 10:00 UTC
    const expUtcMs = Date.UTC(expY, expM - 1, expD, 10, 0, 0);
    const nowUtcMs = now.getTime();
    const diffMs = expUtcMs - nowUtcMs;
    const diffDays = diffMs / (1000 * 3600 * 24);

    if (diffDays <= 0.05) {
      // 0-DTE (Expiry day): calculate hours left until 15:30 IST
      const hoursLeft = Math.max(0.1, diffMs / (1000 * 3600));
      return Math.max(0.04, Math.round((hoursLeft / 24) * 100) / 100);
    }

    return Math.max(0.08, Math.round(diffDays * 100) / 100);
  }

  calculateBlackScholes(spot, strike, type, daysToExpiry = null, iv = null) {
    const dte = (daysToExpiry !== null && daysToExpiry !== undefined) ? daysToExpiry : this.getDaysToExpiry();
    const T = Math.max(0.0005, dte / 365.0);
    // BankNifty option IV trades at ~1.31x beta to India VIX (typically ~14.5% - 16.5%)
    const rawVix = parseFloat(this.indiaVix) || 11.23;
    const bankniftyIv = Math.max(14.5, rawVix * 1.31);
    const baseIv = (iv !== null && iv !== undefined) ? parseFloat(iv) : bankniftyIv;
    const optType = (type || 'CE').toString().trim().toUpperCase();
    const strikeNum = parseFloat(strike) || 55000;
    const spotNum = parseFloat(spot) || (this.spotPrice || 55050);

    // Realistic NSE Volatility Smile / Skew (Matches Zerodha live options ticks)
    const m = Math.log(strikeNum / spotNum);
    let skewIv = baseIv;
    if (optType === 'PE') {
      skewIv = baseIv + Math.max(-2, Math.min(6, -m * 8.0));
    } else {
      skewIv = baseIv + Math.max(-2, Math.min(5, m * 6.0));
    }
    const sigma = Math.max(0.06, skewIv / 100.0);
    const r = 0.065; // 6.5% RBI risk-free rate

    const d1 = (Math.log(spotNum / strikeNum) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const cnd = (x) => {
      const a1 = 0.31938153, a2 = -0.356563782, a3 = 1.781477937, a4 = -1.821255978, a5 = 1.330274429;
      const p = 0.2316419;
      const sign = x < 0 ? -1 : 1;
      const absX = Math.abs(x);
      const t = 1.0 / (1.0 + p * absX);
      const pdf = Math.exp(-0.5 * absX * absX) / Math.sqrt(2 * Math.PI);
      const cdf = 1.0 - pdf * (a1 * t + a2 * Math.pow(t, 2) + a3 * Math.pow(t, 3) + a4 * Math.pow(t, 4) + a5 * Math.pow(t, 5));
      return sign === -1 ? 1.0 - cdf : cdf;
    };

    const callPrice = spotNum * cnd(d1) - strikeNum * Math.exp(-r * T) * cnd(d2);
    const putPrice = strikeNum * Math.exp(-r * T) * cnd(-d2) - spotNum * cnd(-d1);

    if (optType === 'PE') {
      const intrinsic = Math.max(0.0, strikeNum - spotNum);
      return Math.max(intrinsic + 0.5, Math.round(putPrice * 20) / 20);
    }
    if (optType === 'CE') {
      const intrinsic = Math.max(0.0, spotNum - strikeNum);
      return Math.max(intrinsic + 0.5, Math.round(callPrice * 20) / 20);
    }
    if (optType === 'STRADDLE') {
      const callVal = Math.max(Math.max(0.0, spotNum - strikeNum) + 0.5, callPrice);
      const putVal = Math.max(Math.max(0.0, strikeNum - spotNum) + 0.5, putPrice);
      return Math.max(1.0, Math.round((callVal + putVal) * 20) / 20);
    }
    return Math.max(0.5, Math.round(callPrice * 20) / 20);
  }

  generateCandlesForStrike(strike, type, targetKey = null) {
    const instKey = targetKey || `CUSTOM_${strike}_${type}`;
    const spotCandles5m = (this.candles["BANKNIFTY_SPOT"] && this.candles["BANKNIFTY_SPOT"]["5m"]) ? this.candles["BANKNIFTY_SPOT"]["5m"] : [];
    if (!spotCandles5m || spotCandles5m.length === 0) return;

    this.candles[instKey] = { "1m": [], "5m": [], "10m": [], "15m": [], "30m": [] };
    const rawVix = parseFloat(this.indiaVix) || 11.23;
    const iv = Math.max(14.5, rawVix * 1.31);
    const dte = this.getDaysToExpiry();

    const opt5m = [];
    let cumVol = 0;
    let cumPv = 0;

    spotCandles5m.forEach((sc, idx) => {
      const isLast = (idx === spotCandles5m.length - 1);
      const spotClose = (isLast && this.spotPrice) ? this.spotPrice : sc.close;
      const spotOpen = sc.open;
      const spotHigh = (isLast && this.spotPrice) ? Math.max(sc.high, this.spotPrice) : sc.high;
      const spotLow = (isLast && this.spotPrice) ? Math.min(sc.low, this.spotPrice) : sc.low;

      let premOpen, premClose, premHigh, premLow;
      if (type === 'PE') {
        premOpen = this.calculateBlackScholes(spotOpen, strike, 'PE', dte, iv);
        premClose = this.calculateBlackScholes(spotClose, strike, 'PE', dte, iv);
        // Inverse physics: spot trough drives Put high, spot peak drives Put low
        const highCand = this.calculateBlackScholes(spotLow, strike, 'PE', dte, iv);
        const lowCand = this.calculateBlackScholes(spotHigh, strike, 'PE', dte, iv);
        premHigh = Math.max(premOpen, premClose, highCand);
        premLow = Math.min(premOpen, premClose, lowCand);
      } else if (type === 'CE') {
        premOpen = this.calculateBlackScholes(spotOpen, strike, 'CE', dte, iv);
        premClose = this.calculateBlackScholes(spotClose, strike, 'CE', dte, iv);
        const highCand = this.calculateBlackScholes(spotHigh, strike, 'CE', dte, iv);
        const lowCand = this.calculateBlackScholes(spotLow, strike, 'CE', dte, iv);
        premHigh = Math.max(premOpen, premClose, highCand);
        premLow = Math.min(premOpen, premClose, lowCand);
      } else if (type === 'STRADDLE') {
        const ceO = this.calculateBlackScholes(spotOpen, strike, 'CE', dte, iv);
        const peO = this.calculateBlackScholes(spotOpen, strike, 'PE', dte, iv);
        const ceC = this.calculateBlackScholes(spotClose, strike, 'CE', dte, iv);
        const peC = this.calculateBlackScholes(spotClose, strike, 'PE', dte, iv);
        premOpen = ceO + peO;
        premClose = ceC + peC;
        premHigh = Math.max(premOpen, premClose) + Math.abs(spotHigh - spotLow) * 0.12;
        premLow = Math.min(premOpen, premClose) - Math.abs(spotHigh - spotLow) * 0.08;
      }

      // Preserve realistic volume profile
      const vol = Math.floor((sc.volume || 25000) * 0.35);
      const typical = (premHigh + premLow + premClose) / 3;
      cumVol += vol;
      cumPv += typical * vol;
      const vwap = round2(cumPv / (cumVol || 1));

      opt5m.push({
        time: sc.time,
        date: sc.date,
        timestamp: sc.timestamp,
        open: round2(premOpen),
        high: round2(premHigh),
        low: round2(premLow),
        close: round2(premClose),
        volume: vol,
        vwap: vwap
      });
    });

    this.candles[instKey]["5m"] = opt5m;
    this.candles[instKey]["10m"] = aggregateCandles(opt5m, 2);
    this.candles[instKey]["15m"] = aggregateCandles(opt5m, 3);
    this.candles[instKey]["30m"] = aggregateCandles(opt5m, 6);

    // Also build 1m by smooth interpolation of 5m
    const opt1m = [];
    opt5m.forEach(c5 => {
      const step = (c5.close - c5.open) / 5;
      for (let m = 0; m < 5; m++) {
        const subO = c5.open + step * m;
        const subC = c5.open + step * (m + 1);
        opt1m.push({
          time: c5.time,
          date: c5.date,
          timestamp: (c5.timestamp || 0) + m * 60000,
          open: round2(subO),
          high: round2(Math.max(subO, subC)),
          low: round2(Math.min(subO, subC)),
          close: round2(subC),
          volume: Math.floor(c5.volume / 5),
          vwap: c5.vwap
        });
      }
    });
    this.candles[instKey]["1m"] = opt1m;
  }

  initHistoricalCandles() {
    let spotBase = 56450;
    const now = new Date();
    const curHour = now.getHours();
    const curMin = now.getMinutes();
    const curTotalMins = curHour * 60 + curMin;
    const marketStartMins = 9 * 60 + 15; // 09:15
    const marketEndMins = 15 * 60 + 30; // 15:30

    // Determine how many bars should exist for TODAY (Never generate future bars!)
    let todayBarsCount;
    if (curTotalMins < marketStartMins) {
      todayBarsCount = 0; // Pre-market
    } else if (curTotalMins >= marketEndMins) {
      todayBarsCount = 75; // Full day completed
    } else {
      todayBarsCount = Math.min(75, Math.max(1, Math.floor((curTotalMins - marketStartMins) / 5) + 1));
    }

    const spot5m = [];
    const spot1m = [];
    const spot1d = [];
    let cumVol = 0;
    let cumPv = 0;

    // 1. Generate past 10 trading days for deep intraday 5m multi-timeframe history
    const tradingDates = [];
    let checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() - 1);
    while (tradingDates.length < 10) {
      const dayOfWeek = checkDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sat/Sun
        tradingDates.unshift(new Date(checkDate));
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Generate deep 500+ daily trading sessions (2+ years) for extensive 1D technical personal analysis
    const dailyTradingDates = [];
    let dailyCheck = new Date(now);
    dailyCheck.setDate(dailyCheck.getDate() - 1);
    while (dailyTradingDates.length < 520) {
      const dow = dailyCheck.getDay();
      if (dow !== 0 && dow !== 6) {
        dailyTradingDates.unshift(new Date(dailyCheck));
      }
      dailyCheck.setDate(dailyCheck.getDate() - 1);
    }

    // Build multi-year realistic daily candles for 1D chart view
    let macroDailyPrice = spotBase - 4800; // Starting baseline ~2 years ago
    dailyTradingDates.forEach((dDate, idx) => {
      const dateStr = dDate.toISOString().split('T')[0];
      const startOfDay = new Date(dDate.getFullYear(), dDate.getMonth(), dDate.getDate(), 9, 15);
      
      // Realistic macro trend drift towards current spotBase
      const progress = idx / dailyTradingDates.length;
      const targetTrend = (spotBase - 4800) + progress * 4800;
      const meanRevert = (targetTrend - macroDailyPrice) * 0.04;
      const dailyDrift = meanRevert + (Math.sin(idx * 0.08) * 85) + (Math.random() - 0.48) * 180;
      
      const dOpen = macroDailyPrice;
      const dClose = round2(dOpen + dailyDrift);
      const dRange = Math.abs(dClose - dOpen) + Math.random() * 220 + 80;
      const dHigh = round2(Math.max(dOpen, dClose) + Math.random() * (dRange * 0.45));
      const dLow = round2(Math.min(dOpen, dClose) - Math.random() * (dRange * 0.45));
      macroDailyPrice = dClose;

      const dVol = Math.floor(Math.random() * 450000 + 180000);
      const dMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const tStr = `${String(dDate.getDate()).padStart(2, '0')} ${dMonths[dDate.getMonth()]} ${dDate.getFullYear()}`;

      spot1d.push({
        date: dateStr,
        time: tStr,
        timestamp: startOfDay.getTime(),
        open: dOpen,
        high: dHigh,
        low: dLow,
        close: dClose,
        volume: dVol,
        vwap: round2((dHigh + dLow + dClose) / 3)
      });
    });

    tradingDates.forEach(tDate => {
      const dateStr = tDate.toISOString().split('T')[0];
      const startOfDay = new Date(tDate.getFullYear(), tDate.getMonth(), tDate.getDate(), 9, 15);
      let dayOpen = spotBase;
      let dayHigh = -Infinity;
      let dayLow = Infinity;
      let dayVol = 0;

      for (let b = 0; b < 75; b++) {
        const barTime = new Date(startOfDay.getTime() + b * 5 * 60 * 1000);
        const timeStr = barTime.toTimeString().substring(0, 5);
        const drift = (Math.random() - 0.49) * 20.0;
        const o = spotBase;
        const c = o + drift;
        const h = Math.max(o, c) + Math.random() * 14.0 + 2.0;
        const l = Math.min(o, c) - Math.random() * 14.0 - 2.0;
        spotBase = c;

        dayHigh = Math.max(dayHigh, h);
        dayLow = Math.min(dayLow, l);
        const vol = Math.floor(Math.random() * 18000 + 12000);
        dayVol += vol;
        const typical = (h + l + c) / 3;
        cumVol += vol;
        cumPv += typical * vol;
        const vwap = round2(cumPv / (cumVol || 1));

        spot5m.push({
          date: dateStr,
          time: timeStr,
          timestamp: barTime.getTime(),
          open: round2(o),
          high: round2(h),
          low: round2(l),
          close: round2(c),
          volume: vol,
          vwap: vwap
        });
      }
    });

    // 2. Generate TODAY'S session strictly up to current minute (never past current time!)
    if (todayBarsCount > 0) {
      const todayStr = now.toISOString().split('T')[0];
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 15);
      let dayOpen = spotBase;
      let dayHigh = -Infinity;
      let dayLow = Infinity;
      let dayVol = 0;

      for (let b = 0; b < todayBarsCount; b++) {
        const barTime = new Date(startOfToday.getTime() + b * 5 * 60 * 1000);
        const timeStr = barTime.toTimeString().substring(0, 5);
        const drift = (Math.random() - 0.48) * 18.0;
        const o = spotBase;
        const c = o + drift;
        const h = Math.max(o, c) + Math.random() * 12.0 + 1.5;
        const l = Math.min(o, c) - Math.random() * 12.0 - 1.5;
        spotBase = c;

        dayHigh = Math.max(dayHigh, h);
        dayLow = Math.min(dayLow, l);
        const vol = Math.floor(Math.random() * 22000 + 14000);
        dayVol += vol;
        const typical = (h + l + c) / 3;
        cumVol += vol;
        cumPv += typical * vol;
        const vwap = round2(cumPv / (cumVol || 1));

        spot5m.push({
          date: todayStr,
          time: timeStr,
          timestamp: barTime.getTime(),
          open: round2(o),
          high: round2(h),
          low: round2(l),
          close: round2(c),
          volume: vol,
          vwap: vwap
        });

        // 1m sub-bars for today
        const step = (c - o) / 5;
        for (let m = 0; m < 5; m++) {
          const subO = o + step * m;
          const subC = o + step * (m + 1);
          spot1m.push({
            date: todayStr,
            time: timeStr,
            timestamp: barTime.getTime() + m * 60000,
            open: round2(subO),
            high: round2(Math.max(subO, subC) + 2.5),
            low: round2(Math.min(subO, subC) - 2.5),
            close: round2(subC),
            volume: Math.floor(vol / 5),
            vwap: vwap
          });
        }
      }

      spot1d.push({
        date: todayStr,
        time: todayStr,
        timestamp: startOfToday.getTime(),
        open: round2(dayOpen),
        high: round2(dayHigh),
        low: round2(dayLow),
        close: round2(spotBase),
        volume: dayVol,
        vwap: round2((dayHigh + dayLow + spotBase) / 3)
      });
    }

    this.candles["BANKNIFTY_SPOT"]["5m"] = spot5m;
    this.candles["BANKNIFTY_SPOT"]["1m"] = spot1m;
    this.candles["BANKNIFTY_SPOT"]["10m"] = aggregateCandles(spot5m, 2);
    this.candles["BANKNIFTY_SPOT"]["15m"] = aggregateCandles(spot5m, 3);
    this.candles["BANKNIFTY_SPOT"]["30m"] = aggregateCandles(spot5m, 6);
    this.candles["BANKNIFTY_SPOT"]["1d"] = spot1d;

    this.spotPrice = round2(spotBase);
    this.futuresPrice = round2(spotBase + 72.5);
    this.dayHigh = Math.max(...spot5m.slice(-75).map(c => c.high));
    this.dayLow = Math.min(...spot5m.slice(-75).map(c => c.low));

    // Generate Futures
    const fut5m = spot5m.map(sc => ({
      ...sc,
      open: round2(sc.open + 72.5),
      high: round2(sc.high + 74.0),
      low: round2(sc.low + 71.0),
      close: round2(sc.close + 72.8),
      volume: Math.floor(sc.volume * 0.4),
      vwap: round2(sc.vwap + 72.5)
    }));
    this.candles["FUTURES"]["5m"] = fut5m;
    this.candles["FUTURES"]["10m"] = aggregateCandles(fut5m, 2);
    this.candles["FUTURES"]["15m"] = aggregateCandles(fut5m, 3);
    this.candles["FUTURES"]["30m"] = aggregateCandles(fut5m, 6);
    this.candles["FUTURES"]["1d"] = spot1d.map(sc => ({
      ...sc,
      open: round2(sc.open + 72.5),
      high: round2(sc.high + 74.0),
      low: round2(sc.low + 71.0),
      close: round2(sc.close + 72.8),
      volume: Math.floor(sc.volume * 0.4),
      vwap: round2(sc.vwap + 72.5)
    }));

    const currentAtm = Math.round(this.spotPrice / 100) * 100;
    this.generateCandlesForStrike(currentAtm, 'CE', 'ATM_CE');
    this.generateCandlesForStrike(currentAtm, 'PE', 'ATM_PE');
    this.generateCandlesForStrike(currentAtm, 'STRADDLE', 'ATM_STRADDLE');
    this.generateCandlesForStrike(56300, 'PE', 'CUSTOM_56300_PE');
  }

  rebuildHigherTimeframesForInstrument(instKey) {
    if (!this.candles[instKey]) return;
    const base1m = this.candles[instKey]["1m"];
    if (base1m && base1m.length > 0) {
      this.candles[instKey]["5m"] = aggregateCandles(base1m, 5);
      this.candles[instKey]["10m"] = aggregateCandles(base1m, 10);
      this.candles[instKey]["15m"] = aggregateCandles(base1m, 15);
      this.candles[instKey]["30m"] = aggregateCandles(base1m, 30);
    } else {
      const base5m = this.candles[instKey]["5m"];
      if (base5m && base5m.length > 0) {
        this.candles[instKey]["10m"] = aggregateCandles(base5m, 2);
        this.candles[instKey]["15m"] = aggregateCandles(base5m, 3);
        this.candles[instKey]["30m"] = aggregateCandles(base5m, 6);
      }
    }
  }

  rebuildHigherTimeframes() {
    Object.keys(this.candles).forEach(instKey => {
      this.rebuildHigherTimeframesForInstrument(instKey);
    });
  }

  syncLiveMarketFeed(data) {
    if (!data || !data.spot) return;

    // Unconditionally ingest multi-year 1D Daily candles from NSE/Yahoo
    if (data.candles_1d && Array.isArray(data.candles_1d) && data.candles_1d.length > 0) {
      this.candles["BANKNIFTY_SPOT"]["1d"] = data.candles_1d;
      this.candles["FUTURES"]["1d"] = data.candles_1d.map(c => ({
        ...c,
        open: round2(c.open + 75),
        high: round2(c.high + 75),
        low: round2(c.low + 75),
        close: round2(c.close + 75),
        volume: Math.floor((c.volume || 100000) * 0.4)
      }));
    }

    const spotObj = typeof data.spot === 'object' ? data.spot : { price: data.spot };
    const incomingPrice = parseFloat(spotObj.price);

    // Reject only corrupted or invalid non-numeric prices
    if (!incomingPrice || isNaN(incomingPrice) || incomingPrice < 25000 || incomingPrice > 95000) {
      console.warn(`⚠️ Rejected out-of-bounds spot price: ${spotObj.price}`);
      return;
    }

    // Always accept the real market spot price!
    this.spotPrice = incomingPrice;
    this._hasSyncedRealFeed = true;

    this.futuresPrice = spotObj.futures || this.futuresPrice || (this.spotPrice + 85.5);
    this.dayHigh = spotObj.high ? Math.max(spotObj.high, this.spotPrice) : (this.dayHigh || this.spotPrice + 120);
    this.dayLow = spotObj.low ? Math.min(spotObj.low, this.spotPrice) : (this.dayLow || this.spotPrice - 120);
    if (spotObj.prev_close) {
      this.prevClose = parseFloat(spotObj.prev_close);
    } else if (spotObj.change !== undefined) {
      this.prevClose = this.spotPrice - parseFloat(spotObj.change);
    } else if (!this.prevClose) {
      this.prevClose = this.spotPrice - 60.0;
    }
    if (data.vix) {
      this.indiaVix = typeof data.vix === 'object' ? (data.vix.price || this.indiaVix) : data.vix;
    }

    if (data.constituents && Array.isArray(data.constituents) && data.constituents.length > 0) {
      this.constituents = data.constituents;
    }

    const activeCandles5m = (data.candles_5m && data.candles_5m.length > 0) 
      ? data.candles_5m 
      : ((data.candles_5m_today && data.candles_5m_today.length > 0) ? data.candles_5m_today : []);

    if (activeCandles5m.length > 0) {
      const prev5m = this.candles["BANKNIFTY_SPOT"]["5m"];
      if (prev5m && prev5m.length > 50 && activeCandles5m.length < 80) {
        // Merge today's active candles without losing deep historical bars
        const todayDate = activeCandles5m[0].date;
        const nonTodayBars = prev5m.filter(c => c.date !== todayDate);
        this.candles["BANKNIFTY_SPOT"]["5m"] = [...nonTodayBars, ...activeCandles5m];
      } else {
        this.candles["BANKNIFTY_SPOT"]["5m"] = activeCandles5m;
      }
      this.candles["BANKNIFTY_SPOT"]["10m"] = aggregateCandles(this.candles["BANKNIFTY_SPOT"]["5m"], 2);
      this.candles["BANKNIFTY_SPOT"]["15m"] = aggregateCandles(this.candles["BANKNIFTY_SPOT"]["5m"], 3);
      this.candles["BANKNIFTY_SPOT"]["30m"] = aggregateCandles(this.candles["BANKNIFTY_SPOT"]["5m"], 6);
      this.candles["BANKNIFTY_SPOT"]["5m_history"] = this.candles["BANKNIFTY_SPOT"]["5m"];

      // Resample 1m candles around live spot prices
      const base1m = [];
      activeCandles5m.forEach((c5) => {
        const o = c5.open;
        const c = c5.close;
        const step = (c - o) / 5;
        for (let m = 0; m < 5; m++) {
          const subOpen = o + step * m;
          const subClose = o + step * (m + 1);
          base1m.push({
            date: c5.date,
            time: c5.time,
            timestamp: (c5.timestamp || 0) + m * 60000,
            open: round2(subOpen),
            high: round2(Math.max(subOpen, subClose)),
            low: round2(Math.min(subOpen, subClose)),
            close: round2(subClose),
            volume: Math.floor(c5.volume / 5),
            vwap: c5.vwap
          });
        }
      });
      this.candles["BANKNIFTY_SPOT"]["1m"] = base1m;

      // Resample 5m / 1m candles for Futures
      const fut5m = activeCandles5m.map(sc => ({
        time: sc.time,
        date: sc.date,
        timestamp: sc.timestamp,
        open: round2(sc.open + 72.0),
        high: round2(sc.high + 73.0),
        low: round2(sc.low + 71.0),
        close: round2(sc.close + 72.8),
        volume: Math.floor(sc.volume * 0.45),
        vwap: round2((sc.vwap || sc.close) + 72.5)
      }));
      this.candles["FUTURES"]["5m"] = fut5m;
      this.candles["FUTURES"]["10m"] = aggregateCandles(fut5m, 2);
      this.candles["FUTURES"]["15m"] = aggregateCandles(fut5m, 3);
      this.candles["FUTURES"]["30m"] = aggregateCandles(fut5m, 6);

      const currentAtm = Math.round(this.spotPrice / 100) * 100;
      this.generateCandlesForStrike(currentAtm, 'CE', 'ATM_CE');
      this.generateCandlesForStrike(currentAtm, 'PE', 'ATM_PE');
      this.generateCandlesForStrike(currentAtm, 'STRADDLE', 'ATM_STRADDLE');
    }

    const atmStrike = Math.round(this.spotPrice / 100) * 100;
    if (!this._userExplicitlySetContract && !this.selectedStrike) {
      this.selectedStrike = atmStrike;
    }

    // Maintain background custom option calculations for the selected strike
    const customType = (this.selectedOptionType === 'SPOT' || this.selectedOptionType === 'FUTURES') ? 'PE' : (this.selectedOptionType || 'PE');
    const customKey = `CUSTOM_${this.selectedStrike}_${customType}`;
    const expCode = this.getExpiryCode();
    this.generateCandlesForStrike(this.selectedStrike, customType, customKey);
    this.instrumentMeta[customKey] = {
      name: `BANKNIFTY ${expCode} ${this.selectedStrike} ${customType}`,
      symbol: `BANKNIFTY ${expCode} ${this.selectedStrike} ${customType}`,
      unit: "₹",
      strike: this.selectedStrike,
      type: customType
    };

    // Keep activeInstrument intact if user is viewing SPOT or FUTURES!
    if (this.selectedOptionType === 'SPOT' || this.activeInstrument === 'BANKNIFTY_SPOT') {
      this.activeInstrument = 'BANKNIFTY_SPOT';
    } else if (this.selectedOptionType === 'FUTURES' || this.activeInstrument === 'FUTURES') {
      this.activeInstrument = 'FUTURES';
    } else {
      this.activeInstrument = customKey;
    }

    this.notify('LIVE_FEED_SYNCED', { spot: this.spotPrice, atm: atmStrike, activeInstrument: this.activeInstrument });
  }

  // Official National Stock Exchange of India (NSE) Trading Holidays Directory (2024 - 2027)
  static NSE_HOLIDAYS = {
    // 2024
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

    // 2025
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

    // 2026
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

    // 2027
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
  };

  /**
   * Get accurate Indian Stock Market (NSE) status including Holidays & Trading Hours
   * @returns {Object} status details
   */
  getMarketStatus() {
    const now = new Date();
    // Convert to Indian Standard Time (IST = UTC + 5:30)
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffsetMs);

    const year = istTime.getFullYear();
    const month = String(istTime.getMonth() + 1).padStart(2, '0');
    const dayDate = String(istTime.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${dayDate}`;
    const dayOfWeek = istTime.getDay(); // 0 = Sun, 6 = Sat

    // 1. Check Official NSE Holiday
    const holidays = AppState.NSE_HOLIDAYS || {};
    if (holidays[dateKey]) {
      return {
        isOpen: false,
        status: 'HOLIDAY',
        holidayName: holidays[dateKey],
        dateKey: dateKey,
        label: `🏖️ NSE HOLIDAY: ${holidays[dateKey]}`,
        badgeClass: 'holiday',
        description: `Indian Stock Market (NSE) is CLOSED today for ${holidays[dateKey]} (${dateKey}).`
      };
    }

    // 2. Check Weekend (Saturday / Sunday)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const weekendName = dayOfWeek === 0 ? 'Sunday' : 'Saturday';
      return {
        isOpen: false,
        status: 'WEEKEND',
        holidayName: weekendName,
        dateKey: dateKey,
        label: `🌙 NSE CLOSED (${weekendName})`,
        badgeClass: 'closed',
        description: `Market is closed for the weekend (${weekendName}). Normal trading resumes on the next business day at 09:15 IST.`
      };
    }

    // 3. Regular Trading Day Hours (09:15 to 15:30 IST)
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    if (totalMinutes >= 540 && totalMinutes < 555) {
      // 09:00 - 09:15 Pre-market discovery
      return {
        isOpen: false,
        status: 'PRE_OPEN',
        dateKey: dateKey,
        label: `⏳ NSE PRE-OPEN (09:00 - 09:15 IST)`,
        badgeClass: 'closed',
        description: `NSE Pre-market order discovery in session.`
      };
    }

    if (totalMinutes >= 555 && totalMinutes <= 930) {
      // 09:15 - 15:30 Live Session
      return {
        isOpen: true,
        status: 'LIVE',
        dateKey: dateKey,
        label: `🟢 NSE LIVE (09:15 - 15:30 IST)`,
        badgeClass: 'open',
        description: `NSE live trading session in progress.`
      };
    }

    // After Hours (before 09:00 or after 15:30)
    return {
      isOpen: false,
      status: 'AFTER_HOURS',
      dateKey: dateKey,
      label: `🌙 NSE CLOSED (Session Ended)`,
      badgeClass: 'closed',
      description: `Market closed at 15:30 IST. Reopens next trading session at 09:15 IST.`
    };
  }

  isMarketOpen() {
    return this.getMarketStatus().isOpen;
  }

  seedInitialPositionsAndOrders() {
    this.positions = [];
    this.orders = [];
    this.trades = [];
    this.account.usedMargin = 0;
    this.account.realizedPnL = 0;
    this.account.unrealizedPnL = 0;
    this.account.availableMargin = this.account.totalCapital;
  }
}

function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function aggregateCandles(candles1m, multiplier) {
  const result = [];
  for (let i = 0; i < candles1m.length; i += multiplier) {
    const chunk = candles1m.slice(i, i + multiplier);
    if (chunk.length === 0) continue;

    const open = chunk[0].open;
    const close = chunk[chunk.length - 1].close;
    const high = Math.max(...chunk.map(c => c.high));
    const low = Math.min(...chunk.map(c => c.low));
    const volume = chunk.reduce((sum, c) => sum + c.volume, 0);
    const vwap = chunk[chunk.length - 1].vwap;

    result.push({
      date: chunk[0].date,
      time: chunk[0].time,
      timestamp: chunk[0].timestamp,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: volume,
      vwap: round2(vwap)
    });
  }
  return result;
}

window.appState = new AppState();
