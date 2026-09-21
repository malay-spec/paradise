/**
 * BankNifty AlgoEdge Terminal - Candlestick Structure & Price Action Analysis Engine
 * 
 * Provides institutional-grade candlestick structure recognition:
 * - Individual Candle Anatomy (Body %, Wick Ratios, Rejection Shadows)
 * - Candlestick Patterns (Hammer, Shooting Star, Engulfing, Marubozu, Doji, Inside Bar)
 * - Market Structure & Swings (Higher Highs/Lows vs Lower Highs/Lows, BOS, CHoCH)
 * - Confluence Scoring for Strike Advisor & Algorithmic Execution
 */

class CandleStructureAnalyzer {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Analyze a single candle's internal anatomy and classify its structure
   * @param {Object} candle { open, high, low, close, volume, time }
   * @returns {Object} detailed anatomical metrics & pattern classification
   */
  analyzeCandle(candle) {
    if (!candle) return null;

    const o = parseFloat(candle.open) || 0;
    const h = parseFloat(candle.high) || 0;
    const l = parseFloat(candle.low) || 0;
    const c = parseFloat(candle.close) || 0;

    const range = Math.max(0.01, h - l);
    const body = Math.abs(c - o);
    const isBull = c >= o;

    const upperWick = isBull ? (h - c) : (h - o);
    const lowerWick = isBull ? (o - l) : (c - l);

    const bodyRatio = Math.min(1.0, body / range);
    const upperWickRatio = Math.min(1.0, upperWick / range);
    const lowerWickRatio = Math.min(1.0, lowerWick / range);

    let pattern = 'NEUTRAL';
    let patternLabel = 'Normal Bar';
    let signal = 'NEUTRAL'; // 'BULLISH', 'BEARISH', 'NEUTRAL'
    let score = 0; // -20 to +20

    // 1. Doji (Body <= 10% of total range)
    if (bodyRatio <= 0.10) {
      if (lowerWickRatio >= 0.65) {
        pattern = 'DRAGONFLY_DOJI';
        patternLabel = 'Dragonfly Doji (Bull Rejection)';
        signal = 'BULLISH';
        score = 15;
      } else if (upperWickRatio >= 0.65) {
        pattern = 'GRAVESTONE_DOJI';
        patternLabel = 'Gravestone Doji (Bear Rejection)';
        signal = 'BEARISH';
        score = -15;
      } else {
        pattern = 'DOJI';
        patternLabel = 'Doji (Equilibrium / Indecision)';
        signal = 'NEUTRAL';
        score = 0;
      }
    }
    // 2. Hammer / Pin Bar Bullish (Long lower wick >= 60%, small body <= 25% at top, upper wick <= 15%)
    else if (lowerWickRatio >= 0.58 && bodyRatio <= 0.28 && upperWickRatio <= 0.18) {
      pattern = 'HAMMER';
      patternLabel = isBull ? 'Bullish Hammer (Demand Rejection)' : 'Hanging Man / Hammer (Buying Tail)';
      signal = 'BULLISH';
      score = isBull ? 20 : 14;
    }
    // 3. Shooting Star / Pin Bar Bearish (Long upper wick >= 60%, small body <= 25% at bottom, lower wick <= 18%)
    else if (upperWickRatio >= 0.58 && bodyRatio <= 0.28 && lowerWickRatio <= 0.18) {
      pattern = 'SHOOTING_STAR';
      patternLabel = 'Shooting Star (Supply Rejection)';
      signal = 'BEARISH';
      score = -20;
    }
    // 4. Marubozu / Expansion Momentum Candle (Body >= 75% of range, minimal wicks)
    else if (bodyRatio >= 0.72) {
      if (isBull) {
        pattern = 'BULLISH_MARUBOZU';
        patternLabel = 'Bullish Expansion Marubozu';
        signal = 'BULLISH';
        score = 20;
      } else {
        pattern = 'BEARISH_MARUBOZU';
        patternLabel = 'Bearish Expansion Marubozu';
        signal = 'BEARISH';
        score = -20;
      }
    }
    // 5. Spinning Top (Small body 11-30%, balanced wicks)
    else if (bodyRatio <= 0.30 && Math.abs(upperWickRatio - lowerWickRatio) < 0.25) {
      pattern = 'SPINNING_TOP';
      patternLabel = 'Spinning Top (Compression)';
      signal = 'NEUTRAL';
      score = 0;
    }
    // 6. Normal Directional Bars
    else {
      if (isBull) {
        pattern = 'BULLISH_BAR';
        patternLabel = upperWickRatio > 0.35 ? 'Bullish Bar (Upper Shadow Friction)' : 'Bullish Trend Bar';
        signal = 'BULLISH';
        score = upperWickRatio > 0.35 ? 5 : 10;
      } else {
        pattern = 'BEARISH_BAR';
        patternLabel = lowerWickRatio > 0.35 ? 'Bearish Bar (Lower Absorption)' : 'Bearish Trend Bar';
        signal = 'BEARISH';
        score = lowerWickRatio > 0.35 ? -5 : -10;
      }
    }

    return {
      o, h, l, c,
      range: Math.round(range * 100) / 100,
      body: Math.round(body * 100) / 100,
      upperWick: Math.round(upperWick * 100) / 100,
      lowerWick: Math.round(lowerWick * 100) / 100,
      bodyRatio: Math.round(bodyRatio * 100) / 100,
      upperWickRatio: Math.round(upperWickRatio * 100) / 100,
      lowerWickRatio: Math.round(lowerWickRatio * 100) / 100,
      isBull,
      pattern,
      patternLabel,
      signal,
      score,
      time: candle.time
    };
  }

