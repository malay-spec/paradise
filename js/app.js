/**
 * BankNifty AlgoEdge Terminal - Main Application Orchestrator
 */

// Global Toast System with strict throttling to prevent popup clutter
let lastToastTime = 0;
window.showToast = function(message, type = 'info') {
  const now = Date.now();
  // Throttle non-critical toasts to prevent spam
  if (type !== 'error' && now - lastToastTime < 3000) return;
  lastToastTime = now;

  const container = document.getElementById('toast-container');
  if (!container) return;

  // Keep only 1 toast on screen at a time
  container.innerHTML = '';

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div style="flex: 1; font-size: 0.78rem;">${message}</div>
    <button style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0 4px;" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 2400);
};

class Application {
  constructor() {
    this.chartEngine = null;
    this.simTimer = null;
  }

  init() {
    console.log("⚡ Initializing BankNifty AlgoEdge Terminal...");

    // Initialize Theme (Dark / Light Mode)
    this.initTheme();

    // Initialize Dynamic Strikes & Options Strip centered on live spot
    this.rebuildDynamicStrikeSelectorAndPills();
    this.populateExpiryDropdowns();

    // Initialize Chart
    this.chartEngine = new window.ChartEngine('banknifty-chart', 'chart-legend-content');
    this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
    setTimeout(() => { if (this.chartEngine) this.chartEngine.resize(); }, 80);
    setTimeout(() => { if (this.chartEngine) this.chartEngine.resize(); }, 250);
    setTimeout(() => { if (this.chartEngine) this.chartEngine.resize(); }, 600);
    window.addEventListener('load', () => { if (this.chartEngine) this.chartEngine.resize(); });

    // Initial Renders
    this.renderHeaderStats();
    this.renderTickerConstituents();
    this.renderPositionsTable();
    this.renderOrdersTable();
    this.renderStrategyCards();
    this.renderCandlesBollingerTable();
    if (window.strikeAdvisor) {
      window.strikeAdvisor.renderSuggestions('strike-suggestions-container');
      window.strikeAdvisor.updateHeaderAccuracyBadge();
    }
    window.optionChainEngine.renderTable('option-chain-body');
    window.brokerBridge.renderBrokersList('broker-grid-list');

    // Run Initial Backtest
    this.runDefaultBacktest();

    // Initialize Multi-Chart Split Screen Engine & Resizer
    this.initSplitScreenCharts();
    this.initSplitScreenResizer();

    // Event Listeners
    this.bindEvents();

    // Start Real-time Live Market Simulation Loop
    this.startSimulationLoop();

    // Fetch and Sync Live Real NSE Market Data
    this.fetchLiveMarketData();
    setInterval(() => this.fetchLiveMarketData(), 4000);

    // Subscribe to State Changes
    window.appState.subscribe((event, payload) => {
      this.handleStateUpdate(event, payload);
    });

    if (window.showToast) {
      window.showToast('🟢 LIVE NSE Market Feed Connected: BANKNIFTY Real-Time', 'success');
    }
  }

