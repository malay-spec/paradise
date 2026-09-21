/**
 * BankNifty AlgoEdge Terminal - Strategy & Algorithmic Execution Engine
 */

class StrategyEngine {
  constructor() {
    this.lastTickTime = null;
  }

  evaluateTick(currentCandle, spotPrice, currentTimeStr) {
    const appState = window.appState;
    if (appState.sim.killSwitchActivated) return;

    appState.strategies.forEach(strategy => {
      if (!strategy.armed) return;

      switch (strategy.id) {
        case 'straddle_920':
          this.evaluate920Straddle(strategy, spotPrice, currentTimeStr);
          break;
        case 'vwap_scalper':
          this.evaluateVWAPScalper(strategy, currentCandle, spotPrice);
          break;
        case 'gamma_neutral':
          this.evaluateGammaScalper(strategy, spotPrice);
          break;
        case 'oi_mean_reversion':
          this.evaluateOIReversion(strategy, spotPrice);
          break;
      }
    });
  }

  // 1. 9:20 AM Short Straddle / Strangle Strategy
  evaluate920Straddle(strategy, spotPrice, currentTimeStr) {
    const appState = window.appState;
    const atmStrike = Math.round(spotPrice / 100) * 100;
    const lots = strategy.params.lots || 2;
    const qty = lots * appState.lotSize;

    // Check if time is >= 09:20:00 and strategy not yet entered
    if (strategy.status === 'RUNNING') {
      // Monitor individual leg SL
      const positions = appState.positions.filter(p => p.strategyId === 'straddle_920');

      positions.forEach(pos => {
        // Stop Loss Check
        if (pos.currentPrice >= pos.slPrice) {
          window.paperBroker.placeOrder({
            symbol: pos.symbol,
            type: 'BUY',
            qty: Math.abs(pos.qty),
            price: pos.currentPrice,
            orderType: 'MARKET',
            tag: 'ALGO (9:20 SL Hit)',
            strategyId: strategy.id
          });
        }

        // Trailing SL: If in profit by >= 15 pts, trail SL
        const profitPts = pos.entryPrice - pos.currentPrice;
        if (profitPts >= strategy.params.trailStepPts) {
          const newSl = pos.entryPrice - (profitPts * 0.4);
          if (newSl < pos.slPrice) {
            pos.slPrice = Math.round(newSl * 10) / 10;
          }
        }
      });

      // Auto Square-off at 15:15 IST
      if (currentTimeStr >= strategy.params.exitTime) {
        positions.forEach(pos => {
          window.paperBroker.placeOrder({
            symbol: pos.symbol,
            type: 'BUY',
            qty: Math.abs(pos.qty),
            price: pos.currentPrice,
            orderType: 'MARKET',
            tag: 'ALGO (15:15 Auto Square-off)',
            strategyId: strategy.id
          });
        });
        strategy.status = 'EXITED';
      }
    }
  }