  /**
   * Analyze multi-candle patterns across the last 2-3 bars
   */
  analyzeMultiCandle(candles, idx = null) {
    if (!candles || candles.length < 2) return null;
    const end = (idx !== null && idx >= 1 && idx < candles.length) ? idx : (candles.length - 1);
    const curr = candles[end];
    const prev = candles[end - 1];
    const prev2 = end >= 2 ? candles[end - 2] : null;

    const cCurr = this.analyzeCandle(curr);
    const cPrev = this.analyzeCandle(prev);

    let pattern = null;
    let label = null;
    let signal = 'NEUTRAL';
    let score = 0;

    // 1. Bullish Engulfing
    // Prev is Bearish, Curr is Bullish, Curr body completely covers Prev body
    if (!cPrev.isBull && cCurr.isBull && curr.close >= prev.open && curr.open <= prev.close) {
      pattern = 'BULLISH_ENGULFING';
      label = 'Bullish Engulfing Reversal';
      signal = 'BULLISH';
      score = 25;
    }
    // 2. Bearish Engulfing
    // Prev is Bullish, Curr is Bearish, Curr body completely covers Prev body
    else if (cPrev.isBull && !cCurr.isBull && curr.close <= prev.open && curr.open >= prev.close) {
      pattern = 'BEARISH_ENGULFING';
      label = 'Bearish Engulfing Breakdown';
      signal = 'BEARISH';
      score = -25;
    }
    // 3. Inside Bar (Harami - Volatility Compression)
    else if (curr.high <= prev.high && curr.low >= prev.low) {
      pattern = 'INSIDE_BAR';
      label = 'Inside Bar (NR Compression)';
      signal = 'NEUTRAL';
      score = 0;
    }
    // 4. Piercing Line (Bullish Reversal: Open below prev low, close > 50% into prev red body)
    else if (!cPrev.isBull && cCurr.isBull && curr.open < prev.low && curr.close > (prev.open + prev.close) / 2) {
      pattern = 'PIERCING_LINE';
      label = 'Piercing Line Bullish Reversal';
      signal = 'BULLISH';
      score = 18;
    }
    // 5. Dark Cloud Cover (Bearish Reversal: Open above prev high, close < 50% into prev green body)
    else if (cPrev.isBull && !cCurr.isBull && curr.open > prev.high && curr.close < (prev.open + prev.close) / 2) {
      pattern = 'DARK_CLOUD_COVER';
      label = 'Dark Cloud Cover Bearish Rejection';
      signal = 'BEARISH';
      score = -18;
    }
    // 6. Morning Star (3-bar sequence: Big Bearish -> Small Doji/Star -> Strong Bullish)
    else if (prev2) {
      const cPrev2 = this.analyzeCandle(prev2);
      if (!cPrev2.isBull && cPrev.bodyRatio <= 0.35 && cCurr.isBull && curr.close > (prev2.open + prev2.close) / 2) {
        pattern = 'MORNING_STAR';
        label = 'Morning Star (Major Bull Reversal)';
        signal = 'BULLISH';
        score = 28;
      }
      // 7. Evening Star (3-bar sequence: Big Bullish -> Small Star -> Strong Bearish)
      else if (cPrev2.isBull && cPrev.bodyRatio <= 0.35 && !cCurr.isBull && curr.close < (prev2.open + prev2.close) / 2) {
        pattern = 'EVENING_STAR';
        label = 'Evening Star (Major Bearish Reversal)';
        signal = 'BEARISH';
        score = -28;
      }
    }

    return {
      pattern,
      label,
      signal,
      score,
      curr: cCurr,
      prev: cPrev
    };
  }

