/**
 * BankNifty AlgoEdge Terminal - Paper Broker & Execution Engine
 * Handles realistic fills, slippage, Indian regulatory charges, and Emergency Kill Switch.
 */

class PaperBroker {
  constructor() {
    this.brokeragePerOrder = 20.00; // ₹20 flat discount broker model
    this.sttRate = 0.000625; // 0.0625% on option sell turnover
    this.exchangeTurnoverRate = 0.0005; // 0.05% on premium turnover
    this.gstRate = 0.18; // 18% GST on (Brokerage + Exchange + SEBI)
    this.sebiTurnoverRate = 0.000001; // ₹10 per crore
    this.stampDutyRate = 0.00003; // 0.003% on buy turnover
  }

  // Calculate Indian F&O regulatory taxes for a transaction
  calculateCharges(type, price, qty) {
    const turnover = price * Math.abs(qty);
    const brokerage = this.brokeragePerOrder;
    
    // STT is levied only on Sell side for Options
    const stt = (type === 'SELL') ? turnover * this.sttRate : 0.0;
    const exchangeCharge = turnover * this.exchangeTurnoverRate;
    const sebiCharge = turnover * this.sebiTurnoverRate;
    const stampDuty = (type === 'BUY') ? turnover * this.stampDutyRate : 0.0;
    const gst = (brokerage + exchangeCharge + sebiCharge) * this.gstRate;

    const totalCharges = brokerage + stt + exchangeCharge + sebiCharge + stampDuty + gst;
    return {
      turnover,
      brokerage,
      stt,
      exchangeCharge,
      sebiCharge,
      stampDuty,
      gst,
      totalCharges: Math.round(totalCharges * 100) / 100
    };
  }

  // Place and simulate an order
  placeOrder({ symbol, type, qty, lots, orderType = 'MARKET', price = 0, tag = 'MANUAL', strategyId = null }) {
    const appState = window.appState;
    const finalQty = qty || (lots ? lots * (appState.lotSize || 30) : (appState.lotSize || 30));

    if (appState.account.maxDailyLossReached) {
      if (window.showToast) window.showToast('Order Blocked: Daily Max Loss Limit Reached!', 'error');
      return null;
    }

    if (appState.sim.killSwitchActivated) {
      if (window.showToast) window.showToast('Order Blocked: Kill Switch Active!', 'error');
      return null;
    }

    const orderId = `ORD_${Date.now().toString().slice(-6)}`;
    const nowTime = new Date().toTimeString().substring(0, 8);

    // Apply realistic slippage (0.05% - 0.15% for market orders)
    let fillPrice = price;
    if (orderType === 'MARKET') {
      const slippage = (Math.random() * 0.001 + 0.0005) * (type === 'BUY' ? 1 : -1);
      fillPrice = price * (1 + slippage);
    }
    fillPrice = Math.round(fillPrice * 20) / 20; // 0.05 tick size

    const charges = this.calculateCharges(type, fillPrice, finalQty);

    const newOrder = {
      id: orderId,
      time: nowTime,
      symbol,
      type,
      qty: finalQty,
      price: fillPrice,
      orderType,
      status: 'FILLED',
      tag,
      charges: charges.totalCharges,
      strategyId
    };

    appState.orders.unshift(newOrder);
    appState.account.totalCharges += charges.totalCharges;

    // Update or Create Position
    this.updatePositionFromOrder(newOrder);

    // Play Sound & Toast (Only for user actions, not background automated ticks)
    if (tag.includes('MANUAL') || tag.includes('KILL_SWITCH')) {
      if (window.soundEffects) window.soundEffects.playOrderFilled();
      if (window.showToast) {
        window.showToast(`${type} ${qty}x ${symbol} @ ₹${fillPrice.toFixed(2)} Filled`, 'success');
      }
    }

    appState.notify('ORDER_FILLED', newOrder);
    return newOrder;
  }

