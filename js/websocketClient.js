/**
 * BankNifty AlgoEdge Pro - Client-side WebSocket Real-Time Bridge
 * ==============================================================
 * Connects to the local Node.js WebSocket Streamer (ws://localhost:8081)
 * to receive sub-10ms real-time ticks, update live candles dynamically,
 * and calculate live network ping latency.
 */

(function () {
  'use strict';

  class WebSocketMarketClient {
    constructor() {
      const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '127.0.0.1';
      this.wsUrl = `ws://${host}:8081`;
      this.socket = null;
      this.isConnected = false;
      this.reconnectTimer = null;
      this.pingTimer = null;
      this.lastPingSent = 0;
      this.latencyMs = 0;
      this.badgeElement = null;
    }

    init() {
      this.createOrUpdateBadge();
      this.connect();
    }

    createOrUpdateBadge() {
      let badge = document.getElementById('ws-latency-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'ws-latency-badge';
        badge.className = 'market-stat-item ws-badge';
        badge.style.cursor = 'pointer';
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.gap = '5px';
        badge.style.fontSize = '0.72rem';
        badge.style.fontWeight = '700';
        badge.style.fontFamily = 'var(--font-mono)';
        badge.style.padding = '2px 8px';
        badge.style.borderRadius = '4px';
        badge.style.background = 'rgba(15, 23, 42, 0.7)';
        badge.style.border = '1px solid var(--border-medium)';
        badge.title = 'Click to reconnect Node.js WebSocket Streamer';
        badge.innerHTML = `
          <span class="pulse-dot" style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#94A3B8;"></span>
          <span id="ws-badge-text" style="color: #94A3B8;">WS: Offline</span>
        `;
        badge.addEventListener('click', () => {
          this.connect(true);
        });

        // Insert into header market stats
        const headerStats = document.querySelector('.header-market-stats');
        if (headerStats) {
          headerStats.insertBefore(badge, headerStats.firstChild);
        }
      }
      this.badgeElement = badge;
    }

    updateBadge(status, text, color) {
      if (!this.badgeElement) this.createOrUpdateBadge();
      const dot = this.badgeElement ? this.badgeElement.querySelector('.pulse-dot') : null;
      const label = document.getElementById('ws-badge-text');
      if (dot) dot.style.background = color;
      if (label) {
        label.textContent = text;
        label.style.color = color;
      }
    }

    connect(force = false) {
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        if (!force) return;
        try { this.socket.close(); } catch (e) {}
      }

      this.updateBadge('connecting', 'WS: Syncing...', '#F59E0B');

      try {
        this.socket = new WebSocket(this.wsUrl);
      } catch (e) {
        this.onConnectionFailed();
        return;
      }

      this.socket.onopen = () => {
        this.isConnected = true;
        this.updateBadge('connected', '⚡ WS: Active (<10ms)', '#10B981');
        if (window.showToast) {
          window.showToast('⚡ Connected to Node.js Sub-Millisecond Market Streamer', 'success');
        }
        this.startPingLoop();
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          // Ignore malformed packets
        }
      };

      this.socket.onclose = () => {
        this.onConnectionFailed();
      };

      this.socket.onerror = () => {
        this.onConnectionFailed();
      };
    }

    onConnectionFailed() {
      this.isConnected = false;
      this.stopPingLoop();
      this.updateBadge('offline', 'WS: Standby', '#64748B');

      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 5000);
      }
    }

    startPingLoop() {
      this.stopPingLoop();
      this.pingTimer = setInterval(() => {
        if (this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.lastPingSent = Date.now();
          this.socket.send(JSON.stringify({ type: 'PING', client_time: this.lastPingSent }));
        }
      }, 3000);
    }

    stopPingLoop() {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
    }

    handleMessage(data) {
      if (data.type === 'PONG') {
        const roundTrip = Date.now() - (data.client_time || this.lastPingSent);
        this.latencyMs = roundTrip;
        const color = roundTrip < 20 ? '#10B981' : (roundTrip < 60 ? '#38BDF8' : '#F59E0B');
        this.updateBadge('connected', `⚡ WS: ${roundTrip}ms`, color);
        return;
      }

      if (data.type === 'TICK') {
        this.handleMarketTick(data);
      } else if (data.type === 'BROKER_ALERT') {
        if (window.showToast) {
          window.showToast(data.message, 'warning');
        }
      }
    }

    handleMarketTick(tick) {
      const spot = parseFloat(tick.spot);
      if (isNaN(spot) || spot <= 0) return;

      const appState = window.appState;
      if (!appState) return;

      // Update state spot price
      appState.spotPrice = spot;
      if (tick.prev_close && !isNaN(tick.prev_close)) {
        appState.prevClose = parseFloat(tick.prev_close);
      } else if (!appState.prevClose || isNaN(appState.prevClose)) {
        appState.prevClose = spot - (parseFloat(tick.change) || 0);
      }

      // Update header spot display with micro-flash
      const spotEl = document.getElementById('hdr-spot-price');
      const chgEl = document.getElementById('hdr-spot-chg') || document.getElementById('hdr-spot-change');
      if (spotEl) {
        spotEl.textContent = `₹${spot.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      if (chgEl && tick.change !== undefined && !isNaN(tick.change)) {
        const isUp = tick.change >= 0;
        chgEl.textContent = `${isUp ? '+' : ''}${Number(tick.change).toFixed(2)} (${isUp ? '+' : ''}${Number(tick.change_pct).toFixed(2)}%)`;
        chgEl.className = `stat-change ${isUp ? 'bull' : 'bear'}`;
      }

      // Live Strike LTP recalculation on every tick
      const atmStrike = Math.round(spot / 100) * 100;
      const currentSelectedStrike = appState.selectedStrike || atmStrike;
      const currentSelectedType = appState.selectedOptionType || 'PE';
      const liveOptionLtp = appState.calculateBlackScholes(spot, currentSelectedStrike, currentSelectedType);

      // Update Candles Table LTP Badge
      const ltpBadge = document.getElementById('candles-tbl-ltp-badge');
      if (ltpBadge) {
        ltpBadge.textContent = `LTP: ₹${liveOptionLtp.toFixed(2)} (Premium / Share)`;
      }

      // Update 1 Lot value badge
      const lotBadge = document.getElementById('candles-tbl-lot-badge');
      if (lotBadge) {
        const lotVal = liveOptionLtp * (appState.lotSize || 30);
        lotBadge.textContent = `📦 1 Lot (${appState.lotSize || 30} Qty): ₹${lotVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }

      // Update quick scalp buttons with real-time calibrated option prices
      const btnCe = document.getElementById('quick-buy-ce');
      const btnPe = document.getElementById('quick-buy-pe');
      const atmCeLtp = appState.calculateBlackScholes(spot, atmStrike, 'CE');
      const atmPeLtp = appState.calculateBlackScholes(spot, atmStrike, 'PE');
      if (btnCe) btnCe.textContent = `BUY ${atmStrike} CE (₹${atmCeLtp.toFixed(1)})`;
      if (btnPe) btnPe.textContent = `BUY ${atmStrike} PE (₹${atmPeLtp.toFixed(1)})`;

      // Update active chart's latest candle in real-time
      if (window.app && window.app.chartEngine) {
        const engine = window.app.chartEngine;
        if (engine.data && engine.data.length > 0) {
          const lastBar = engine.data[engine.data.length - 1];
          const barVal = (currentSelectedType === 'SPOT') ? spot : liveOptionLtp;
          lastBar.close = barVal;
          lastBar.high = Math.max(lastBar.high, barVal);
          lastBar.low = Math.min(lastBar.low, barVal);
          lastBar.volume = (lastBar.volume || 1000) + 10;
          if (typeof engine.render === 'function') {
            engine.render();
          }
        }
      }

      // Throttled refresh of Option Chain & Strike Advisor (every 2 seconds)
      const now = Date.now();
      if (!this._lastUiThrottledTime || now - this._lastUiThrottledTime > 2000) {
        this._lastUiThrottledTime = now;
        const optPanel = document.getElementById('tab-optionchain');
        if (optPanel && optPanel.classList.contains('active') && window.optionChainEngine) {
          window.optionChainEngine.renderTable('option-chain-body');
        }
        if (window.strikeAdvisor) {
          if (typeof window.strikeAdvisor.evaluateLiveHealth === 'function') {
            window.strikeAdvisor.evaluateLiveHealth();
          }
          if (typeof window.strikeAdvisor.updateLivePrices === 'function') {
            window.strikeAdvisor.updateLivePrices();
          }
        }
      }

      // If active position open, update live PnL in trade table
      if (typeof appState.updatePositionsMarketPrice === 'function') {
        appState.updatePositionsMarketPrice(spot);
      }
    }

    sendPanicSquareOff() {
      if (this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'PANIC_SQUAREOFF', timestamp: Date.now() }));
      }
    }
  }

  // Expose global client instance
  window.wsMarketClient = new WebSocketMarketClient();

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.wsMarketClient.init());
  } else {
    setTimeout(() => window.wsMarketClient.init(), 100);
  }
})();