  /**
   * Evaluate Market Swing Structure (HH/HL vs LH/LL, BOS, CHoCH)
   * @param {Array} candles Array of candles
   * @returns {Object} Market Structure metrics
   */
  analyzeMarketStructure(candles) {
    if (!candles || candles.length < 5) {
      return {
        structure: 'NEUTRAL',
        structureLabel: 'Consolidating / Initializing',
        trend: 0,
        score: 0,
        swings: [],
        bos: null
      };
    }

    // Find Swing Highs and Swing Lows (Fractal pivots)
    const swingHighs = [];
    const swingLows = [];

    for (let i = 2; i < candles.length - 2; i++) {
      const h = candles[i].high;
      const l = candles[i].low;

      // Pivot High: higher than 2 bars left and 2 bars right
      if (h > candles[i - 1].high && h > candles[i - 2].high && h >= candles[i + 1].high && h >= candles[i + 2].high) {
        swingHighs.push({ index: i, price: h, time: candles[i].time });
      }

      // Pivot Low: lower than 2 bars left and 2 bars right
      if (l < candles[i - 1].low && l < candles[i - 2].low && l <= candles[i + 1].low && l <= candles[i + 2].low) {
        swingLows.push({ index: i, price: l, time: candles[i].time });
      }
    }

    const lastCandle = candles[candles.length - 1];
    let structure = 'NEUTRAL';
    let structureLabel = 'Range-Bound Consolidation';
    let trend = 0; // 1 = Bullish, -1 = Bearish, 0 = Neutral
    let score = 0;
    let bos = null;
    let sweep = null;

    // Check HH/HL vs LH/LL over recent pivots
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const sh1 = swingHighs[swingHighs.length - 1];
      const sh2 = swingHighs[swingHighs.length - 2];
      const sl1 = swingLows[swingLows.length - 1];
      const sl2 = swingLows[swingLows.length - 2];

      const higherHigh = sh1.price > sh2.price;
      const higherLow = sl1.price > sl2.price;
      const lowerHigh = sh1.price < sh2.price;
      const lowerLow = sl1.price < sl2.price;

      if (higherHigh && higherLow) {
        structure = 'BULLISH_HH_HL';
        structureLabel = 'Bullish Market Structure (Higher Highs & Higher Lows)';
        trend = 1;
        score = 20;
      } else if (lowerHigh && lowerLow) {
        structure = 'BEARISH_LH_LL';
        structureLabel = 'Bearish Market Structure (Lower Highs & Lower Lows)';
        trend = -1;
        score = -20;
      } else if (lowerHigh && higherLow) {
        structure = 'TRIANGLE_COMPRESSION';
        structureLabel = 'Volatility Squeeze (Lower Highs + Higher Lows)';
        trend = 0;
        score = 0;
      }

      // Check for Liquidity Sweeps (Stop-Hunt Traps) vs Clean Break of Structure (BOS)
      const lastRange = Math.max(0.01, lastCandle.high - lastCandle.low);
      const lastUpperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
      const lastLowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
      const upperWickPct = lastUpperWick / lastRange;
      const lowerWickPct = lastLowerWick / lastRange;

      if (sh1) {
        if (lastCandle.high > sh1.price && lastCandle.close < sh1.price && upperWickPct >= 0.35) {
          sweep = {
            type: 'BEARISH_LIQUIDITY_SWEEP',
            level: sh1.price,
            label: `Bearish Liquidity Sweep (Swept ₹${sh1.price.toFixed(1)} High & Rejected — Bull Trap)`
          };
          score -= 30;
        } else if (lastCandle.close > sh1.price) {
          bos = { type: 'BULLISH_BOS', level: sh1.price, label: `Bullish Break of Structure (BOS above ₹${sh1.price.toFixed(1)})` };
          score += 15;
        }
      }

      if (sl1 && !sweep) {
        if (lastCandle.low < sl1.price && lastCandle.close > sl1.price && lowerWickPct >= 0.35) {
          sweep = {
            type: 'BULLISH_LIQUIDITY_SWEEP',
            level: sl1.price,
            label: `Bullish Liquidity Sweep (Swept ₹${sl1.price.toFixed(1)} Low & Reclaimed — Bear Trap)`
          };
          score += 30;
        } else if (lastCandle.close < sl1.price) {
          bos = { type: 'BEARISH_BOS', level: sl1.price, label: `Bearish Breakdown of Structure (BOS below ₹${sl1.price.toFixed(1)})` };
          score -= 15;
        }
      }
    } else {
      // Fallback to recent 10-bar linear slope if fewer pivots
      const slice10 = candles.slice(-10);
      const firstClose = slice10[0].close;
      const lastClose = slice10[slice10.length - 1].close;
      const diff = lastClose - firstClose;
      if (diff > 15) {
        structure = 'BULLISH_MICRO';
        structureLabel = 'Bullish Short-Term Momentum';
        trend = 1;
        score = 10;
      } else if (diff < -15) {
        structure = 'BEARISH_MICRO';
        structureLabel = 'Bearish Short-Term Drift';
        trend = -1;
        score = -10;
      }
    }