  updatePositionFromOrder(order) {
    const appState = window.appState;
    const existingIndex = appState.positions.findIndex(p => p.symbol === order.symbol);

    const signedQty = order.type === 'BUY' ? order.qty : -order.qty;

    if (existingIndex !== -1) {
      const pos = appState.positions[existingIndex];
      const newSignedQty = pos.qty + signedQty;

      if (newSignedQty === 0) {
        // Position Squared off
        const realized = (pos.qty > 0)
          ? (order.price - pos.entryPrice) * pos.qty
          : (pos.entryPrice - order.price) * Math.abs(pos.qty);

        appState.account.realizedPnL += realized;

        // Add to trade history
        appState.trades.unshift({
          id: `TRD_${Date.now().toString().slice(-6)}`,
          symbol: pos.symbol,
          entryPrice: pos.entryPrice,
          exitPrice: order.price,
          qty: Math.abs(pos.qty),
          realizedPnL: realized,
          exitTime: order.time,
          tag: order.tag
        });

        appState.positions.splice(existingIndex, 1);
      } else {
        // Average or partial reduce
        pos.qty = newSignedQty;
        pos.currentPrice = order.price;
      }
    } else {
      // New Position
      appState.positions.push({
        id: `POS_${Date.now().toString().slice(-6)}`,
        strategyId: order.strategyId,
        strategyName: order.tag,
        symbol: order.symbol,
        type: order.type,
        qty: signedQty,
        lots: Math.abs(signedQty) / appState.lotSize,
        entryPrice: order.price,
        currentPrice: order.price,
        slPrice: order.type === 'BUY' ? order.price * 0.85 : order.price * 1.25,
        targetPrice: order.type === 'BUY' ? order.price * 1.30 : order.price * 0.70,
        pnl: 0.0,
        pnlPct: '0.00%',
        status: 'OPEN'
      });
    }

    this.recalculatePortfolio();
  }

  // Update floating PnL on each market tick
  updatePositionsMarketPrice(spotPrice) {
    const appState = window.appState;
    let totalUnrealized = 0;

    appState.positions.forEach(pos => {
      // Approximate option price movement with delta
      const isCE = pos.symbol.includes('CE');
      const deltaSign = isCE ? 1 : -1;
      const spotChange = spotPrice - appState.prevClose;
      
      const estimatedPrice = Math.max(1.0, pos.entryPrice + (spotChange * 0.45 * deltaSign) * 0.2);
      pos.currentPrice = Math.round(estimatedPrice * 20) / 20;

      const pnl = (pos.qty > 0)
        ? (pos.currentPrice - pos.entryPrice) * pos.qty
        : (pos.entryPrice - pos.currentPrice) * Math.abs(pos.qty);

      pos.pnl = Math.round(pnl * 100) / 100;
      pos.pnlPct = ((pos.pnl / (pos.entryPrice * Math.abs(pos.qty))) * 100).toFixed(2) + '%';

      totalUnrealized += pos.pnl;
    });

    appState.account.unrealizedPnL = Math.round(totalUnrealized * 100) / 100;
    this.recalculatePortfolio();
  }

  recalculatePortfolio() {
    const appState = window.appState;
    const totalPnL = appState.account.realizedPnL + appState.account.unrealizedPnL;

    // Check Max Daily Loss Limit
    if (totalPnL <= -appState.account.maxDailyLossLimit && !appState.account.maxDailyLossReached) {
      appState.account.maxDailyLossReached = true;
      this.emergencyKillSwitch("Daily Max Loss Threshold of ₹" + appState.account.maxDailyLossLimit.toLocaleString() + " Breached!");
    }

    // Update Used Margin based on Open Positions (Approx ₹1.2L per short lot, ₹50k per long)
    let margin = 0;
    appState.positions.forEach(p => {
      const lotCount = Math.abs(p.qty) / appState.lotSize;
      margin += (p.qty < 0) ? lotCount * 120000 : lotCount * 45000;
    });

    appState.account.usedMargin = margin;
    appState.account.availableMargin = Math.max(0, appState.account.initialCapital + totalPnL - margin);
  }

  // Emergency Panic Kill Switch
  emergencyKillSwitch(reason = "Emergency Square-Off Triggered") {
    const appState = window.appState;
    appState.sim.killSwitchActivated = true;

    if (window.soundEffects) window.soundEffects.playKillSwitch();

    // Square off all open positions immediately
    const openPositions = [...appState.positions];
    openPositions.forEach(pos => {
      const exitType = pos.qty > 0 ? 'SELL' : 'BUY';
      const exitQty = Math.abs(pos.qty);
      
      this.placeOrder({
        symbol: pos.symbol,
        type: exitType,
        qty: exitQty,
        orderType: 'MARKET',
        price: pos.currentPrice,
        tag: 'KILL_SWITCH_EXIT',
        strategyId: pos.strategyId
      });
    });

    // Disarm all strategies
    appState.strategies.forEach(s => {
      s.armed = false;
      s.status = 'STOPPED';
    });

    if (window.showToast) {
      window.showToast(`🚨 KILL SWITCH: ${reason}. All positions squared off and algos paused!`, 'error');
    }

    appState.notify('KILL_SWITCH', { reason });
  }
}

window.paperBroker = new PaperBroker();