  bindEvents() {
    // Expiry Dropdown Selectors
    const handleExpiryChange = (newKey) => {
      window.appState.setExpiry(newKey);

      const chartSelect = document.getElementById('chart-expiry-select');
      const optSelect = document.getElementById('optchain-expiry-select');
      if (chartSelect && chartSelect.value !== newKey) chartSelect.value = newKey;
      if (optSelect && optSelect.value !== newKey) optSelect.value = newKey;

      this.updateActiveOptionStrip(window.appState.selectedStrike, window.appState.selectedOptionType || 'CE');
      window.optionChainEngine.renderTable('option-chain-body');
      if (window.strikeAdvisor) {
        window.strikeAdvisor.generateStrikeSuggestions(true);
        window.strikeAdvisor.renderSuggestions('strike-suggestions-container');
      }
      this.renderOrdersTable();
      this.renderPositionsTable();
      if (this.chartEngine && (!this.splitLayout || this.splitLayout === '1')) {
        this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
      }

      if (window.showToast) {
        window.showToast(`📅 Expiry switched to: ${window.appState.selectedExpiry.label}`, 'info');
      }
    };

    const chartExp = document.getElementById('chart-expiry-select');
    if (chartExp) {
      chartExp.addEventListener('change', (e) => handleExpiryChange(e.target.value));
    }
    const optExp = document.getElementById('optchain-expiry-select');
    if (optExp) {
      optExp.addEventListener('change', (e) => handleExpiryChange(e.target.value));
    }

    // PWA Desktop / Mobile Install Button Handler
    const pwaBtn = document.getElementById('btn-pwa-install');
    if (pwaBtn) {
      pwaBtn.addEventListener('click', () => {
        if (window.deferredPWAInstallPrompt) {
          window.deferredPWAInstallPrompt.prompt();
          window.deferredPWAInstallPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
              if (window.showToast) window.showToast('🎉 AlgoEdge Pro Installed Successfully!', 'success');
              pwaBtn.style.display = 'none';
            }
            window.deferredPWAInstallPrompt = null;
          });
        } else {
          const isMac = navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
          let msg = '📲 To Install: Click the Install icon in your browser URL bar!';
          if (isIOS) {
            msg = "📲 On iOS: Tap Share (⎋) in Safari and select 'Add to Home Screen'!";
          } else if (isMac) {
            msg = "📲 On Mac Chrome/Edge: Click the Install App icon (💻) at the right end of the address bar!";
          }
          if (window.showToast) window.showToast(msg, 'info');
        }
      });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.deferredPWAInstallPrompt = e;
      if (pwaBtn) pwaBtn.style.display = 'inline-flex';
    });

    window.addEventListener('appinstalled', () => {
      window.deferredPWAInstallPrompt = null;
      if (pwaBtn) pwaBtn.style.display = 'none';
      if (window.showToast) window.showToast('🚀 BankNifty AlgoEdge is running in Standalone App mode!', 'success');
    });

    // Force Refresh & Update App Handler (Designed specifically for standalone PWA on Mac & Desktop)
    const forceRefreshBtn = document.getElementById('btn-force-refresh');
    const updateBanner = document.getElementById('pwa-update-banner');
    const updateReloadBtn = document.getElementById('btn-update-reload');
    const updateDismissBtn = document.getElementById('btn-update-dismiss');

    const triggerAppHardRefresh = async () => {
      if (window.showToast) {
        window.showToast('🔄 Purging stale cache & reloading latest updates...', 'info');
      }
      try {
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (let reg of registrations) {
            await reg.update();
            await reg.unregister();
          }
        }
      } catch (err) {
        console.warn('Cache purge note:', err);
      }
      const targetUrl = new URL(window.location.href);
      targetUrl.searchParams.set('t', Date.now());
      window.location.replace(targetUrl.toString());
    };

    if (forceRefreshBtn) {
      forceRefreshBtn.addEventListener('click', () => triggerAppHardRefresh());
    }
    if (updateReloadBtn) {
      updateReloadBtn.addEventListener('click', () => triggerAppHardRefresh());
    }
    if (updateDismissBtn && updateBanner) {
      updateDismissBtn.addEventListener('click', () => { updateBanner.style.display = 'none'; });
    }

    // Bind Global Keyboard Shortcuts (Cmd+R, Ctrl+R, Cmd+Shift+R, Ctrl+Shift+R, F5) inside Standalone App
    window.addEventListener('keydown', (e) => {
      const isMac = navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isReload = (isMac && e.metaKey && e.key.toLowerCase() === 'r') ||
                       (!isMac && e.ctrlKey && e.key.toLowerCase() === 'r') ||
                       e.key === 'F5';
      if (isReload) {
        e.preventDefault();
        e.stopPropagation();
        triggerAppHardRefresh();
      }
    }, true);

    // Market Status Indicator Click -> Opens NSE Holiday Calendar Modal
    const marketStatusPill = document.getElementById('market-status-indicator');
    if (marketStatusPill) {
      marketStatusPill.addEventListener('click', () => {
        this.openHolidayModal();
      });
    }

    // Collapsible Navigation Drawer Handlers
    const drawer = document.getElementById('collapsible-views-drawer');
    const backdrop = document.getElementById('nav-drawer-backdrop');
    const btnToggleDrawer = document.getElementById('btn-toggle-nav-drawer');
    const btnCloseDrawer = document.getElementById('btn-close-nav-drawer');

    const toggleDrawer = (forceState) => {
      if (!drawer || !backdrop) return;
      const isOpen = forceState !== undefined ? forceState : !drawer.classList.contains('open');
      drawer.classList.toggle('open', isOpen);
      backdrop.classList.toggle('active', isOpen);
      setTimeout(() => {
        if (this.chartEngine) this.chartEngine.resize();
      }, 300);
    };

    if (btnToggleDrawer) {
      btnToggleDrawer.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDrawer();
      });
    }
    if (btnCloseDrawer) {
      btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => toggleDrawer(false));
    }

    // Keyboard Shortcuts for Navigation
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        toggleDrawer(false);
      } else if (e.key === 'm' || e.key === 'M' || (e.altKey && e.key.toLowerCase() === 'm')) {
        e.preventDefault();
        toggleDrawer();
      } else if (e.altKey && e.key >= '1' && e.key <= '6') {
        e.preventDefault();
        const tabMap = { '1': 'terminal', '2': 'strategies', '3': 'builder', '4': 'backtest', '5': 'optionchain', '6': 'broker' };
        if (tabMap[e.key]) {
          this.switchTab(tabMap[e.key]);
          toggleDrawer(false);
        }
      }
    });

    // Drawer Navigation Tab Buttons
    document.querySelectorAll('.drawer-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabTarget = btn.getAttribute('data-tab');
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.classList.remove('ws-split-active');
        document.querySelectorAll('.drawer-ws-btn, .ws-split-btn').forEach(b => b.classList.remove('active'));
        const stdBtn = document.querySelector('.drawer-ws-btn[data-ws-split="standard"]');
        if (stdBtn) stdBtn.classList.add('active');
        this.switchTab(tabTarget);
        toggleDrawer(false);
      });
    });

    // Drawer Workspace Split Buttons
    document.querySelectorAll('.drawer-ws-btn, .ws-split-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.drawer-ws-btn, .ws-split-btn').forEach(b => b.classList.remove('active'));
        const mode = btn.getAttribute('data-ws-split');
        document.querySelectorAll(`.drawer-ws-btn[data-ws-split="${mode}"], .ws-split-btn[data-ws-split="${mode}"]`).forEach(b => b.classList.add('active'));
        this.switchWorkspaceSplitMode(mode);
        toggleDrawer(false);
      });
    });

    // Sub Tabs in Bottom Trade Area

    // Sub Tabs in Bottom Trade Area
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const targetTable = btn.getAttribute('data-subtab');
        document.getElementById('positions-subtab').style.display = targetTable === 'positions' ? 'block' : 'none';
        document.getElementById('orders-subtab').style.display = targetTable === 'orders' ? 'block' : 'none';
        document.getElementById('trades-subtab').style.display = targetTable === 'trades' ? 'block' : 'none';
        const candlesSub = document.getElementById('candles-table-subtab');
        if (candlesSub) {
          candlesSub.style.display = targetTable === 'candles-table' ? 'block' : 'none';
          if (targetTable === 'candles-table') this.renderCandlesBollingerTable();
        }
      });
    });

    // Dedicated Candles Table Strike & Option Type Switcher
    const tblStrike = document.getElementById('candles-tbl-strike-select');
    if (tblStrike) {
      tblStrike.addEventListener('change', (e) => {
        const strike = parseInt(e.target.value);
        window.appState.setContract(strike, window.appState.selectedOptionType || 'PE');
        const mainSelect = document.getElementById('chart-strike-select');
        if (mainSelect) mainSelect.value = strike;
        if (this.chartEngine) this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
        this.renderCandlesBollingerTable();
        this.updateOptionsStripGreeks(strike, window.appState.selectedOptionType);
        const meta = window.appState.getActiveInstrumentMeta();
        if (window.showToast) window.showToast(`📊 Candles Table Switched: ${meta.name}`, 'info');
      });
    }

    ['ce', 'pe', 'spot'].forEach(t => {
      const btn = document.getElementById(`candles-tbl-btn-${t}`);
      if (btn) {
        btn.addEventListener('click', () => {
          const type = t === 'spot' ? 'SPOT' : t.toUpperCase();
          window.appState.setContract(window.appState.selectedStrike || 56300, type);
          const topBtnCE = document.getElementById('btn-type-ce');
          const topBtnPE = document.getElementById('btn-type-pe');
          if (topBtnCE && topBtnPE) {
            topBtnCE.className = `opt-type-btn ${type === 'CE' ? 'active-ce' : ''}`;
            topBtnPE.className = `opt-type-btn ${type === 'PE' ? 'active-pe' : ''}`;
          }
          if (this.chartEngine) this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
          this.renderCandlesBollingerTable();
          this.updateOptionsStripGreeks(window.appState.selectedStrike, type);
          const meta = window.appState.getActiveInstrumentMeta();
          if (window.showToast) window.showToast(`📊 Candles Table Switched: ${meta.name}`, 'info');
        });
      }
    });

    // Strike Select Dropdown
    const strikeSelect = document.getElementById('chart-strike-select');
    if (strikeSelect) {
      strikeSelect.addEventListener('change', (e) => {
        const strike = parseInt(e.target.value);
        window.appState.setContract(strike, window.appState.selectedOptionType);
        this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
        this.renderCandlesBollingerTable();
        this.updateOptionsStripGreeks(strike, window.appState.selectedOptionType);
        const meta = window.appState.getActiveInstrumentMeta();
        if (window.showToast) window.showToast(`🎯 Option Contract: ${meta.name}`, 'info');
      });
    }

    // Quick BankNifty Option Contract Pills
    document.querySelectorAll('.opt-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.opt-pill').forEach(p => p.className = 'opt-pill');
        const strike = parseInt(pill.getAttribute('data-strike'));
        const type = pill.getAttribute('data-type');
        pill.classList.add(type === 'CE' ? 'active-ce' : type === 'PE' ? 'active-pe' : 'active-straddle');

        const select = document.getElementById('chart-strike-select');
        if (select) select.value = strike;

        document.querySelectorAll('.opt-type-btn').forEach(b => {
          b.className = 'opt-type-btn';
          if (b.getAttribute('data-type') === type) {
            b.classList.add(type === 'CE' ? 'active-ce' : type === 'PE' ? 'active-pe' : 'active-straddle');
          }
        });
        document.querySelectorAll('.inst-btn').forEach(b => b.classList.remove('active'));

        window.appState.setContract(strike, type);
        this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
        this.renderCandlesBollingerTable();
        this.updateOptionsStripGreeks(strike, type);

        const meta = window.appState.getActiveInstrumentMeta();
        if (window.showToast) window.showToast(`🎯 Option Contract: ${meta.name}`, 'info');
      });
    });

    // Option Type Toggle (CE / PE / Straddle)
    document.querySelectorAll('.opt-type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = btn.getAttribute('data-type');
        document.querySelectorAll('.opt-type-btn').forEach(b => {
          b.className = 'opt-type-btn';
        });
        btn.classList.add(type === 'CE' ? 'active-ce' : type === 'PE' ? 'active-pe' : 'active-straddle');
        document.querySelectorAll('.inst-btn').forEach(b => b.classList.remove('active'));

        window.appState.setContract(window.appState.selectedStrike, type);
        this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
        this.renderCandlesBollingerTable();
        this.updateOptionsStripGreeks(window.appState.selectedStrike, type);
        const meta = window.appState.getActiveInstrumentMeta();
        if (window.showToast) window.showToast(`🎯 Option Contract: ${meta.name}`, 'info');
      });
    });

    // Spot & Futures Button Clicks
    document.querySelectorAll('.inst-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.inst-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.opt-type-btn').forEach(b => {
          b.className = 'opt-type-btn';
        });
        btn.classList.add('active');
        const inst = btn.getAttribute('data-inst'); // "BANKNIFTY_SPOT" or "FUTURES"
        const optType = inst === 'BANKNIFTY_SPOT' ? 'SPOT' : 'FUTURES';
        window.appState.setContract(window.appState.selectedStrike, optType);
        this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
        this.renderCandlesBollingerTable();
        this.updateOptionsStripGreeks(window.appState.selectedStrike, optType);
        const meta = window.appState.getActiveInstrumentMeta();
        if (window.showToast) window.showToast(`📊 Chart Switch: ${meta.name}`, 'info');
      });
    });

    // Timeframe Switchers (5m, 10m, 15m, 30m)
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tf = btn.getAttribute('data-tf');
        window.appState.currentTimeframe = tf;
        if (this.chartEngine) this.chartEngine.setData(window.appState.getActiveCandles(), tf);
        if (this.splitLayout === '2') {
          this.updateDualChart1();
          this.updateDualChart2();
        } else if (this.splitLayout === '4') {
          this.updateSpotOptCharts();
        } else if (this.splitLayout === '3') {
          this.updateTripleCharts();
        }
        this.renderCandlesBollingerTable();
        if (window.showToast) window.showToast(`⏱️ Timeframe: ${tf}`, 'info');
      });
    });

    // Indicator Toggles
    document.querySelectorAll('.ind-toggle-btn[data-ind]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ind = btn.getAttribute('data-ind');
        if (!ind) return;
        window.appState.indicators[ind] = !window.appState.indicators[ind];
        btn.classList.toggle('active', !!window.appState.indicators[ind]);
        if (this.chartEngine) {
          this.chartEngine.render();
          this.chartEngine.resetLegendToLatest();
        }
        if (this.dualChart1) this.dualChart1.render();
        if (this.dualChart2) this.dualChart2.render();
        if (this.spotOptChartSpot) this.spotOptChartSpot.render();
        if (this.spotOptChartOpt) this.spotOptChartOpt.render();
        if (this.tripleChartSpot) this.tripleChartSpot.render();
        if (this.tripleChartCE) this.tripleChartCE.render();
        if (this.tripleChartPE) this.tripleChartPE.render();
      });
    });

    // Chart Zoom & Pan Controls (Synchronized across all active charts)
    const zoomInBtn = document.getElementById('btn-chart-zoom-in');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        if (this.chartEngine) this.chartEngine.zoomIn();
        if (this.dualChart1) this.dualChart1.zoomIn();
        if (this.dualChart2) this.dualChart2.zoomIn();
        if (this.spotOptChartSpot) this.spotOptChartSpot.zoomIn();
        if (this.spotOptChartOpt) this.spotOptChartOpt.zoomIn();
        if (this.tripleChartSpot) this.tripleChartSpot.zoomIn();
        if (this.tripleChartCE) this.tripleChartCE.zoomIn();
        if (this.tripleChartPE) this.tripleChartPE.zoomIn();
        if (window.showToast) window.showToast('🔍 Zoom In (+)', 'info');
      });
    }

    const zoomOutBtn = document.getElementById('btn-chart-zoom-out');
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        if (this.chartEngine) this.chartEngine.zoomOut();
        if (this.dualChart1) this.dualChart1.zoomOut();
        if (this.dualChart2) this.dualChart2.zoomOut();
        if (this.spotOptChartSpot) this.spotOptChartSpot.zoomOut();
        if (this.spotOptChartOpt) this.spotOptChartOpt.zoomOut();
        if (this.tripleChartSpot) this.tripleChartSpot.zoomOut();
        if (this.tripleChartCE) this.tripleChartCE.zoomOut();
        if (this.tripleChartPE) this.tripleChartPE.zoomOut();
        if (window.showToast) window.showToast('🔍 Zoom Out (-)', 'info');
      });
    }

    const zoomResetBtn = document.getElementById('btn-chart-zoom-reset');
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        if (this.chartEngine) this.chartEngine.resetZoom();
        if (this.dualChart1) this.dualChart1.resetZoom();
        if (this.dualChart2) this.dualChart2.resetZoom();
        if (this.spotOptChartSpot) this.spotOptChartSpot.resetZoom();
        if (this.spotOptChartOpt) this.spotOptChartOpt.resetZoom();
        if (this.tripleChartSpot) this.tripleChartSpot.resetZoom();
        if (this.tripleChartCE) this.tripleChartCE.resetZoom();
        if (this.tripleChartPE) this.tripleChartPE.resetZoom();
        if (window.showToast) window.showToast('🔄 Zoom Reset (100%)', 'info');
      });
    }

    // Timeline Range Presets (1M, 3M, 6M, 1Y, 3Y, 5Y, ALL)
    document.querySelectorAll('.range-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.range-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const range = btn.getAttribute('data-range');
        if (this.chartEngine) {
          this.chartEngine.setRangePreset(range);
        }
        if (window.showToast) window.showToast(`📅 Range: ${btn.textContent} (${range === 'ALL' ? 'Full Multi-Year History' : range + ' bars'})`, 'info');
      });
    });

    // Modal: Track Zerodha / Manual Trade
    const modalTrack = document.getElementById('modal-track-trade');
    const btnOpenTrack = document.getElementById('btn-open-track-trade');
    const btnCloseTrack = document.getElementById('btn-close-track-modal');
    const btnCancelTrack = document.getElementById('btn-cancel-track-trade');
    const formTrackTrade = document.getElementById('form-track-trade');

    if (btnOpenTrack && modalTrack) {
      btnOpenTrack.addEventListener('click', () => {
        modalTrack.style.display = 'flex';
      });
    }
    const closeModal = () => { if (modalTrack) modalTrack.style.display = 'none'; };
    if (btnCloseTrack) btnCloseTrack.addEventListener('click', closeModal);
    if (btnCancelTrack) btnCancelTrack.addEventListener('click', closeModal);

    if (formTrackTrade) {
      formTrackTrade.addEventListener('submit', (e) => {
        e.preventDefault();
        const strike = parseInt(document.getElementById('trade-input-strike').value) || 57500;
        const type = document.getElementById('trade-input-type').value;
        const side = document.getElementById('trade-input-side').value;
        const qty = parseInt(document.getElementById('trade-input-qty').value) || 15;
        const price = parseFloat(document.getElementById('trade-input-price').value) || 344.00;
        const broker = document.getElementById('trade-input-broker').value;
        const sl = parseFloat(document.getElementById('trade-input-sl').value) || 25;
        const target = parseFloat(document.getElementById('trade-input-target').value) || 50;

        const expCode = (window.appState && window.appState.getExpiryCode) ? window.appState.getExpiryCode() : '26AUG';
        const sym = type === 'STRADDLE' ? `BANKNIFTY ${expCode} ${strike} STRADDLE` : `BANKNIFTY ${expCode} ${strike} ${type}`;
        
        const newPos = {
          id: "MANUAL_" + Date.now().toString().slice(-4),
          strategyId: "manual_trade",
          strategyName: `🪁 ${broker}`,
          symbol: sym,
          instrumentType: type,
          strike: strike,
          side: side,
          qty: qty,
          entryPrice: price,
          currentPrice: price,
          stopLoss: side === 'BUY' ? price - sl : price + sl,
          target: side === 'BUY' ? price + target : price - target,
          unrealizedPnL: 0,
          status: "OPEN",
          isManual: true,
          broker: broker
        };

        window.appState.positions.unshift(newPos);
        window.appState.notify('POSITION_ADDED', newPos);
        closeModal();
        if (window.showToast) window.showToast(`🚀 Tracking ${broker} Trade: ${sym} (${qty} Qty @ ₹${price})`, 'success');
      });
    }

    // Bind Manual Prediction Modal Button
    const btnManualReading = document.getElementById('btn-manual-reading');
    if (btnManualReading) {
      btnManualReading.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.strikeAdvisor) window.strikeAdvisor.openManualPredictionModal();
      });
    }

    // Chart View Mode (Options Canvas vs TradingView Live)
    let tvWidgetInitialized = false;
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const viewMode = btn.getAttribute('data-view');

        const canvasChart = document.getElementById('banknifty-chart');
        const legendOverlay = document.getElementById('chart-legend-content');
        const tvWrapper = document.getElementById('tradingview-chart-wrapper');

        if (viewMode === 'tradingview') {
          canvasChart.style.display = 'none';
          legendOverlay.style.display = 'none';
          tvWrapper.style.display = 'block';

          if (!tvWidgetInitialized) {
            tvWidgetInitialized = true;
            this.initTradingViewWidget();
          }
          if (window.showToast) window.showToast('📊 TradingView Live NSE BankNifty Connected', 'success');
        } else {
          canvasChart.style.display = 'block';
          legendOverlay.style.display = 'flex';
          tvWrapper.style.display = 'none';
          this.chartEngine.resize();
        }
      });
    });

    // Market Feed Mode Toggle (Live Real-Time Market Feed / Frozen Close vs Algo Simulator)
    const modeToggleBtn = document.getElementById('btn-market-mode-toggle');
    if (modeToggleBtn) {
      modeToggleBtn.addEventListener('click', () => {
        const curMode = (window.appState.sim && window.appState.sim.feedMode) ? window.appState.sim.feedMode : 'LIVE_FEED';
        const newMode = (curMode === 'LIVE_FEED') ? 'SIMULATOR' : 'LIVE_FEED';
        window.appState.sim.feedMode = newMode;
        
        const mStatus = window.appState.getMarketStatus ? window.appState.getMarketStatus() : { isOpen: false };
        if (newMode === 'LIVE_FEED') {
          modeToggleBtn.className = 'sim-btn live-feed-btn active';
          if (mStatus.isOpen) {
            modeToggleBtn.innerHTML = '<span class="status-pulse-dot" style="background:#10B981;box-shadow:0 0 8px #10B981;display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;"></span> 🟢 Live Market Feed';
            modeToggleBtn.title = 'Active: Real-Time Live NSE Market Feed. Click to switch to Algo Simulator.';
            if (window.showToast) window.showToast('🟢 Live Market Feed Connected (Streaming Authentic NSE Quotes)', 'success');
          } else {
            modeToggleBtn.innerHTML = '⏸️ Frozen Real Close';
            modeToggleBtn.title = 'Active: Static Authentic Market Close. Click to switch to Algo Simulator.';
            if (window.showToast) window.showToast('⏸️ Real Market Close Frozen (Authentic static values)', 'info');
          }
          this.fetchLiveMarketData();
        } else {
          modeToggleBtn.className = 'sim-btn sim-feed-btn active';
          modeToggleBtn.innerHTML = '🧪 Algo Simulator';
          modeToggleBtn.title = 'Active: Algo Simulation (Tick generation & strategy practice). Click to switch to Live Feed / Frozen Close.';
          if (window.showToast) {
            window.showToast('🧪 Algo Simulator Active (Simulating ticks for strategy testing)', 'info');
          }
        }
        this.renderHeaderStats();
      });
    }

    // Speed Controls
    document.querySelectorAll('.sim-speed-selector .sim-btn[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sim-speed-selector .sim-btn[data-speed]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const speed = parseInt(btn.getAttribute('data-speed'));
        window.appState.sim.speed = speed;
        this.restartSimulationTimer();
      });
    });

    // Sound Toggle
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const isEnabled = window.soundEffects.toggle();
        soundBtn.classList.toggle('active', isEnabled);
        window.showToast(isEnabled ? 'Sound Alerts Enabled' : 'Sound Alerts Muted', 'info');
      });
    }

    // Theme Toggle Button (Light / Dark Mode)
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    // Quick Scalp Buttons
    const buyCEBtn = document.getElementById('quick-buy-ce');
    if (buyCEBtn) {
      buyCEBtn.addEventListener('click', () => {
        const atm = Math.round(window.appState.spotPrice / 100) * 100;
        const expCode = (window.appState && window.appState.getExpiryCode) ? window.appState.getExpiryCode() : '26AUG';
        const ltp = window.appState.calculateBlackScholes(window.appState.spotPrice, atm, 'CE');
        window.paperBroker.placeOrder({
          symbol: `BANKNIFTY ${expCode} ${atm} CE`,
          type: 'BUY',
          qty: (window.appState.lotSize || 30) * 2,
          price: ltp,
          tag: 'MANUAL_SCALP'
        });
      });
    }

    const buyPEBtn = document.getElementById('quick-buy-pe');
    if (buyPEBtn) {
      buyPEBtn.addEventListener('click', () => {
        const atm = Math.round(window.appState.spotPrice / 100) * 100;
        const expCode = (window.appState && window.appState.getExpiryCode) ? window.appState.getExpiryCode() : '26AUG';
        const ltp = window.appState.calculateBlackScholes(window.appState.spotPrice, atm, 'PE');
        window.paperBroker.placeOrder({
          symbol: `BANKNIFTY ${expCode} ${atm} PE`,
          type: 'BUY',
          qty: (window.appState.lotSize || 30) * 2,
          price: ltp,
          tag: 'MANUAL_SCALP'
        });
      });
    }

    // Backtest Run Button
    const runBtBtn = document.getElementById('btn-run-backtest');
    if (runBtBtn) {
      runBtBtn.addEventListener('click', () => {
        this.executeBacktestFromUI();
      });
    }

    // Export CSV Button
    const exportCsvBtn = document.getElementById('btn-export-csv');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        window.backtestEngine.exportCSV();
      });
    }
  }

  switchTab(tabId) {
    const tabLabels = {
      'terminal': '📊 Live Terminal ▾',
      'strategies': '⚡ Strategy Hub ▾',
      'builder': '🛠️ Strategy Studio ▾',
      'backtest': '📈 Backtesting & Quant ▾',
      'optionchain': '⛓️ Option Chain & Greeks ▾',
      'broker': '🔌 Broker Bridge ▾'
    };

    // Update active badge in header
    const activeBadge = document.getElementById('active-view-badge');
    if (activeBadge && tabLabels[tabId]) {
      activeBadge.textContent = tabLabels[tabId];
    }

    document.querySelectorAll('.tab-btn, .drawer-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });

    // Trigger sub-renderers if needed
    if (tabId === 'terminal' && this.chartEngine) {
      this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
      setTimeout(() => this.chartEngine.resize(), 50);
    } else if (tabId === 'optionchain') {
      window.optionChainEngine.renderTable('option-chain-body');
    } else if (tabId === 'backtest') {
      setTimeout(() => {
        if (window.backtestEngine.currentResults) {
          window.backtestEngine.renderEquityChart('equity-canvas', window.backtestEngine.currentResults.equityCurve);
        }
      }, 50);
    }
  }

  switchWorkspaceSplitMode(mode) {
    const mainContent = document.querySelector('.main-content');
    const tabTerminal = document.getElementById('tab-terminal');
    const tabOptionChain = document.getElementById('tab-optionchain');

    if (mode === 'standard') {
      if (mainContent) {
        mainContent.classList.remove('ws-split-active');
        mainContent.style.gridTemplateColumns = '';
      }
      this.switchTab('terminal');
      this.switchSplitLayout('1');
    } else if (mode === 'terminal_optionchain') {
      if (mainContent) {
        mainContent.classList.add('ws-split-active');
        mainContent.style.gridTemplateColumns = '1fr 8px 1fr';
      }
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      if (tabTerminal) {
        tabTerminal.classList.add('active');
        tabTerminal.scrollTop = 0;
        const grid = tabTerminal.querySelector('.terminal-grid');
        if (grid) grid.scrollTop = 0;
      }
      if (tabOptionChain) {
        tabOptionChain.classList.add('active');
        tabOptionChain.scrollTop = 0;
      }

      this.switchSplitLayout('1');
      window.optionChainEngine.renderTable('option-chain-body');
      
      const refreshChart = () => {
        if (this.chartEngine) {
          this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
          this.chartEngine.resize();
        }
      };
      refreshChart();
      setTimeout(refreshChart, 60);
      setTimeout(refreshChart, 180);
      setTimeout(refreshChart, 360);

      if (window.showToast) window.showToast('🌓 Workspace Split: Live Terminal (Left) + Option Chain & Greeks (Right)', 'success');
    } else if (mode === 'dual_ce_pe') {
      if (mainContent) {
        mainContent.classList.remove('ws-split-active');
        mainContent.style.gridTemplateColumns = '';
      }
      this.switchTab('terminal');
      this.switchSplitLayout('2');
    } else if (mode === 'spot_opt') {
      if (mainContent) {
        mainContent.classList.remove('ws-split-active');
        mainContent.style.gridTemplateColumns = '';
      }
      this.switchTab('terminal');
      this.switchSplitLayout('4');
    } else if (mode === 'triple_chart') {
      if (mainContent) {
        mainContent.classList.remove('ws-split-active');
        mainContent.style.gridTemplateColumns = '';
      }
      this.switchTab('terminal');
      this.switchSplitLayout('3');
    }
  }

  initSplitScreenResizer() {
    const splitter = document.getElementById('ws-splitter');
    const mainContent = document.querySelector('.main-content');
    if (!splitter || !mainContent) return;

    let isDragging = false;

    splitter.addEventListener('mousedown', (e) => {
      isDragging = true;
      splitter.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const containerRect = mainContent.getBoundingClientRect();
      const offsetLeft = e.clientX - containerRect.left;
      const totalWidth = containerRect.width;
      let leftPct = (offsetLeft / totalWidth) * 100;
      leftPct = Math.max(20, Math.min(80, leftPct)); // clamp 20% to 80%
      const rightPct = 100 - leftPct;

      mainContent.style.gridTemplateColumns = `${leftPct.toFixed(1)}% 8px ${rightPct.toFixed(1)}%`;
      if (this.chartEngine) this.chartEngine.resize();
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        splitter.classList.remove('dragging');
        document.body.style.cursor = '';
        if (this.chartEngine) this.chartEngine.resize();
      }
    });

    // Ratio Quick Buttons
    document.querySelectorAll('.ws-ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ws-ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const ratio = btn.getAttribute('data-ratio');
        let left = 50;
        let right = 50;
        if (ratio === '35_65') { left = 35; right = 65; }
        else if (ratio === '65_35') { left = 65; right = 35; }
        else { left = 50; right = 50; }

        mainContent.style.gridTemplateColumns = `${left}% 8px ${right}%`;
        setTimeout(() => {
          if (this.chartEngine) this.chartEngine.resize();
        }, 60);
      });
    });
  }

  selectAndChartStrike(strike, type, ltp) {
    window.appState.setContract(strike, type);

    // Sync Dropdown
    const select = document.getElementById('chart-strike-select');
    if (select) {
      const opts = select.options ? Array.from(select.options) : [];
      let optExists = opts.some(o => o.value == strike);
      if (!optExists) {
        const newOpt = document.createElement('option');
        newOpt.value = strike;
        newOpt.textContent = strike;
        select.appendChild(newOpt);
      }
      select.value = strike;
    }

    // Sync Type Buttons
    const btnCE = document.getElementById('btn-type-ce');
    const btnPE = document.getElementById('btn-type-pe');
    if (btnCE && btnPE) {
      btnCE.className = `opt-type-btn ${type === 'CE' ? 'active-ce' : ''}`;
      btnPE.className = `opt-type-btn ${type === 'PE' ? 'active-pe' : ''}`;
    }

    // Sync Pills
    document.querySelectorAll('.opt-pill').forEach(p => {
      const pStrike = parseInt(p.getAttribute('data-strike'));
      const pType = p.getAttribute('data-type');
      if (pStrike === strike && pType === type) {
        p.className = `opt-pill ${type === 'CE' ? 'active-ce' : 'active-pe'}`;
      } else {
        p.className = 'opt-pill';
      }
    });

    this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
    this.renderCandlesBollingerTable();
    this.updateOptionsStripGreeks(strike, type);

    const mainContent = document.querySelector('.main-content');
    const isSplit = mainContent && mainContent.classList && typeof mainContent.classList.contains === 'function' && mainContent.classList.contains('ws-split-active');
    if (!isSplit) {
      this.switchTab('terminal');
    }

    if (window.showToast) {
      window.showToast(`🎯 Chart Loaded: BANKNIFTY ${strike} ${type} (LTP: ₹${ltp ? Number(ltp).toFixed(2) : ''})`, 'success');
    }
  }

  startSimulationLoop() {
    this.restartSimulationTimer();
  }

  restartSimulationTimer() {
    if (this.simTimer) clearInterval(this.simTimer);
    const interval = Math.max(80, Math.floor(window.appState.sim.tickIntervalMs / window.appState.sim.speed));

    this.simTimer = setInterval(() => {
      this.onTick();
    }, interval);
  }

  onTick() {
    const appState = window.appState;
    if (!appState.sim.isPlaying) return;

    // If in LIVE_FEED mode, prices and candles are driven purely by authentic NSE real-time quotes
    if (appState.sim && appState.sim.feedMode === 'LIVE_FEED') {
      this.renderHeaderStats();
      this.renderPositionsTable();
      this.renderOrdersTable();
      return;
    }

    // If after-hours mode is FROZEN, keep authentic static market closing prices
    if (appState.sim.afterHoursMode === 'FROZEN') {
      this.renderHeaderStats();
      this.renderPositionsTable();
      this.renderOrdersTable();
      this.renderCandlesBollingerTable();
      return;
    }

    // Simulate subtle BankNifty spot price fluctuation for strategy testing
    const delta = (Math.random() - 0.485) * 6.5;
    appState.spotPrice = Math.round((appState.spotPrice + delta) * 20) / 20;
    appState.futuresPrice = Math.round((appState.spotPrice + 72.8 + (Math.random() * 2 - 1)) * 20) / 20;

    if (appState.spotPrice > appState.dayHigh) appState.dayHigh = appState.spotPrice;
    if (appState.spotPrice < appState.dayLow) appState.dayLow = appState.spotPrice;

    // Update constituents dynamically correlated with BankNifty spot delta
    appState.constituents.forEach(c => {
      const weightFactor = c.weight_num ? (c.weight_num * 2.8) : 0.8;
      const stockDelta = ((delta / (appState.spotPrice || 57400)) * c.price * weightFactor) + (Math.random() - 0.49) * 0.18;
      c.price = Math.round((c.price + stockDelta) * 20) / 20;
      const prev = c.prev_close || (c.price - 1.5);
      c.chg = Math.round((c.price - prev) * 100) / 100;
      const pctNum = prev ? (c.chg / prev) * 100 : 0.0;
      c.pct = `${c.chg >= 0 ? '+' : ''}${pctNum.toFixed(2)}%`;
      const ptsContrib = (pctNum * (c.weight_num || 0.1) * (appState.spotPrice / 100.0)).toFixed(1);
      c.points_contrib = `${ptsContrib >= 0 ? '+' : ''}${ptsContrib} pts`;
    });

    // Update Current 1m Candles across all instruments
    const spotCandles1m = appState.candles["BANKNIFTY_SPOT"]["1m"];
    if (spotCandles1m && spotCandles1m.length > 0) {
      const lastSpot = spotCandles1m[spotCandles1m.length - 1];
      lastSpot.close = appState.spotPrice;
      if (appState.spotPrice > lastSpot.high) lastSpot.high = appState.spotPrice;
      if (appState.spotPrice < lastSpot.low) lastSpot.low = appState.spotPrice;
      lastSpot.volume += Math.floor(Math.random() * 80 + 20);

      const currentAtm = Math.round(appState.spotPrice / 100) * 100;

      // Update ATM CE
      const lastCE = appState.candles["ATM_CE"] && appState.candles["ATM_CE"]["1m"] && appState.candles["ATM_CE"]["1m"][appState.candles["ATM_CE"]["1m"].length - 1];
      if (lastCE) {
        const estCE = appState.calculateBlackScholes(appState.spotPrice, currentAtm, 'CE');
        lastCE.close = Math.round(estCE * 20) / 20;
        if (lastCE.close > lastCE.high) lastCE.high = lastCE.close;
        if (lastCE.close < lastCE.low) lastCE.low = lastCE.close;
        lastCE.volume += Math.floor(Math.random() * 120 + 30);
      }

      // Update ATM PE
      const lastPE = appState.candles["ATM_PE"] && appState.candles["ATM_PE"]["1m"] && appState.candles["ATM_PE"]["1m"][appState.candles["ATM_PE"]["1m"].length - 1];
      if (lastPE) {
        const estPE = appState.calculateBlackScholes(appState.spotPrice, currentAtm, 'PE');
        lastPE.close = Math.round(estPE * 20) / 20;
        if (lastPE.close > lastPE.high) lastPE.high = lastPE.close;
        if (lastPE.close < lastPE.low) lastPE.low = lastPE.close;
        lastPE.volume += Math.floor(Math.random() * 120 + 30);
      }

      // Update Straddle
      const lastStraddle = appState.candles["ATM_STRADDLE"] && appState.candles["ATM_STRADDLE"]["1m"] && appState.candles["ATM_STRADDLE"]["1m"][appState.candles["ATM_STRADDLE"]["1m"].length - 1];
      if (lastStraddle) {
        const estStraddle = appState.calculateBlackScholes(appState.spotPrice, currentAtm, 'STRADDLE');
        lastStraddle.close = Math.round(estStraddle * 20) / 20;
        if (lastStraddle.close > lastStraddle.high) lastStraddle.high = lastStraddle.close;
        if (lastStraddle.close < lastStraddle.low) lastStraddle.low = lastStraddle.close;
      }

      // Update Futures 1m Candle
      const futCandles1m = appState.candles["FUTURES"] && appState.candles["FUTURES"]["1m"];
      if (futCandles1m && futCandles1m.length > 0) {
        const lastFut = futCandles1m[futCandles1m.length - 1];
        lastFut.close = appState.futuresPrice;
        if (appState.futuresPrice > lastFut.high) lastFut.high = appState.futuresPrice;
        if (appState.futuresPrice < lastFut.low) lastFut.low = appState.futuresPrice;
        lastFut.volume += Math.floor(Math.random() * 50 + 10);
      }

      // Update Active Custom Strike Contract on Tick
      if (appState.activeInstrument && appState.activeInstrument.startsWith("CUSTOM_")) {
        const customCandles = appState.candles[appState.activeInstrument] && appState.candles[appState.activeInstrument]["1m"];
        if (customCandles && customCandles.length > 0) {
          const lastCustom = customCandles[customCandles.length - 1];
          const strike = appState.selectedStrike || 57500;
          const type = appState.selectedOptionType || 'CE';
          const estLtp = appState.calculateBlackScholes(appState.spotPrice, strike, type);

          lastCustom.close = Math.round(estLtp * 20) / 20;
          if (lastCustom.close > lastCustom.high) lastCustom.high = lastCustom.close;
          if (lastCustom.close < lastCustom.low) lastCustom.low = lastCustom.close;
          lastCustom.volume += Math.floor(Math.random() * 90 + 20);
        }
      }

      // Rebuild higher timeframes (5m, 10m, 15m, 30m)
      appState.rebuildHigherTimeframes();

      // Feed into Strategy Engine
      const timeStr = new Date().toTimeString().substring(0, 8);
      window.strategyEngine.evaluateTick(lastSpot, appState.spotPrice, timeStr);

      // Feed into Strike Price Advisor for instant Supertrend / VWAP breakout capture
      if (window.strikeAdvisor && typeof window.strikeAdvisor.generateStrikeSuggestions === 'function') {
        window.strikeAdvisor.generateStrikeSuggestions(false);
      }
    }

    // Update Paper Broker floating PnL
    window.paperBroker.updatePositionsMarketPrice(appState.spotPrice);

    // Refresh UI elements
    this.renderHeaderStats();
    this.renderTickerConstituents();
    this.renderPositionsTable();
    this.renderOrdersTable();
    this.renderCandlesBollingerTable();
    if (this.chartEngine && (!this.splitLayout || this.splitLayout === '1')) {
      this.chartEngine.setData(appState.getActiveCandles(), appState.currentTimeframe);
    } else if (this.splitLayout === '2') {
      this.updateDualChart1();
      this.updateDualChart2();
    } else if (this.splitLayout === '4') {
      this.updateSpotOptCharts();
    } else if (this.splitLayout === '3') {
      this.updateTripleCharts();
    }
  }

  handleStateUpdate(event, payload) {
    this.renderPositionsTable();
    this.renderOrdersTable();
    this.renderTradesTable();
    this.renderStrategyCards();
    this.renderHeaderStats();
    if (event === 'EXPIRY_CHANGED' || event === 'CONTRACT_CHANGED') {
      if (window.strikeAdvisor) {
        window.strikeAdvisor.generateStrikeSuggestions(true);
        window.strikeAdvisor.renderSuggestions('strike-suggestions-container');
      }
    }
  }

  renderHeaderStats() {
    const s = window.appState;
    const chg = s.spotPrice - s.prevClose;
    const pct = (chg / s.prevClose) * 100;
    const isBull = chg >= 0;

    const spotEl = document.getElementById('hdr-spot-price');
    const spotChgEl = document.getElementById('hdr-spot-chg');
    const futEl = document.getElementById('hdr-fut-price');
    const vixEl = document.getElementById('hdr-vix-val');
    const pnlEl = document.getElementById('hdr-total-pnl');

    if (spotEl) spotEl.textContent = s.spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (spotChgEl) {
      spotChgEl.className = `stat-change ${isBull ? 'bull' : 'bear'}`;
      spotChgEl.textContent = `${isBull ? '+' : ''}${chg.toFixed(2)} (${isBull ? '+' : ''}${pct.toFixed(2)}%)`;
    }
    if (futEl) futEl.textContent = s.futuresPrice.toFixed(2);
    if (vixEl) vixEl.textContent = s.indiaVix.toFixed(2);

    const totalPnL = s.account.realizedPnL + s.account.unrealizedPnL;
    const pnlClass = totalPnL > 0 ? 'bull' : (totalPnL < 0 ? 'bear' : 'neutral');
    const pnlText = `${totalPnL > 0 ? '+' : ''}₹${totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const hasInvested = (s.positions && s.positions.length > 0) || (s.trades && s.trades.length > 0);
    const pnlStatItem = document.getElementById('hdr-pnl-stat-item');
    if (pnlStatItem) {
      pnlStatItem.style.display = hasInvested ? 'flex' : 'none';
    }

    if (pnlEl) {
      pnlEl.className = `pnl-value ${pnlClass}`;
      pnlEl.textContent = pnlText;
    }

    const footerPnlEl = document.getElementById('footer-total-pnl');
    if (footerPnlEl) {
      footerPnlEl.className = `pnl-value ${pnlClass}`;
      footerPnlEl.textContent = hasInvested ? pnlText : '₹0.00 (No Trades)';
    }

    const marginUsedEl = document.getElementById('hdr-margin-used');
    if (marginUsedEl) {
      marginUsedEl.textContent = `₹${(s.account.usedMargin / 100000).toFixed(2)} L`;
    }

    const marginEl = document.getElementById('footer-margin-avail');
    if (marginEl) {
      marginEl.textContent = `₹${(s.account.availableMargin / 100000).toFixed(2)} L`;
    }

    // Dynamic Market Status Pill (Live Open vs Closed vs Official NSE Holiday)
    const marketPill = document.getElementById('market-status-indicator');
    const marketText = document.getElementById('market-status-text');
    const mStatus = s.getMarketStatus ? s.getMarketStatus() : { isOpen: false, status: 'CLOSED', label: '🌙 NSE CLOSED', badgeClass: 'closed' };
    
    if (marketPill && marketText) {
      marketPill.className = `market-status-pill ${mStatus.badgeClass}`;
      marketText.textContent = mStatus.label;
      const hoverHint = `${mStatus.description || ''} • Click to view full NSE Holiday Calendar`;
      marketPill.setAttribute('title', hoverHint.trim());
    }

    // Update Mode Toggle Button Label according to active mode & market status
    const simBtn = document.getElementById('btn-market-mode-toggle');
    if (simBtn) {
      const feedMode = (s.sim && s.sim.feedMode) ? s.sim.feedMode : 'LIVE_FEED';
      if (feedMode === 'LIVE_FEED') {
        simBtn.className = 'sim-btn live-feed-btn active';
        if (mStatus.isOpen) {
          simBtn.innerHTML = '<span class="status-pulse-dot" style="background:#10B981;box-shadow:0 0 8px #10B981;display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;"></span> 🟢 Live Market Feed';
          simBtn.title = 'Active: Real-Time Live NSE Market Feed. Click to switch to Algo Simulator.';
        } else {
          simBtn.innerHTML = '⏸️ Frozen Real Close';
          simBtn.title = 'Active: Real Market Close Frozen. Click to switch to Algo Simulator.';
        }
      } else {
        simBtn.className = 'sim-btn sim-feed-btn active';
        if (mStatus.status === 'HOLIDAY') {
          simBtn.textContent = '🧪 Replay (Holiday)';
          simBtn.title = `NSE is closed today for ${mStatus.holidayName}. Replaying realistic tick simulation. Click to switch to Live Feed.`;
        } else if (!mStatus.isOpen) {
          simBtn.textContent = '🧪 Replay (After-Hours)';
          simBtn.title = 'Replaying realistic after-hours tick simulation. Click to switch to Live Feed.';
        } else {
          simBtn.textContent = '🧪 Algo Simulator';
          simBtn.title = 'Active: Algo Simulation Mode. Click to switch to Live NSE Market Feed.';
        }
      }
    }
  }

  renderTickerConstituents() {
    const container = document.getElementById('ticker-bar-items');
    if (!container) return;

    if (!this._lastConstituentPrices) this._lastConstituentPrices = {};

    container.innerHTML = window.appState.constituents.map(c => {
      const isBull = !String(c.pct).startsWith('-');
      const lastPrice = this._lastConstituentPrices[c.symbol];
      let flashClass = '';
      if (lastPrice !== undefined) {
        if (c.price > lastPrice) flashClass = 'flash-up';
        else if (c.price < lastPrice) flashClass = 'flash-down';
      }
      this._lastConstituentPrices[c.symbol] = c.price;

      const chgStr = typeof c.chg === 'number' ? (c.chg >= 0 ? `+${c.chg.toFixed(2)}` : c.chg.toFixed(2)) : '';
      const contribStr = c.points_contrib ? `<span class="stock-contrib ${isBull ? 'bull' : 'bear'}" title="Point impact on BankNifty index">(${c.points_contrib})</span>` : '';

      return `
        <div class="ticker-stock ${flashClass}" title="${c.name || c.symbol} | Weight: ${c.weight} | Prev: ₹${c.prev_close || '-'}">
          <span class="stock-name">${c.symbol}</span>
          <span class="stock-weight">${c.weight}</span>
          <span class="stock-price">₹${Number(c.price).toFixed(2)}</span>
          <span class="stock-chg ${isBull ? 'bull' : 'bear'}">${chgStr} (${c.pct})</span>
          ${contribStr}
        </div>
      `;
    }).join('');
  }

  renderPositionsTable() {
    const container = document.getElementById('positions-table-body');
    if (!container) return;

    const positions = window.appState.positions;
    const posTabBtn = document.querySelector('[data-subtab="positions"]');
    if (posTabBtn) posTabBtn.textContent = `Open Positions (${positions.length})`;

    if (positions.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
            ⚡ No Active Open Positions (Click Quick Scalper or Chart &amp; Deploy to take a live trade)
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = positions.map(p => `
      <tr>
        <td><b>${p.symbol}</b></td>
        <td><span class="tag-badge ${p.qty > 0 ? 'tag-buy' : 'tag-sell'}">${p.qty > 0 ? 'BUY' : 'SELL'}</span></td>
        <td>${Math.abs(p.qty)} (${p.lots}L)</td>
        <td>₹${p.entryPrice.toFixed(2)}</td>
        <td><b>₹${p.currentPrice.toFixed(2)}</b></td>
        <td style="color: var(--amber-warning);">₹${p.slPrice ? p.slPrice.toFixed(2) : '-'}</td>
        <td style="color: var(--bull-green);">₹${p.targetPrice ? p.targetPrice.toFixed(2) : '-'}</td>
        <td style="color: ${p.pnl >= 0 ? 'var(--bull-green)' : 'var(--bear-red)'}; font-weight: 700;">
          ${p.pnl >= 0 ? '+' : ''}₹${p.pnl.toFixed(2)} (${p.pnlPct})
        </td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="window.paperBroker.placeOrder({symbol: '${p.symbol}', type: '${p.qty > 0 ? 'SELL' : 'BUY'}', qty: ${Math.abs(p.qty)}, price: ${p.currentPrice}, tag: 'MANUAL_EXIT', strategyId: '${p.strategyId}'})">
            Exit
          </button>
        </td>
      </tr>
    `).join('');
  }

  renderOrdersTable() {
    const container = document.getElementById('orders-table-body');
    if (!container) return;

    const orders = window.appState.orders;
    const ordTabBtn = document.querySelector('[data-subtab="orders"]');
    if (ordTabBtn) ordTabBtn.textContent = `Orders Book (${orders.length})`;

    if (orders.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
            📋 No Orders Placed Yet
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = orders.map(o => `
      <tr>
        <td>${o.time}</td>
        <td>${o.id}</td>
        <td><b>${o.symbol}</b></td>
        <td><span class="tag-badge ${o.type === 'BUY' ? 'tag-buy' : 'tag-sell'}">${o.type}</span></td>
        <td>${o.qty}</td>
        <td>₹${o.price.toFixed(2)} (${o.orderType})</td>
        <td><span class="tag-badge tag-filled">${o.status}</span></td>
      </tr>
    `).join('');
  }

  renderTradesTable() {
    const container = document.getElementById('trades-table-body');
    if (!container) return;

    const trades = window.appState.trades;
    const tradeTabBtn = document.querySelector('[data-subtab="trades"]');
    if (tradeTabBtn) tradeTabBtn.textContent = `Closed Trades (${trades.length})`;

    if (trades.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
            📜 No Closed Trades in Current Session
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = trades.map(t => `
      <tr>
        <td>${t.exitTime}</td>
        <td>${t.id}</td>
        <td><b>${t.symbol}</b></td>
        <td>${t.qty}</td>
        <td>₹${t.entryPrice.toFixed(2)}</td>
        <td>₹${t.exitPrice.toFixed(2)}</td>
        <td style="color: ${t.realizedPnL >= 0 ? 'var(--bull-green)' : 'var(--bear-red)'}; font-weight: 700;">
          ${t.realizedPnL >= 0 ? '+' : ''}₹${t.realizedPnL.toFixed(2)}
        </td>
      </tr>
    `).join('');
  }

  renderDepthTable() {
    const container = document.getElementById('depth-table-body');
    if (!container) return;

    const spot = window.appState.spotPrice;
    let rowsHtml = '';

    for (let i = 0; i < 5; i++) {
      const bidPrice = (spot - 0.05 * (i + 1)).toFixed(2);
      const askPrice = (spot + 0.05 * (i + 1)).toFixed(2);
      const bidQty = Math.floor(Math.random() * 450 + 150);
      const askQty = Math.floor(Math.random() * 450 + 150);
      const bidOrders = Math.floor(Math.random() * 12 + 2);
      const askOrders = Math.floor(Math.random() * 12 + 2);

      rowsHtml += `
        <div class="depth-row">
          <div class="depth-cell depth-orders">${bidOrders}</div>
          <div class="depth-cell depth-bid-qty">${bidQty}</div>
          <div class="depth-cell depth-bid-px">${bidPrice}</div>
          <div class="depth-cell depth-ask-px">${askPrice}</div>
        </div>
      `;
    }
    container.innerHTML = rowsHtml;
  }

  renderStrategyCards() {
    const container = document.getElementById('strategy-cards-grid');
    if (!container) return;

    container.innerHTML = window.appState.strategies.map(s => `
      <div class="strategy-card ${s.armed ? 'armed' : ''}">
        <div class="strategy-card-header">
          <div class="strategy-title-wrap">
            <div class="strategy-icon">⚡</div>
            <div>
              <div class="strategy-name">${s.name}</div>
              <div class="strategy-type-tag">${s.type}</div>
            </div>
          </div>
          <label class="switch">
            <input type="checkbox" ${s.armed ? 'checked' : ''} onchange="window.app.toggleStrategy('${s.id}', this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="strategy-card-body">
          <div class="strategy-desc">${s.description}</div>

          <div class="strategy-params-grid">
            <div class="param-item">
              <span class="param-label">Position Lots:</span>
              <span class="param-value">${s.params.lots || 2} Lots (${(s.params.lots || 2) * 15} Qty)</span>
            </div>
            <div class="param-item">
              <span class="param-label">Stop Loss:</span>
              <span class="param-value">${s.params.slPercent ? s.params.slPercent + '%' : (s.params.stopLossPoints + ' pts')}</span>
            </div>
            <div class="param-item">
              <span class="param-label">Execution:</span>
              <span class="param-value">${s.params.entryTime || s.params.timeframe || 'Real-time Tick'}</span>
            </div>
            <div class="param-item">
              <span class="param-label">Auto Square-Off:</span>
              <span class="param-value">${s.params.exitTime || '15:15 IST'}</span>
            </div>
          </div>

          <div class="strategy-status-row">
            <span>Status: <b style="color: var(--cyan-primary);">${s.status}</b></span>
            <span>Today P&L: <b style="color: ${s.stats.todayPnL >= 0 ? 'var(--bull-green)' : 'var(--bear-red)'};">${s.stats.todayPnL >= 0 ? '+' : ''}₹${s.stats.todayPnL.toFixed(2)}</b></span>
          </div>
        </div>

        <div class="strategy-card-footer">
          <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">Historical Win Rate: <b style="color: var(--bull-green);">${s.stats.winRate}</b></span>
          <button class="btn btn-secondary btn-sm" onclick="window.app.configureStrategy('${s.id}')">Configure</button>
        </div>
      </div>
    `).join('');
  }

  toggleStrategy(strategyId, isArmed) {
    const strat = window.appState.strategies.find(s => s.id === strategyId);
    if (!strat) return;

    strat.armed = isArmed;
    strat.status = isArmed ? 'MONITORING' : 'IDLE';

    if (window.soundEffects) window.soundEffects.playClick();
    if (window.showToast) {
      window.showToast(`${strat.name} ${isArmed ? 'ARMED & MONITORING' : 'DISARMED'}`, isArmed ? 'success' : 'info');
    }

    this.renderStrategyCards();
  }

  configureStrategy(strategyId) {
    const strat = window.appState.strategies.find(s => s.id === strategyId);
    if (!strat) return;
    alert(`Strategy Config: ${strat.name}\nEdit parameters in Strategy Studio tab.`);
  }

  runDefaultBacktest() {
    this.executeBacktestFromUI();
  }

  executeBacktestFromUI() {
    const stratSelect = document.getElementById('bt-strategy-select');
    const regimeSelect = document.getElementById('bt-regime-select');
    const lotsInput = document.getElementById('bt-lots-input');
    const slInput = document.getElementById('bt-sl-input');

    const strategyId = stratSelect ? stratSelect.value : 'straddle_920';
    const scenarioType = regimeSelect ? regimeSelect.value : 'EXPIRY_VOLATILITY';
    const lots = lotsInput ? parseInt(lotsInput.value) : 2;
    const slPercent = slInput ? parseFloat(slInput.value) : 25;

    const results = window.backtestEngine.runBacktest({
      strategyId,
      scenarioType,
      lots,
      slPercent
    });

    // Update KPI cards
    const retEl = document.getElementById('kpi-total-return');
    const winRateEl = document.getElementById('kpi-win-rate');
    const pfEl = document.getElementById('kpi-profit-factor');
    const ddEl = document.getElementById('kpi-max-drawdown');

    if (retEl) {
      retEl.textContent = `${results.totalReturn >= 0 ? '+' : ''}₹${results.totalReturn.toLocaleString()} (${results.returnPct}%)`;
      retEl.className = `kpi-value ${results.totalReturn >= 0 ? 'bull' : 'bear'}`;
    }
    if (winRateEl) winRateEl.textContent = `${results.winRate}%`;
    if (pfEl) pfEl.textContent = results.profitFactor;
    if (ddEl) ddEl.textContent = `₹${results.maxDrawdownAmount.toLocaleString()} (${results.maxDrawdownPercent}%)`;

    // Render Equity Canvas
    window.backtestEngine.renderEquityChart('equity-canvas', results.equityCurve);

    // Render Trade Log Table
    const tradeBody = document.getElementById('bt-trade-log-body');
    if (tradeBody && results.trades) {
      tradeBody.innerHTML = results.trades.map(t => `
        <tr>
          <td>${t.day}</td>
          <td><b>${t.strategy}</b></td>
          <td>${t.entryTime}</td>
          <td>${t.exitTime}</td>
          <td>${t.spotEntry}</td>
          <td>${t.spotExit}</td>
          <td><span class="tag-badge ${t.netPnL >= 0 ? 'tag-buy' : 'tag-sell'}">${t.status}</span></td>
          <td style="color: ${t.netPnL >= 0 ? 'var(--bull-green)' : 'var(--bear-red)'}; font-weight: 700;">
            ${t.netPnL >= 0 ? '+' : ''}₹${t.netPnL.toFixed(2)}
          </td>
        </tr>
      `).join('');
    }

    if (window.showToast) {
      window.showToast(`Backtest completed: Net ${results.totalReturn >= 0 ? '+' : ''}₹${results.totalReturn.toLocaleString()} (${results.winRate}% Win Rate)`, 'success');
    }
  }
  renderCandlesBollingerTable() {
    const container = document.getElementById('candles-bb-table-body');
    if (!container) return;

    const s = window.appState;
    const candles = s.getActiveCandles();
    const instMeta = s.getActiveInstrumentMeta();
    const unit = instMeta.unit || '₹';
    const spot = s.spotPrice || 56466.55;
    const strike = s.selectedStrike || 56300;
    const optType = (s.selectedOptionType || 'PE').toUpperCase();
    const lotSize = s.lotSize || 30;

    // Update Control Bar elements
    const contractBadge = document.getElementById('candles-tbl-contract-badge');
    const ltpBadge = document.getElementById('candles-tbl-ltp-badge');
    const lotBadge = document.getElementById('candles-tbl-lot-badge');
    const structBadge = document.getElementById('candles-tbl-struct-badge');
    const moneyBadge = document.getElementById('candles-tbl-moneyness-badge');
    const tfLabel = document.getElementById('candles-tbl-tf-label');

    const lastCandle = (candles && candles.length > 0) ? candles[candles.length - 1] : null;
    const ltp = lastCandle ? lastCandle.close : (optType === 'SPOT' ? spot : s.calculateBlackScholes(spot, strike, optType));

    if (contractBadge) {
      contractBadge.textContent = `🎯 ${instMeta.name || 'BANKNIFTY ' + strike + ' ' + optType}`;
      contractBadge.style.background = optType === 'CE' ? 'rgba(16, 185, 129, 0.18)' : optType === 'PE' ? 'rgba(244, 63, 94, 0.18)' : 'rgba(0, 240, 255, 0.18)';
      contractBadge.style.borderColor = optType === 'CE' ? 'rgba(16, 185, 129, 0.4)' : optType === 'PE' ? 'rgba(244, 63, 94, 0.4)' : 'rgba(0, 240, 255, 0.4)';
    }

    if (ltpBadge) {
      ltpBadge.textContent = `LTP: ₹${ltp.toFixed(2)} (Premium / Share)`;
    }

    if (lotBadge) {
      const lotVal = ltp * lotSize;
      lotBadge.textContent = `📦 1 Lot (${lotSize} Qty): ₹${lotVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    if (structBadge && window.candleStructureAnalyzer && candles && candles.length > 0) {
      const overallStruct = window.candleStructureAnalyzer.getStructureScore(candles);
      structBadge.innerHTML = `🕯️ <b>${overallStruct.patternName}</b> <span style="opacity: 0.85; font-size: 0.85em;">(${overallStruct.marketStructure})</span>`;
      structBadge.style.color = overallStruct.score > 5 ? 'var(--bull-green)' : (overallStruct.score < -5 ? '#F87171' : '#FDE047');
      structBadge.style.borderColor = overallStruct.score > 5 ? 'rgba(16, 185, 129, 0.4)' : (overallStruct.score < -5 ? 'rgba(248, 113, 113, 0.4)' : 'rgba(253, 224, 71, 0.4)');
    }

    if (moneyBadge) {
      if (optType === 'SPOT' || optType === 'FUTURES') {
        moneyBadge.textContent = `• Spot: ${spot.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      } else {
        const diff = Math.abs(strike - spot);
        const isITM = optType === 'PE' ? (strike > spot) : (strike < spot);
        const isATM = diff < 50;
        const statusStr = isATM ? 'ATM' : isITM ? `${diff.toFixed(0)} pts ITM` : `${diff.toFixed(0)} pts OTM`;
        moneyBadge.textContent = `• Spot: ${spot.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${statusStr})`;
      }
    }

    if (tfLabel) {
      tfLabel.textContent = `Timeframe: ${s.currentTimeframe || '5m'}`;
    }

    // Sync Candles Table Strike Select
    const tblStrikeSelect = document.getElementById('candles-tbl-strike-select');
    if (tblStrikeSelect && tblStrikeSelect.options) {
      const atm = Math.round(spot / 100) * 100;
      const minS = atm - 1500;
      const maxS = atm + 1500;
      if (tblStrikeSelect.options.length <= 1 || tblStrikeSelect.getAttribute('data-atm') !== String(atm)) {
        tblStrikeSelect.setAttribute('data-atm', String(atm));
        let html = '';
        for (let st = minS; st <= maxS; st += 100) {
          const isSelected = st === strike;
          const isAtm = st === atm;
          html += `<option value="${st}" ${isSelected ? 'selected' : ''}>${st}${isAtm ? ' (ATM)' : ''}</option>`;
        }
        tblStrikeSelect.innerHTML = html;
      } else {
        tblStrikeSelect.value = strike;
      }
    }

    // Sync Candles Table Option Type Buttons
    ['ce', 'pe', 'spot'].forEach(t => {
      const btn = document.getElementById(`candles-tbl-btn-${t}`);
      if (btn) {
        btn.classList.remove('active-ce', 'active-pe', 'active');
        if (t.toUpperCase() === optType) {
          btn.classList.add(t === 'ce' ? 'active-ce' : t === 'pe' ? 'active-pe' : 'active');
        }
      }
    });

    if (!candles || candles.length === 0) {
      container.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 20px; color: var(--text-muted);">No Candles Loaded</td></tr>`;
      return;
    }

    const bbValues = this.chartEngine ? this.chartEngine.calculateBollingerBands(candles, 20, 2.0) : [];
    const stValues = this.chartEngine ? this.chartEngine.calculateSupertrend(candles, 10, 1.0) : [];

    // Show latest 35 candles in reverse chronological order
    const displayCandles = candles.slice(-35).reverse();

    let rowsHtml = '';
    displayCandles.forEach((c, revIdx) => {
      const origIdx = candles.length - 1 - revIdx;
      const bb = bbValues[origIdx] || { upper: c.close + 10, middle: c.close, lower: c.close - 10, bandwidth: 4.2 };
      const st = stValues[origIdx] || { value: c.close, trend: 1 };

      const isBull = c.close >= c.open;
      const isStBull = st.trend === 1;
      const lotVal = (c.close * lotSize).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Detect Candle Structure Pattern
      const cStruct = window.candleStructureAnalyzer ? window.candleStructureAnalyzer.analyzeCandle(c) : null;
      const patternName = cStruct ? cStruct.patternLabel : (isBull ? 'Bullish Bar' : 'Bearish Bar');
      const structColor = (cStruct && cStruct.signal === 'BULLISH') ? 'var(--bull-green)' : ((cStruct && cStruct.signal === 'BEARISH') ? 'var(--bear-red)' : 'var(--cyan-primary)');
      const structBg = (cStruct && cStruct.signal === 'BULLISH') ? 'rgba(16, 185, 129, 0.12)' : ((cStruct && cStruct.signal === 'BEARISH') ? 'rgba(244, 63, 94, 0.12)' : 'rgba(0, 240, 255, 0.08)');

      rowsHtml += `
        <tr>
          <td><b style="color: var(--text-primary);">${c.time}</b></td>
          <td>${unit}${c.open.toFixed(2)}</td>
          <td style="color: var(--bull-green);">${unit}${c.high.toFixed(2)}</td>
          <td style="color: var(--bear-red);">${unit}${c.low.toFixed(2)}</td>
          <td style="color: ${isBull ? 'var(--bull-green)' : 'var(--bear-red)'}; font-weight: 700;">
            ${unit}${c.close.toFixed(2)}
          </td>
          <td style="color: var(--cyan-primary); font-family: var(--font-mono); font-weight: 600;">
            ₹${lotVal}
          </td>
          <td>
            <span style="display: inline-block; font-size: 10px; font-family: var(--font-mono); padding: 1px 6px; border-radius: 3px; background: ${structBg}; color: ${structColor}; border: 1px solid ${structColor}40;">
              ${patternName}
            </span>
          </td>
          <td>${c.volume.toLocaleString()}</td>
          <td class="bb-val-upper">${unit}${bb.upper.toFixed(2)}</td>
          <td class="bb-val-middle">${unit}${bb.middle.toFixed(2)}</td>
          <td class="bb-val-lower">${unit}${bb.lower.toFixed(2)}</td>
          <td style="color: var(--cyan-primary);">${bb.bandwidth ? bb.bandwidth.toFixed(2) : ((bb.upper - bb.lower) / bb.middle * 100).toFixed(2)}%</td>
          <td>
            <span class="tag-badge ${isStBull ? 'tag-buy' : 'tag-sell'}" style="font-size: 9px;">
              ${isStBull ? '▲' : '▼'} ${unit}${st.value.toFixed(1)}
            </span>
          </td>
          <td style="color: var(--cyan-primary); font-weight: 600;">${c.vwap ? unit + c.vwap.toFixed(2) : '-'}</td>
        </tr>
      `;
    });

    container.innerHTML = rowsHtml;
  }

  initTradingViewWidget(symbol = "NSE:NIFTYBANK") {
    try {
      const container = document.getElementById('tradingview_banknifty');
      if (!container) return;

      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; background: #070B14; border-bottom: 1px solid var(--border-subtle); height: 32px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.72rem; font-family: var(--font-mono); color: var(--cyan-primary); font-weight: 700;">TRADINGVIEW NSE LIVE:</span>
            <button class="tv-sym-btn active" data-sym="NSE:NIFTYBANK" style="background: rgba(0, 240, 255, 0.2); border: 1px solid var(--cyan-primary); color: #FFF; font-size: 0.68rem; font-family: var(--font-mono); padding: 2px 6px; border-radius: 4px; cursor: pointer;">NSE:NIFTYBANK (Spot)</button>
            <button class="tv-sym-btn" data-sym="NSE:BANKNIFTY1!" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: 0.68rem; font-family: var(--font-mono); padding: 2px 6px; border-radius: 4px; cursor: pointer;">NSE:BANKNIFTY (Futures)</button>
            <button class="tv-sym-btn" data-sym="NSE:NIFTY" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: 0.68rem; font-family: var(--font-mono); padding: 2px 6px; border-radius: 4px; cursor: pointer;">NSE:NIFTY 50</button>
          </div>
          <span style="font-size: 0.68rem; font-family: var(--font-mono); color: var(--bull-green);">● OFFICIAL TV FEED ACTIVE</span>
        </div>
        <div style="width: 100%; height: calc(100% - 32px);">
          <iframe id="tv-live-iframe" src="https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}&interval=5&theme=dark&style=1&timezone=Asia%2FKolkata&locale=en" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
      `;

      container.querySelectorAll('.tv-sym-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.tv-sym-btn').forEach(b => {
            b.style.background = 'var(--bg-surface)';
            b.style.borderColor = 'var(--border-subtle)';
            b.style.color = 'var(--text-secondary)';
          });
          btn.style.background = 'rgba(0, 240, 255, 0.2)';
          btn.style.borderColor = 'var(--cyan-primary)';
          btn.style.color = '#FFF';
          const sym = btn.getAttribute('data-sym');
          const iframe = document.getElementById('tv-live-iframe');
          if (iframe) {
            iframe.src = `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(sym)}&interval=5&theme=dark&style=1&timezone=Asia%2FKolkata&locale=en`;
          }
        });
      });
    } catch (err) {
      console.warn("TradingView initialization error:", err);
    }
  }

  populateExpiryDropdowns() {
    const s = window.appState;
    if (!s) return;
    const expiries = s.availableExpiries || s.generateRollingExpiries();
    const currentKey = s.selectedExpiry ? s.selectedExpiry.key : (expiries[0] ? expiries[0].key : '');

    const chartSelect = document.getElementById('chart-expiry-select');
    const optSelect = document.getElementById('optchain-expiry-select');

    [chartSelect, optSelect].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '';
      expiries.forEach(exp => {
        const opt = document.createElement('option');
        opt.value = exp.key;
        opt.textContent = exp.label;
        if (exp.key === currentKey) opt.selected = true;
        sel.appendChild(opt);
      });
      if (currentKey) sel.value = currentKey;
    });
  }

  rebuildDynamicStrikeSelectorAndPills() {
    const spot = window.appState.spotPrice || 56466.55;
    const atm = Math.round(spot / 100) * 100;
    const currentSelectedStrike = window.appState.selectedStrike || 56300;
    const currentSelectedType = window.appState.selectedOptionType || 'PE';

    // 1. Rebuild Strike Dropdown
    const select = document.getElementById('chart-strike-select');
    if (select) {
      const minStrike = atm - 2000;
      const maxStrike = atm + 2000;
      let optionsHtml = '';
      for (let s = minStrike; s <= maxStrike; s += 100) {
        const isATM = s === atm;
        const isSelected = s === currentSelectedStrike;
        const isITM = currentSelectedType === 'PE' ? (s > spot) : (s < spot);
        const tag = isATM ? '(ATM)' : (isITM ? '(ITM)' : '(OTM)');
        optionsHtml += `<option value="${s}" ${isSelected ? 'selected' : ''}>${s} ${tag}</option>`;
      }
      select.innerHTML = optionsHtml;
    }

    // 2. Rebuild Quick Option Pills
    const pillsContainer = document.querySelector('.quick-options-pills');
    if (pillsContainer) {
      const pillsData = [
        { label: `⚡ ATM ${atm} CE`, strike: atm, type: 'CE' },
        { label: `⚡ ATM ${atm} PE`, strike: atm, type: 'PE' },
        { label: `📉 ${atm} Straddle`, strike: atm, type: 'STRADDLE' },
        { label: `🎯 ${atm - 300} CE (ITM)`, strike: atm - 300, type: 'CE' },
        { label: `🎯 ${atm + 300} PE (ITM)`, strike: atm + 300, type: 'PE' },
        { label: `🚀 ${atm + 500} CE (OTM)`, strike: atm + 500, type: 'CE' },
        { label: `🚀 ${atm - 500} PE (OTM)`, strike: atm - 500, type: 'PE' },
        { label: `⚡ ${atm + 100} CE`, strike: atm + 100, type: 'CE' },
        { label: `⚡ ${atm - 100} PE`, strike: atm - 100, type: 'PE' },
        { label: `⚡ ${atm + 200} CE`, strike: atm + 200, type: 'CE' },
        { label: `⚡ ${atm - 200} PE`, strike: atm - 200, type: 'PE' }
      ];

      let pillsHtml = '';
      pillsData.forEach(p => {
        const isActive = p.strike === currentSelectedStrike && p.type === currentSelectedType;
        let activeClass = '';
        if (isActive) {
          activeClass = p.type === 'CE' ? 'active-ce' : p.type === 'PE' ? 'active-pe' : 'active-straddle';
        }
        pillsHtml += `<button class="opt-pill ${activeClass}" data-strike="${p.strike}" data-type="${p.type}">${p.label}</button>`;
      });
      pillsContainer.innerHTML = pillsHtml;

      // Re-bind click events on dynamic pills
      pillsContainer.querySelectorAll('.opt-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          pillsContainer.querySelectorAll('.opt-pill').forEach(p => p.className = 'opt-pill');
          const strike = parseInt(pill.getAttribute('data-strike'));
          const type = pill.getAttribute('data-type');
          pill.classList.add(type === 'CE' ? 'active-ce' : type === 'PE' ? 'active-pe' : 'active-straddle');

          if (select) select.value = strike;

          document.querySelectorAll('.inst-btn').forEach(b => b.classList.remove('active'));

          window.appState.setContract(strike, type);
          this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
          this.renderCandlesBollingerTable();
          this.updateOptionsStripGreeks(strike, type);

          const meta = window.appState.getActiveInstrumentMeta();
          if (window.showToast) window.showToast(`🎯 Option Contract: ${meta.name}`, 'info');
        });
      });

      // Sync active state of Spot / Fut buttons
      document.querySelectorAll('.inst-btn').forEach(b => {
        const inst = b.getAttribute('data-inst');
        const shouldBeActive = (inst === 'BANKNIFTY_SPOT' && currentSelectedType === 'SPOT') ||
                               (inst === 'FUTURES' && currentSelectedType === 'FUTURES');
        b.classList.toggle('active', shouldBeActive);
      });
    }

    this.updateOptionsStripGreeks(currentSelectedStrike, currentSelectedType);
  }

  updateOptionsStripGreeks(strike, type) {
    const titleEl = document.getElementById('active-opt-title');
    const greeksEl = document.getElementById('active-opt-greeks');
    if (!titleEl || !greeksEl) return;

    const spot = window.appState.spotPrice || 57800;
    const iv = window.appState.indiaVix || 13.5;

    if (type === 'SPOT') {
      titleEl.innerHTML = `BANKNIFTY SPOT <span style="color: var(--cyan-primary); margin-left: 6px; font-size: 0.82rem; font-weight: 800; font-family: var(--font-mono);">LTP: ${spot.toLocaleString('en-IN', { minimumFractionDigits: 2 })} pts</span>`;
      greeksEl.innerHTML = 
        '<span>Day High: <b style="color: var(--bull-green);">' + (window.appState.dayHigh || spot + 100).toFixed(2) + '</b></span>' +
        '<span>Day Low: <b style="color: var(--bear-red);">' + (window.appState.dayLow || spot - 100).toFixed(2) + '</b></span>' +
        '<span>Prev Close: <b>' + (window.appState.prevClose || spot).toFixed(2) + '</b></span>' +
        '<span>India VIX: <b>' + (typeof iv === 'number' ? iv.toFixed(1) : iv) + '%</b></span>';
      return;
    }

    const expCode = (window.appState && window.appState.getExpiryCode) ? window.appState.getExpiryCode() : '26AUG';
    if (type === 'FUTURES') {
      const fut = window.appState.futuresPrice || (spot + 85.5);
      titleEl.innerHTML = `BANKNIFTY ${expCode} FUTURES <span style="color: var(--cyan-primary); margin-left: 6px; font-size: 0.82rem; font-weight: 800; font-family: var(--font-mono);">LTP: ${fut.toLocaleString('en-IN', { minimumFractionDigits: 2 })} pts</span>`;
      greeksEl.innerHTML = 
        '<span>Basis: <b style="color: var(--cyan-primary);">+' + (fut - spot).toFixed(2) + '</b></span>' +
        '<span>Day High: <b style="color: var(--bull-green);">' + ((window.appState.dayHigh || spot) + 85).toFixed(2) + '</b></span>' +
        '<span>Day Low: <b style="color: var(--bear-red);">' + ((window.appState.dayLow || spot) + 85).toFixed(2) + '</b></span>' +
        '<span>Lot Size: <b>30</b></span>';
      return;
    }

    const sym = type === 'STRADDLE' ? `BANKNIFTY ${expCode} ${strike} STRADDLE` : `BANKNIFTY ${expCode} ${strike} ${type}`;
    const ltp = window.appState.calculateBlackScholes(spot, strike, type);

    titleEl.innerHTML = `${sym} <span style="color: var(--cyan-primary); margin-left: 6px; font-size: 0.82rem; font-weight: 800; font-family: var(--font-mono);">LTP: ₹${ltp.toFixed(2)}</span>`;

    const diff = spot - strike;
    let delta = "+0.52";
    let gamma = "0.0018";
    let theta = "-18.4/d";
    let ivStr = (typeof iv === 'number' ? iv.toFixed(1) : iv) + "%";

    if (type === 'CE') {
      const d = 0.50 + Math.min(0.45, Math.max(-0.45, diff / 800));
      delta = (d >= 0 ? '+' : '') + d.toFixed(2);
      gamma = Math.max(0.0004, 0.0022 * Math.exp(-Math.pow(diff, 2) / 600000)).toFixed(4);
      theta = `-${(15 + Math.abs(diff) * 0.01).toFixed(1)}/d`;
    } else if (type === 'PE') {
      const d = -0.50 + Math.min(0.45, Math.max(-0.45, diff / 800));
      delta = d.toFixed(2);
      gamma = Math.max(0.0004, 0.0022 * Math.exp(-Math.pow(diff, 2) / 600000)).toFixed(4);
      theta = `-${(15 + Math.abs(diff) * 0.01).toFixed(1)}/d`;
    } else {
      delta = (diff * 0.0008).toFixed(2) + " (Δ Neutral)";
      gamma = "0.0036";
      theta = "-36.4/d";
    }

    const deltaColor = type === 'PE' ? '#F43F5E' : '#10B981';
    greeksEl.innerHTML = 
      '<span>Delta: <b style="color: ' + deltaColor + ';">' + delta + '</b></span>' +
      '<span>Gamma: <b style="color: #00F0FF;">' + gamma + '</b></span>' +
      '<span>Theta: <b style="color: #F43F5E;">' + theta + '</b></span>' +
      '<span>IV: <b>' + ivStr + '</b></span>';
  }

  fetchLiveMarketData() {
    const urlsToTry = ['/api/market/live', 'http://localhost:8080/api/market/live', 'http://127.0.0.1:8080/api/market/live'];
    const tryFetch = (index = 0) => {
      if (index >= urlsToTry.length) return Promise.reject(new Error("All endpoints failed"));
      return fetch(urlsToTry[index])
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .catch(err => {
          if (index + 1 < urlsToTry.length) return tryFetch(index + 1);
          throw err;
        });
    };

    tryFetch()
      .then(data => {
        if (data && data.spot) {
          const oldAtm = Math.round(window.appState.spotPrice / 100) * 100;
          window.appState.syncLiveMarketFeed(data);
          const newAtm = Math.round(window.appState.spotPrice / 100) * 100;

          if (oldAtm !== newAtm || !this._dynamicStrikesInitialized) {
            this._dynamicStrikesInitialized = true;
            this.rebuildDynamicStrikeSelectorAndPills();
            this.rebuildSplitDropdowns();
          }

          this.renderHeaderStats();
          this.renderTickerConstituents();
          this.renderCandlesBollingerTable();
          this.updateOptionsStripGreeks(window.appState.selectedStrike, window.appState.selectedOptionType || 'CE');
          if (this.chartEngine && (!this.splitLayout || this.splitLayout === '1')) {
            this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
          }
          if (window.strikeAdvisor) window.strikeAdvisor.renderSuggestions('strike-suggestions-container');
          window.optionChainEngine.renderTable('option-chain-body');
        }
      })
      .catch(err => {
        // Quiet fallback when hosted statically (e.g. GitHub Pages) without Python backend
        if (!this._staticModeLogged) {
          this._staticModeLogged = true;
          console.log("ℹ️ Running in Client-Side Quant Mode (GitHub Pages / Standalone PWA). Market simulation active.");
          const statusText = document.getElementById('market-status-text');
          if (statusText) statusText.textContent = '🟢 NSE QUANT SIMULATOR (Real-Time)';
        }
      });
  }

  initSplitScreenCharts() {
    try {
      this.splitLayout = '1';
      this.dualChart1 = new window.ChartEngine('canvas-dual-1', 'dual-legend-1');
      this.dualChart2 = new window.ChartEngine('canvas-dual-2', 'dual-legend-2');
      this.spotOptChartSpot = new window.ChartEngine('canvas-spotopt-spot', 'spotopt-legend-spot');
      this.spotOptChartOpt = new window.ChartEngine('canvas-spotopt-opt', 'spotopt-legend-opt');
      this.tripleChartSpot = new window.ChartEngine('canvas-triple-spot', 'triple-legend-spot');
      this.tripleChartCE = new window.ChartEngine('canvas-triple-ce', 'triple-legend-ce');
      this.tripleChartPE = new window.ChartEngine('canvas-triple-pe', 'triple-legend-pe');

      const spot = window.appState.spotPrice || 57800;
      const atm = Math.round(spot / 100) * 100;

      this.dualStrike1 = atm;
      this.dualType1 = 'CE';
      this.dualStrike2 = atm;
      this.dualType2 = 'PE';

      this.spotOptStrike = atm;
      this.spotOptType = 'CE';

      this.tripleStrikeCE = atm;
      this.tripleStrikePE = atm;

      this.rebuildSplitDropdowns();
      this.bindSplitEvents();
    } catch (e) {
      console.warn("Split screen init warning:", e);
    }
  }

  rebuildSplitDropdowns() {
    const spot = window.appState.spotPrice || 57800;
    const atm = Math.round(spot / 100) * 100;
    const minStrike = atm - 2000;
    const maxStrike = atm + 2000;

    let optsHtml = '';
    for (let s = minStrike; s <= maxStrike; s += 100) {
      const isAtm = s === atm;
      optsHtml += `<option value="${s}" ${isAtm ? 'selected' : ''}>${s} ${isAtm ? '(ATM)' : ''}</option>`;
    }

    ['dual-select-1', 'dual-select-2', 'spotopt-select-strike', 'triple-select-ce', 'triple-select-pe'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const prevVal = parseInt(el.value);
        el.innerHTML = optsHtml;
        if (prevVal && prevVal >= minStrike && prevVal <= maxStrike) {
          el.value = prevVal;
        } else {
          el.value = atm;
        }
      }
    });
  }

  bindSplitEvents() {
    // Split Mode Toggle Buttons
    document.querySelectorAll('.split-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.split-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const split = btn.getAttribute('data-split');
        this.switchSplitLayout(split);
      });
    });

    // Dual Chart 1 Controls
    const dSel1 = document.getElementById('dual-select-1');
    const dType1 = document.getElementById('dual-type-1');
    if (dSel1) {
      dSel1.addEventListener('change', () => {
        this.dualStrike1 = parseInt(dSel1.value);
        this.updateDualChart1();
      });
    }
    if (dType1) {
      dType1.addEventListener('click', () => {
        this.dualType1 = this.dualType1 === 'CE' ? 'PE' : 'CE';
        dType1.className = `opt-type-btn ${this.dualType1 === 'CE' ? 'active-ce' : 'active-pe'}`;
        dType1.textContent = this.dualType1;
        this.updateDualChart1();
      });
    }

    // Dual Chart 2 Controls
    const dSel2 = document.getElementById('dual-select-2');
    const dType2 = document.getElementById('dual-type-2');
    if (dSel2) {
      dSel2.addEventListener('change', () => {
        this.dualStrike2 = parseInt(dSel2.value);
        this.updateDualChart2();
      });
    }
    if (dType2) {
      dType2.addEventListener('click', () => {
        this.dualType2 = this.dualType2 === 'CE' ? 'PE' : 'CE';
        dType2.className = `opt-type-btn ${this.dualType2 === 'CE' ? 'active-pe' : 'active-ce'}`;
        dType2.textContent = this.dualType2;
        this.updateDualChart2();
      });
    }

    // Spot + Option Controls
    const soSel = document.getElementById('spotopt-select-strike');
    const soType = document.getElementById('spotopt-type-btn');
    const soBadge = document.getElementById('spotopt-badge-type');
    if (soSel) {
      soSel.addEventListener('change', () => {
        this.spotOptStrike = parseInt(soSel.value);
        this.updateSpotOptCharts();
      });
    }
    if (soType) {
      soType.addEventListener('click', () => {
        this.spotOptType = this.spotOptType === 'CE' ? 'PE' : 'CE';
        soType.className = `opt-type-btn ${this.spotOptType === 'CE' ? 'active-ce' : 'active-pe'}`;
        soType.textContent = this.spotOptType;
        if (soBadge) {
          soBadge.className = `tag-badge ${this.spotOptType === 'CE' ? 'tag-buy' : 'tag-sell'}`;
          soBadge.textContent = this.spotOptType === 'CE' ? 'CALL (CE)' : 'PUT (PE)';
        }
        this.updateSpotOptCharts();
      });
    }

    // Triple Chart CE / PE dropdowns
    const tSelCE = document.getElementById('triple-select-ce');
    if (tSelCE) {
      tSelCE.addEventListener('change', () => {
        this.tripleStrikeCE = parseInt(tSelCE.value);
        this.updateTripleCharts();
      });
    }
    const tSelPE = document.getElementById('triple-select-pe');
    if (tSelPE) {
      tSelPE.addEventListener('change', () => {
        this.tripleStrikePE = parseInt(tSelPE.value);
        this.updateTripleCharts();
      });
    }
  }

  switchSplitLayout(split) {
    this.splitLayout = split;
    const vSingle = document.getElementById('view-single-chart');
    const vDual = document.getElementById('view-dual-chart');
    const vSpotOpt = document.getElementById('view-spot-opt-chart');
    const vTriple = document.getElementById('view-triple-chart');

    if (vSingle) vSingle.style.display = split === '1' ? 'flex' : 'none';
    if (vDual) vDual.style.display = split === '2' ? 'grid' : 'none';
    if (vSpotOpt) vSpotOpt.style.display = split === '4' ? 'grid' : 'none';
    if (vTriple) vTriple.style.display = split === '3' ? 'grid' : 'none';

    // Update Layout Toolbar buttons active state
    document.querySelectorAll('.split-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-split') === split);
    });

    setTimeout(() => {
      if (split === '1' && this.chartEngine) {
        this.chartEngine.setData(window.appState.getActiveCandles(), window.appState.currentTimeframe);
        this.chartEngine.resize();
      }
      if (split === '2') {
        this.updateDualChart1();
        this.updateDualChart2();
        if (this.dualChart1) this.dualChart1.resize();
        if (this.dualChart2) this.dualChart2.resize();
      }
      if (split === '4') {
        this.updateSpotOptCharts();
        if (this.spotOptChartSpot) this.spotOptChartSpot.resize();
        if (this.spotOptChartOpt) this.spotOptChartOpt.resize();
      }
      if (split === '3') {
        this.updateTripleCharts();
        if (this.tripleChartSpot) this.tripleChartSpot.resize();
        if (this.tripleChartCE) this.tripleChartCE.resize();
        if (this.tripleChartPE) this.tripleChartPE.resize();
      }
    }, 60);

    const layoutName = split === '1' ? 'Single Full Chart' : split === '2' ? 'Dual Split (CE vs PE)' : split === '4' ? 'Spot + CE/PE Option' : 'Triple Split (Spot + CE + PE)';
    if (window.showToast) window.showToast(`📊 Layout Switched: ${layoutName}`, 'info');
  }

  updateDualChart1() {
    const s = window.appState;
    const strike = this.dualStrike1 || 57500;
    const type = this.dualType1 || 'CE';
    const candles = this.getSynthesizedCandlesForStrike(strike, type);
    if (this.dualChart1) this.dualChart1.setData(candles, s.currentTimeframe);

    const ltp = s.calculateBlackScholes(s.spotPrice, strike, type);
    const ltpEl = document.getElementById('dual-ltp-1');
    if (ltpEl) ltpEl.textContent = `₹${ltp.toFixed(2)}`;
  }

  updateDualChart2() {
    const s = window.appState;
    const strike = this.dualStrike2 || 57500;
    const type = this.dualType2 || 'PE';
    const candles = this.getSynthesizedCandlesForStrike(strike, type);
    if (this.dualChart2) this.dualChart2.setData(candles, s.currentTimeframe);

    const ltp = s.calculateBlackScholes(s.spotPrice, strike, type);
    const ltpEl = document.getElementById('dual-ltp-2');
    if (ltpEl) ltpEl.textContent = `₹${ltp.toFixed(2)}`;
  }

  updateSpotOptCharts() {
    const s = window.appState;
    // 1. Spot Chart
    const spotCandles = s.candles["BANKNIFTY_SPOT"][s.currentTimeframe] || s.candles["BANKNIFTY_SPOT"]["5m"];
    if (this.spotOptChartSpot) this.spotOptChartSpot.setData(spotCandles, s.currentTimeframe);
    const spotLtpEl = document.getElementById('spotopt-spot-ltp');
    if (spotLtpEl) spotLtpEl.textContent = s.spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    // 2. Option Chart
    const strike = this.spotOptStrike || 57500;
    const type = this.spotOptType || 'CE';
    const optCandles = this.getSynthesizedCandlesForStrike(strike, type);
    if (this.spotOptChartOpt) this.spotOptChartOpt.setData(optCandles, s.currentTimeframe);
    const optLtp = s.calculateBlackScholes(s.spotPrice, strike, type);
    const optLtpEl = document.getElementById('spotopt-opt-ltp');
    if (optLtpEl) optLtpEl.textContent = `₹${optLtp.toFixed(2)}`;
  }

  updateTripleCharts() {
    const s = window.appState;
    // 1. Spot Chart
    const spotCandles = s.candles["BANKNIFTY_SPOT"][s.currentTimeframe] || s.candles["BANKNIFTY_SPOT"]["5m"];
    if (this.tripleChartSpot) this.tripleChartSpot.setData(spotCandles, s.currentTimeframe);
    const spotLtpEl = document.getElementById('triple-spot-ltp');
    if (spotLtpEl) spotLtpEl.textContent = s.spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    // 2. CE Chart
    const strikeCE = this.tripleStrikeCE || 57500;
    const ceCandles = this.getSynthesizedCandlesForStrike(strikeCE, 'CE');
    if (this.tripleChartCE) this.tripleChartCE.setData(ceCandles, s.currentTimeframe);
    const ceLtp = s.calculateBlackScholes(s.spotPrice, strikeCE, 'CE');
    const ceLtpEl = document.getElementById('triple-ce-ltp');
    if (ceLtpEl) ceLtpEl.textContent = `₹${ceLtp.toFixed(2)}`;

    // 3. PE Chart
    const strikePE = this.tripleStrikePE || 57500;
    const peCandles = this.getSynthesizedCandlesForStrike(strikePE, 'PE');
    if (this.tripleChartPE) this.tripleChartPE.setData(peCandles, s.currentTimeframe);
    const peLtp = s.calculateBlackScholes(s.spotPrice, strikePE, 'PE');
    const peLtpEl = document.getElementById('triple-pe-ltp');
    if (peLtpEl) peLtpEl.textContent = `₹${peLtp.toFixed(2)}`;
  }

  getSynthesizedCandlesForStrike(strike, type) {
    const s = window.appState;
    const spotCandles = s.candles["BANKNIFTY_SPOT"]["1m"] || [];
    const iv = s.indiaVix || 13.5;
    const base1m = [];
    let cumVol = 0;
    let cumPv = 0;

    spotCandles.forEach(sc => {
      const premClose = s.calculateBlackScholes(sc.close, strike, type);
      const premOpen = s.calculateBlackScholes(sc.open, strike, type);
      let premHigh, premLow;
      if (type === 'PE') {
        premHigh = Math.max(premOpen, premClose, s.calculateBlackScholes(sc.low, strike, type));
        premLow = Math.min(premOpen, premClose, s.calculateBlackScholes(sc.high, strike, type));
      } else {
        premHigh = Math.max(premOpen, premClose, s.calculateBlackScholes(sc.high, strike, type));
        premLow = Math.min(premOpen, premClose, s.calculateBlackScholes(sc.low, strike, type));
      }
      const vol = Math.floor(Math.random() * 45000 + 15000);
      cumVol += vol;
      cumPv += ((premHigh + premLow + premClose) / 3) * vol;

      base1m.push({
        time: sc.time,
        timestamp: sc.timestamp,
        open: Math.round(premOpen * 20) / 20,
        high: Math.round(premHigh * 20) / 20,
        low: Math.round(premLow * 20) / 20,
        close: Math.round(premClose * 20) / 20,
        volume: vol,
        vwap: Math.round((cumPv / (cumVol || 1)) * 20) / 20
      });
    });

    const tf = s.currentTimeframe;
    if (tf === '1m') return base1m;
    const mins = tf === '5m' ? 5 : tf === '10m' ? 10 : tf === '15m' ? 15 : 30;
    return aggregateCandles(base1m, mins);
  }

  // Theme Management (Light / Dark Mode)
  initTheme() {
    const savedTheme = localStorage.getItem('terminal_theme') || 'dark';
    this.applyTheme(savedTheme, false);
  }

  applyTheme(theme, showToastMsg = true) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('terminal_theme', theme);

    const icon = document.getElementById('theme-toggle-icon');
    const text = document.getElementById('theme-toggle-text');
    if (icon) icon.textContent = theme === 'light' ? '☀️' : '🌙';
    if (text) text.textContent = theme === 'light' ? 'Light' : 'Dark';

    // Trigger canvas chart redraw with updated theme colors
    setTimeout(() => {
      if (this.chartEngine) this.chartEngine.render();
      if (this.dualChart1) this.dualChart1.render();
      if (this.dualChart2) this.dualChart2.render();
      if (this.spotOptChartSpot) this.spotOptChartSpot.render();
      if (this.spotOptChartOpt) this.spotOptChartOpt.render();
      if (this.tripleChartSpot) this.tripleChartSpot.render();
      if (this.tripleChartCE) this.tripleChartCE.render();
      if (this.tripleChartPE) this.tripleChartPE.render();
    }, 50);

    if (showToastMsg && window.showToast) {
      window.showToast(`🌓 Theme: ${theme === 'light' ? '☀️ Light Mode Activated' : '🌙 Dark Mode Activated'}`, 'info');
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    this.applyTheme(next, true);
  }

  // NSE Trading Holidays Calendar Modal Management
  openHolidayModal() {
    const modal = document.getElementById('modal-holiday-calendar');
    if (modal) {
      modal.style.display = 'flex';
      const mStatus = window.appState && window.appState.getMarketStatus ? window.appState.getMarketStatus() : null;
      const currentYear = mStatus && mStatus.dateKey ? parseInt(mStatus.dateKey.split('-')[0]) : 2026;
      this.renderHolidayList(currentYear);
    }
  }

  closeHolidayModal() {
    const modal = document.getElementById('modal-holiday-calendar');
    if (modal) modal.style.display = 'none';
  }

  renderHolidayList(year) {
    const container = document.getElementById('holiday-list-container');
    if (!container) return;

    document.querySelectorAll('#holiday-year-tabs button').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-hyear') === String(year));
    });

    const holidays = window.AppState && window.AppState.NSE_HOLIDAYS ? window.AppState.NSE_HOLIDAYS : {};
    const yearHolidays = Object.keys(holidays)
      .filter(k => k.startsWith(String(year)))
      .sort();

    const todayKey = window.appState && window.appState.getMarketStatus ? window.appState.getMarketStatus().dateKey : '';

    if (yearHolidays.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">No holidays listed for ${year}.</div>`;
      return;
    }

    let rowsHtml = yearHolidays.map((dateStr, idx) => {
      const name = holidays[dateStr];
      const parts = dateStr.split('-');
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      const formattedDate = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const isToday = dateStr === todayKey;

      return `
        <tr style="${isToday ? 'background: rgba(244, 63, 94, 0.18); font-weight: 700;' : ''}">
          <td style="font-family: var(--font-mono); color: ${isToday ? '#F43F5E' : 'var(--text-muted)'}; padding: 6px 8px;">
            ${idx + 1}
          </td>
          <td style="font-family: var(--font-mono); color: ${isToday ? '#FFFFFF' : 'var(--cyan-primary)'}; padding: 6px 8px; white-space: nowrap;">
            ${formattedDate} ${isToday ? '<span class="tag-badge" style="background: #F43F5E; color: #FFF; font-size: 9px; margin-left: 4px; padding: 1px 4px; border-radius: 3px;">TODAY</span>' : ''}
          </td>
          <td style="color: var(--text-secondary); font-size: 0.78rem; padding: 6px 8px;">
            ${dayName}
          </td>
          <td style="font-weight: 700; color: ${isToday ? '#FDA4AF' : 'var(--text-primary)'}; padding: 6px 8px;">
            ${name}
          </td>
          <td style="padding: 6px 8px; text-align: center;">
            <span class="tag-badge" style="background: rgba(239, 68, 68, 0.2); color: #F87171; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 3px;">CLOSED</span>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="trade-table" style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-medium); text-align: left; background: var(--bg-tertiary);">
            <th style="padding: 8px; width: 32px;">#</th>
            <th style="padding: 8px;">Date</th>
            <th style="padding: 8px;">Day</th>
            <th style="padding: 8px;">Occasion / Holiday</th>
            <th style="padding: 8px; text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new Application();
  window.app.init();
});