    return {
      structure,
      structureLabel,
      trend,
      score,
      swingHighs,
      swingLows,
      bos,
      sweep
    };
  }

  /**
   * Unified Candlestick Structure Score & Insights for AI Strike Advisor & Algorithmic Bots
   * @param {Array} candles Active instrument candles
   * @returns {Object} Comprehensive Candlestick Structure Confluence
   */
  getStructureScore(candles) {
    if (!candles || candles.length === 0) {
      return {
        score: 0,
        patternName: 'No Candle Data',
        marketStructure: 'N/A',
        rejection: 'None',
        reasons: ['Candle data initializing'],
        lastCandleStats: null
      };
    }

    const lastCandle = candles[candles.length - 1];
    const single = this.analyzeCandle(lastCandle);
    const multi = this.analyzeMultiCandle(candles);
    const market = this.analyzeMarketStructure(candles);

    const reasons = [];
    let totalScore = 0;

    // 1. Single Bar Anatomy Impact (Weight: 35%)
    totalScore += single.score * 0.45;
    if (single.pattern === 'HAMMER' || single.pattern === 'DRAGONFLY_DOJI') {
      reasons.push(`Bullish Demand Tail: ${Math.round(single.lowerWickRatio * 100)}% lower wick rejection`);
    } else if (single.pattern === 'SHOOTING_STAR' || single.pattern === 'GRAVESTONE_DOJI') {
      reasons.push(`Bearish Supply Wick: ${Math.round(single.upperWickRatio * 100)}% upper wick rejection`);
    } else if (single.pattern === 'BULLISH_MARUBOZU') {
      reasons.push(`Bullish Expansion: Strong ${Math.round(single.bodyRatio * 100)}% body drive`);
    } else if (single.pattern === 'BEARISH_MARUBOZU') {
      reasons.push(`Bearish Breakdown: Heavy ${Math.round(single.bodyRatio * 100)}% selling drive`);
    }

    // 2. Multi-Bar Pattern Impact (Weight: 35%)
    if (multi && multi.pattern) {
      totalScore += multi.score * 0.50;
      reasons.push(`Pattern: ${multi.label}`);
    }

    // 3. Market Structure & Swings Impact (Weight: 30%)
    totalScore += market.score * 0.45;
    reasons.push(`Structure: ${market.structureLabel}`);
    if (market.bos) {
      reasons.push(market.bos.label);
    }
    if (market.sweep) {
      reasons.push(`🪤 ${market.sweep.label}`);
    }

    // Normalize final score between -35 and +35
    const clampedScore = Math.max(-35, Math.min(35, Math.round(totalScore)));

    // Determine active pattern title (prioritize institutional liquidity trap if present)
    let activePattern = (multi && multi.pattern) ? multi.label : single.patternLabel;
    if (market.sweep) {
      activePattern = market.sweep.label;
    }

    // Determine rejection context
    let rejection = 'Neutral Pressure';
    if (single.lowerWickRatio >= 0.45) rejection = `Bullish Low Rejection (${Math.round(single.lowerWickRatio * 100)}% lower wick)`;
    else if (single.upperWickRatio >= 0.45) rejection = `Bearish High Rejection (${Math.round(single.upperWickRatio * 100)}% upper wick)`;
    else if (single.bodyRatio >= 0.70) rejection = single.isBull ? 'Bullish Dominance (Minimal Wicks)' : 'Bearish Dominance (Minimal Wicks)';

    return {
      score: clampedScore,
      patternName: activePattern,
      marketStructure: market.structureLabel,
      rejection: rejection,
      reasons: reasons,
      lastCandleStats: {
        time: single.time,
        open: single.o,
        high: single.h,
        low: single.l,
        close: single.c,
        range: single.range,
        bodyPct: Math.round(single.bodyRatio * 100),
        upperWickPct: Math.round(single.upperWickRatio * 100),
        lowerWickPct: Math.round(single.lowerWickRatio * 100),
        isBull: single.isBull,
        pattern: single.pattern
      },
      swings: {
        highs: market.swingHighs,
        lows: market.swingLows
      }
    };
  }
}

// Global Singleton instance
window.candleStructureAnalyzer = new CandleStructureAnalyzer();
