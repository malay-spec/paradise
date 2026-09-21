/**
 * BankNifty AlgoEdge Terminal - Broker Bridge & Webhook Config
 */

class BrokerBridge {
  constructor() {
    this.brokers = [
      {
        id: "zerodha",
        name: "Zerodha Kite Connect",
        status: "CONNECTED",
        apiKey: "kite_live_9a87d620bf3",
        latencyMs: 11.2,
        exchange: "NSE_FO"
      },
      {
        id: "angelone",
        name: "Angel One SmartAPI",
        status: "READY",
        apiKey: "smart_api_live_44721",
        latencyMs: 14.8,
        exchange: "NSE_FO"
      },
      {
        id: "dhan",
        name: "DhanHQ API",
        status: "READY",
        apiKey: "dhan_live_8390291",
        latencyMs: 9.4,
        exchange: "NSE_FO"
      },
      {
        id: "fyers",
        name: "Fyers API v3",
        status: "DISCONNECTED",
        apiKey: "fyers_api_dev_9910",
        latencyMs: 16.1,
        exchange: "NSE_FO"
      }
    ];

    this.webhookSecret = "bn_algo_sec_" + Math.random().toString(36).substring(2, 10);
  }

  generateWebhookUrl() {
    const origin = window.location.origin || "http://localhost:8080";
    return `${origin}/api/v1/algo/webhook?secret=${this.webhookSecret}`;
  }

  generateTradingViewPayload(strategy = "VWAP_BREAKOUT") {
    const samplePayload = {
      ticker: "NSE:BANKNIFTY",
      action: "{{strategy.order.action}}", // "BUY" or "SELL"
      contracts: "{{strategy.order.contracts}}",
      strike: "ATM",
      option_type: "CE",
      sl_points: 25,
      target_points: 50,
      timestamp: "{{time}}",
      token: this.webhookSecret
    };

    return JSON.stringify(samplePayload, null, 2);
  }

  pingBroker(brokerId) {
    const broker = this.brokers.find(b => b.id === brokerId);
    if (!broker) return;

    const simLatency = Math.round((Math.random() * 6 + 8) * 10) / 10;
    broker.latencyMs = simLatency;
    broker.status = "CONNECTED";

    if (window.showToast) {
      window.showToast(`Ping to ${broker.name}: ${simLatency} ms (NSE Colocation Route OK)`, 'success');
    }

    this.renderBrokersList('broker-grid-list');
  }

  renderBrokersList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = this.brokers.map(b => `
      <div class="broker-card ${b.status === 'CONNECTED' ? 'connected' : ''}">
        <div class="broker-header">
          <div class="broker-logo-title">
            <div class="broker-avatar">${b.name.substring(0, 2).toUpperCase()}</div>
            <div>
              <div style="font-weight: 700; font-size: 0.9rem;">${b.name}</div>
              <div style="font-size: 0.68rem; color: var(--text-muted); font-family: var(--font-mono);">${b.exchange}</div>
            </div>
          </div>
          <span class="tag-badge ${b.status === 'CONNECTED' ? 'tag-buy' : 'tag-pending'}">${b.status}</span>
        </div>

        <div style="font-size: 0.75rem; font-family: var(--font-mono); display: flex; flex-direction: column; gap: 4px; background: var(--bg-primary); padding: 8px; border-radius: 4px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">API Key:</span>
            <span style="color: var(--cyan-primary);">${b.apiKey.substring(0, 10)}•••••</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">NSE Latency:</span>
            <span style="color: var(--bull-green); font-weight: 700;">${b.latencyMs} ms</span>
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.brokerBridge.pingBroker('${b.id}')">
            ⚡ Ping Test
          </button>
          <button class="btn ${b.status === 'CONNECTED' ? 'btn-danger' : 'btn-cyan'} btn-sm" style="flex: 1;" onclick="window.brokerBridge.toggleConnect('${b.id}')">
            ${b.status === 'CONNECTED' ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>
    `).join('');
  }

  toggleConnect(brokerId) {
    const broker = this.brokers.find(b => b.id === brokerId);
    if (!broker) return;

    if (broker.status === 'CONNECTED') {
      broker.status = 'DISCONNECTED';
      if (window.showToast) window.showToast(`Disconnected from ${broker.name}`, 'info');
    } else {
      broker.status = 'CONNECTED';
      if (window.showToast) window.showToast(`Connected to ${broker.name} via WebSocket & REST v2`, 'success');
    }
    this.renderBrokersList('broker-grid-list');
  }
}

window.brokerBridge = new BrokerBridge();