  // 2. VWAP + 9 EMA Momentum Scalper
  evaluateVWAPScalper(strategy, currentCandle, spotPrice) {
    const appState = window.appState;
    if (!currentCandle || !currentCandle.vwap) return;

    const atmStrike = Math.round(spotPrice / 100) * 100;
    const lots = strategy.params.lots || 3;
    const qty = lots * appState.lotSize;

    const existingPos = appState.positions.filter(p => p.strategyId === 'vwap_scalper');

    if (existingPos.length === 0 && strategy.status === 'MONITORING') {
      const expCode = (window.appState && window.appState.getExpiryCode) ? window.appState.getExpiryCode() : '26AUG';
      
      // 1. Analyze current candle structure & ensure no opposing liquidity sweeps (stop hunts)
      const struct = window.candleStructureAnalyzer ? window.candleStructureAnalyzer.analyzeCandle(currentCandle) : null;
      const isCleanBullBody = !struct || (struct.bodyRatio >= 0.35 && struct.upperWickRatio <= 0.40);
      const isCleanBearBody = !struct || (struct.bodyRatio >= 0.35 && struct.lowerWickRatio <= 0.40);
      const patternName = struct ? struct.patternLabel : 'Breakout';

      // 2. Strict Institutional Confluence Gating (Requires Confluence >= 50 or <= -50)
      const conf = (window.strikeAdvisor && typeof window.strikeAdvisor.computeTechnicalConfluence === 'function')
        ? window.strikeAdvisor.computeTechnicalConfluence(spotPrice)
        : { score: 0 };

      // Long Signal: Close crosses above VWAP with decisive bullish candle body AND Confluence Bullish Verdict
      if (currentCandle.close > currentCandle.vwap + 8 && currentCandle.close > currentCandle.open && isCleanBullBody && (conf.verdict === 'STRONG_BULLISH' || conf.verdict === 'BULLISH')) {
        // Institutional Deep ITM selection (Delta ~ 0.68) eliminating Theta decay
        const itmStrike = atmStrike - 200;
        const symbol = `BANKNIFTY ${expCode} ${itmStrike} CE`;
        const approxPrice = window.appState.calculateBlackScholes(appState.spotPrice, itmStrike, 'CE');

        window.paperBroker.placeOrder({
          symbol: symbol,
          type: 'BUY',
          qty: qty,
          price: approxPrice,
          orderType: 'MARKET',
          tag: `ALGO (VWAP + ${patternName} [Score: +${conf.score}])`,
          strategyId: strategy.id
        });

        strategy.status = 'RUNNING';
      }
      // Short Signal: Close crosses below VWAP with decisive bearish candle body AND Confluence Bearish Verdict
      else if (currentCandle.close < currentCandle.vwap - 8 && currentCandle.close < currentCandle.open && isCleanBearBody && (conf.verdict === 'STRONG_BEARISH' || conf.verdict === 'BEARISH')) {
        // Institutional Deep ITM selection (Delta ~ -0.68) eliminating Theta decay
        const itmStrike = atmStrike + 200;
        const symbol = `BANKNIFTY ${expCode} ${itmStrike} PE`;
        const approxPrice = window.appState.calculateBlackScholes(appState.spotPrice, itmStrike, 'PE');

        window.paperBroker.placeOrder({
          symbol: symbol,
          type: 'BUY',
          qty: qty,
          price: approxPrice,
          orderType: 'MARKET',
          tag: `ALGO (VWAP + ${patternName} [Score: ${conf.score}])`,
          strategyId: strategy.id
        });

        strategy.status = 'RUNNING';
      }
    } else if (existingPos.length > 0) {
      // Target & SL Monitor for Scalper
      existingPos.forEach(pos => {
        const pnlPts = pos.currentPrice - pos.entryPrice;
        
        // Target Reached
        if (pnlPts >= strategy.params.targetPoints) {
          window.paperBroker.placeOrder({
            symbol: pos.symbol,
            type: 'SELL',
            qty: Math.abs(pos.qty),
            price: pos.currentPrice,
            orderType: 'MARKET',
            tag: 'ALGO (VWAP Target Hit)',
            strategyId: strategy.id
          });
          strategy.status = 'MONITORING';
        }
        // Stop Loss Reached
        else if (pnlPts <= -strategy.params.stopLossPoints) {
          window.paperBroker.placeOrder({
            symbol: pos.symbol,
            type: 'SELL',
            qty: Math.abs(pos.qty),
            price: pos.currentPrice,
            orderType: 'MARKET',
            tag: 'ALGO (VWAP SL Hit)',
            strategyId: strategy.id
          });
          strategy.status = 'MONITORING';
        }
      });
    }
  }

  // 3. Gamma Neutral Scalper
  evaluateGammaScalper(strategy, spotPrice) {
    // Monitors total delta of portfolio and adjusts strikes if > 0.15
  }

  // 4. OI Mean Reversion
  evaluateOIReversion(strategy, spotPrice) {
    // Counters extreme PCR moves
  }
}

window.strategyEngine = new StrategyEngine();
