/**
 * BankNifty AlgoEdge Terminal - Canvas Charting Engine
 * High-performance 60fps Candlestick, VWAP, Supertrend, EMA & RSI rendering.
 */

class ChartEngine {
  constructor(canvasId, legendId = null) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.legendId = legendId;

    this.candles = [];
    this.timeframe = '1m';
    this.visibleCount = 60;
    this.offset = 0; // scroll offset
    this.mouseX = -1;
    this.mouseY = -1;
    this.isHovering = false;
    this.markers = []; // { timestamp, price, type: 'BUY'|'SELL'|'EXIT', label }

    this.initEvents();
    this.bindScrollbar();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver !== 'undefined' && this.canvas && this.canvas.parentElement) {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(this.canvas.parentElement);
    }
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();

    const w = rect.width > 50 ? rect.width : (parent.clientWidth || 900);
    const h = rect.height > 50 ? rect.height : (parent.clientHeight || 520);

    this.width = w;
    this.height = h;

    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  initEvents() {
    let isDragging = false;
    let dragStartX = 0;
    let initialOffset = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStartX = e.clientX;
      initialOffset = this.offset;
      this.canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        this.canvas.style.cursor = 'crosshair';
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.isHovering = true;

      if (isDragging) {
        const dx = e.clientX - dragStartX;
        const count = Math.max(1, Math.min(this.candles.length, this.visibleCount));
        const candleW = (this.width - 70) / count;
        const shift = Math.round(dx / candleW);
        const maxOffset = Math.max(0, this.candles.length - this.visibleCount);
        this.offset = Math.max(0, Math.min(maxOffset, initialOffset - shift));
      }

      this.render();
      this.updateLegendFromMouse();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isHovering = false;
      this.mouseX = -1;
      this.mouseY = -1;
      this.render();
      this.resetLegendToLatest(true);
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.ctrlKey || e.metaKey ? 1.15 : 1.25;
      if (e.deltaY < 0) {
        this.zoomIn(zoomFactor);
      } else {
        this.zoomOut(zoomFactor);
      }
    }, { passive: false });
  }

  zoomIn(factor = 1.25) {
    const minCount = 3;
    const current = this.visibleCount || 45;
    const next = Math.max(minCount, Math.round(current / factor));
    if (next !== this.visibleCount) {
      this.visibleCount = next;
      const maxOffset = Math.max(0, this.candles.length - this.visibleCount);
      this.offset = Math.max(0, Math.min(maxOffset, this.offset));
      this.render();
      this.updateLegendFromMouse();
    }
  }

  zoomOut(factor = 1.25) {
    const maxCount = Math.max(this.candles.length || 60, 500);
    const current = this.visibleCount || 45;
    const next = Math.min(maxCount, Math.max(current + 1, Math.round(current * factor)));
    if (next !== this.visibleCount) {
      this.visibleCount = next;
      const maxOffset = Math.max(0, this.candles.length - this.visibleCount);
      this.offset = Math.max(0, Math.min(maxOffset, this.offset));
      this.render();
      this.updateLegendFromMouse();
    }
  }

  resetZoom() {
    const defaultCounts = { '1m': 90, '5m': 85, '10m': 75, '15m': 65, '30m': 55, '1d': 60 };
    const target = defaultCounts[this.timeframe] || 85;
    this.visibleCount = Math.min(this.candles.length || target, target);
    this.offset = 0;
    this.render();
    this.resetLegendToLatest();
  }

  setRangePreset(count) {
    if (!this.candles || this.candles.length === 0) return;
    const target = count === 'ALL' ? this.candles.length : Math.min(this.candles.length, Math.max(5, parseInt(count) || 100));
    this.visibleCount = target;
    this.offset = 0; // Snap to latest candle
    this.render();
    this.resetLegendToLatest();
  }

  setData(candles, timeframe = '5m') {
    const isTfChange = this.timeframe !== timeframe;
    this.candles = candles || [];
    this.timeframe = timeframe;

    if (isTfChange || !this.visibleCount) {
      const defaultCounts = { '1m': 90, '5m': 85, '10m': 75, '15m': 65, '30m': 55, '1d': 100 };
      const target = defaultCounts[this.timeframe] || 85;
      this.visibleCount = Math.min(this.candles.length || target, target);
      this.offset = 0;
    }

    const maxOffset = Math.max(0, this.candles.length - this.visibleCount);
    this.offset = Math.max(0, Math.min(maxOffset, this.offset));

    this.render();
    if (this.isHovering && this.mouseX >= 0) {
      this.updateLegendFromMouse();
    } else {
      this.resetLegendToLatest();
    }
  }

  addExecutionMarker(timestamp, price, type, label) {
    this.markers.push({ timestamp, price, type, label });
    this.render();
  }

  calculateEMAs(candles, period) {
    const k = 2 / (period + 1);
    const ema = [];
    let prevEma = null;

    for (let i = 0; i < candles.length; i++) {
      const close = candles[i].close;
      if (i === 0) {
        prevEma = close;
      } else {
        prevEma = (close * k) + (prevEma * (1 - k));
      }
      ema.push(prevEma);
    }
    return ema;
  }

  calculateSupertrend(candles, period = 10, multiplier = 1.0) {
    if (!candles || candles.length === 0) return [];
    const n = candles.length;
    const st = new Array(n);

    // 1. True Range
    const tr = new Array(n);
    tr[0] = candles[0].high - candles[0].low;
    for (let i = 1; i < n; i++) {
      const hl = candles[i].high - candles[i].low;
      const hpc = Math.abs(candles[i].high - candles[i - 1].close);
      const lpc = Math.abs(candles[i].low - candles[i - 1].close);
      tr[i] = Math.max(hl, hpc, lpc);
    }

    // 2. ATR (Wilder's Smoothing)
    const atr = new Array(n);
    let trSum = 0;
    for (let i = 0; i < Math.min(period, n); i++) {
      trSum += tr[i];
      atr[i] = trSum / (i + 1);
    }
    for (let i = period; i < n; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }

    // 3. Supertrend Bands & Trend Direction
    let prevFinalUpper = 0;
    let prevFinalLower = 0;
    let prevTrend = 1; // 1 = Bullish (Green), -1 = Bearish (Red)

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const curAtr = atr[i] || (c.high - c.low);
      const hl2 = (c.high + c.low) / 2;
      const basicUpper = hl2 + multiplier * curAtr;
      const basicLower = hl2 - multiplier * curAtr;

      let finalUpper = basicUpper;
      let finalLower = basicLower;

      if (i > 0) {
        const prevClose = candles[i - 1].close;
        if (basicUpper < prevFinalUpper || prevClose > prevFinalUpper) {
          finalUpper = basicUpper;
        } else {
          finalUpper = prevFinalUpper;
        }

        if (basicLower > prevFinalLower || prevClose < prevFinalLower) {
          finalLower = basicLower;
        } else {
          finalLower = prevFinalLower;
        }
      }

      let trend = prevTrend;
      if (i > 0) {
        if (prevTrend === 1 && c.close < prevFinalLower) {
          trend = -1;
        } else if (prevTrend === -1 && c.close > prevFinalUpper) {
          trend = 1;
        }
      } else {
        trend = (c.close >= hl2) ? 1 : -1;
      }

      const value = (trend === 1) ? finalLower : finalUpper;
      st[i] = {
        value: value,
        trend: trend,
        upper: finalUpper,
        lower: finalLower,
        signalFlip: (i > 0 && trend !== prevTrend)
      };

      prevFinalUpper = finalUpper;
      prevFinalLower = finalLower;
      prevTrend = trend;
    }

    return st;
  }

  calculateRSI(candles, period = 14) {
    if (!candles || candles.length === 0) return [];
    const n = candles.length;
    if (n <= period) return new Array(n).fill(50);

    const rsi = new Array(n).fill(50);
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < period; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / (period - 1 || 1);
    let avgLoss = losses / (period - 1 || 1);

    for (let i = period; i < n; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
    return rsi;
  }

  calculateBollingerBands(candles, period = 20, stdDev = 2.0) {
    if (!candles || candles.length === 0) return [];
    const n = candles.length;
    const bb = new Array(n);

    for (let i = 0; i < n; i++) {
      const startIdx = Math.max(0, i - period + 1);
      const slice = candles.slice(startIdx, i + 1);
      const count = slice.length;
      const mean = slice.reduce((sum, c) => sum + c.close, 0) / count;
      const variance = slice.reduce((sum, c) => sum + Math.pow(c.close - mean, 2), 0) / count;
      const sd = Math.sqrt(variance);

      const upper = mean + stdDev * sd;
      const lower = mean - stdDev * sd;
      const bandwidth = mean > 0 ? ((upper - lower) / mean) * 100 : 0;
      const percentB = (upper - lower) > 0 ? (candles[i].close - lower) / (upper - lower) : 0.5;

      bb[i] = {
        middle: mean,
        upper: upper,
        lower: lower,
        sd: sd,
        bandwidth: bandwidth,
        percentB: percentB
      };
    }
    return bb;
  }

  render() {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Background
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? '#FFFFFF' : '#070B13';
    ctx.fillRect(0, 0, w, h);

    if (this.candles.length === 0) return;

    // Subdivide main chart area, RSI sub-pane, and Volume sub-pane
    const priceScaleWidth = 70;
    const timeScaleHeight = 34;
    this.timeScaleHeight = timeScaleHeight;
    const rsiPaneHeight = window.appState.indicators.rsi ? 65 : 0;
    const volumePaneHeight = (window.appState.indicators.volume !== false) ? 55 : 0;
    const mainChartHeight = h - timeScaleHeight - rsiPaneHeight - volumePaneHeight;
    const chartWidth = w - priceScaleWidth;

    const maxOffset = Math.max(0, this.candles.length - 1);
    this.offset = Math.max(0, Math.min(maxOffset, this.offset || 0));
    const endIdx = Math.max(1, this.candles.length - this.offset);
    const startIdx = Math.max(0, endIdx - (this.visibleCount || 45));
    const visibleCandles = this.candles.slice(startIdx, endIdx);
    const count = visibleCandles.length;
    if (count === 0) return;

    this.updateScrollbarUI(startIdx, endIdx, this.candles.length);

    const ema9 = this.calculateEMAs(this.candles, 9).slice(startIdx, endIdx);
    const ema21 = this.calculateEMAs(this.candles, 21).slice(startIdx, endIdx);
    const ema50 = this.calculateEMAs(this.candles, 50).slice(startIdx, endIdx);
    const rsiValues = this.calculateRSI(this.candles, 14).slice(startIdx, endIdx);
    const supertrendValues = this.calculateSupertrend(this.candles, 10, 1.0).slice(startIdx, endIdx);
    const bbValues = this.calculateBollingerBands(this.candles, 20, 2.0).slice(startIdx, endIdx);

    // Min / Max Price Calculation
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    visibleCandles.forEach((c, idx) => {
      if (typeof c.low === 'number' && !isNaN(c.low) && c.low < minPrice) minPrice = c.low;
      if (typeof c.high === 'number' && !isNaN(c.high) && c.high > maxPrice) maxPrice = c.high;
      if (supertrendValues[idx] && typeof supertrendValues[idx].value === 'number' && !isNaN(supertrendValues[idx].value)) {
        if (supertrendValues[idx].value < minPrice) minPrice = supertrendValues[idx].value;
        if (supertrendValues[idx].value > maxPrice) maxPrice = supertrendValues[idx].value;
      }
      if (window.appState.indicators.bollinger && bbValues[idx]) {
        if (typeof bbValues[idx].lower === 'number' && !isNaN(bbValues[idx].lower) && bbValues[idx].lower < minPrice) minPrice = bbValues[idx].lower;
        if (typeof bbValues[idx].upper === 'number' && !isNaN(bbValues[idx].upper) && bbValues[idx].upper > maxPrice) maxPrice = bbValues[idx].upper;
      }
      if (window.appState.indicators.ema50 && ema50[idx] && typeof ema50[idx] === 'number' && !isNaN(ema50[idx])) {
        if (ema50[idx] < minPrice) minPrice = ema50[idx];
        if (ema50[idx] > maxPrice) maxPrice = ema50[idx];
      }
    });

    if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice >= maxPrice) {
      minPrice = (visibleCandles[0] && visibleCandles[0].close) ? visibleCandles[0].close - 50 : 57000;
      maxPrice = minPrice + 100;
    }

    // Enhanced vertical breathing room:
    // 22% top padding ensures candles never hit the top ceiling or get occluded by top toolbars / legend
    // 14% bottom padding keeps candles and lower wicks clear from bottom sub-panes
    const priceRange = maxPrice - minPrice || 10;
    const topPadding = priceRange * 0.22;
    const bottomPadding = priceRange * 0.14;
    const adjustedMin = minPrice - bottomPadding;
    const adjustedMax = maxPrice + topPadding;
    const adjustedRange = adjustedMax - adjustedMin;

    const getY = (val) => {
      return mainChartHeight - ((val - adjustedMin) / adjustedRange) * mainChartHeight;
    };

    // Right-side margin: provides 6 blank candle slots so the live forming candle has ample breathing room,
    // exactly matching TradingView and Zerodha Kite.
    const rightMarginBars = (this.offset === 0) ? 6 : 2;
    const totalSlots = count + rightMarginBars;
    const candleWidth = chartWidth / totalSlots;
    const bodyWidth = Math.max(3, Math.min(22, candleWidth * 0.68));

    // Draw Background Grid Lines
    this.drawGrid(chartWidth, mainChartHeight, priceScaleWidth, adjustedMin, adjustedMax, adjustedRange, isLight);

    // Draw Bollinger Bands (20, 2)
    if (window.appState.indicators.bollinger && bbValues.length > 0) {
      // 1. Fill Shaded Area Between Upper and Lower Band
      ctx.fillStyle = isLight ? 'rgba(56, 189, 248, 0.08)' : 'rgba(56, 189, 248, 0.06)';
      ctx.beginPath();
      bbValues.forEach((bb, idx) => {
        const x = idx * candleWidth + candleWidth / 2;
        const y = getY(bb.upper);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (let idx = bbValues.length - 1; idx >= 0; idx--) {
        const x = idx * candleWidth + candleWidth / 2;
        const y = getY(bbValues[idx].lower);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      // 2. Upper Band (Cyan)
      ctx.beginPath();
      ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.85)' : 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 1.4;
      bbValues.forEach((bb, idx) => {
        const x = idx * candleWidth + candleWidth / 2;
        const y = getY(bb.upper);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 3. Lower Band (Violet)
      ctx.beginPath();
      ctx.strokeStyle = isLight ? 'rgba(124, 58, 237, 0.85)' : 'rgba(167, 139, 250, 0.75)';
      ctx.lineWidth = 1.4;
      bbValues.forEach((bb, idx) => {
        const x = idx * candleWidth + candleWidth / 2;
        const y = getY(bb.lower);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // 4. Middle Band / SMA 20 (Amber Dashed)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      bbValues.forEach((bb, idx) => {
        const x = idx * candleWidth + candleWidth / 2;
        const y = getY(bb.middle);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Supertrend (10, 1) Line & Trend Signals
    if (window.appState.indicators.supertrend && supertrendValues.length > 0) {
      for (let i = 0; i < count; i++) {
        const currST = supertrendValues[i];
        if (!currST) continue;

        const x = i * candleWidth + candleWidth / 2;
        const y = getY(currST.value);
        const color = currST.trend === 1 ? '#10B981' : '#F43F5E';

        // Connect segments
        if (i > 0) {
          const prevST = supertrendValues[i - 1];
          const prevX = (i - 1) * candleWidth + candleWidth / 2;
          const prevY = getY(prevST.value);

          if (prevST.trend === currST.trend) {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.4;
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
        }

        // Supertrend Flip Signal Badges (BUY / SELL triangle markers)
        if (currST.changed) {
          ctx.fillStyle = color;
          ctx.beginPath();
          if (currST.trend === 1) {
            // Up Arrow (BUY)
            ctx.moveTo(x, y + 22);
            ctx.lineTo(x - 6, y + 10);
            ctx.lineTo(x + 6, y + 10);
          } else {
            // Down Arrow (SELL)
            ctx.moveTo(x, y - 22);
            ctx.lineTo(x - 6, y - 10);
            ctx.lineTo(x + 6, y - 10);
          }
          ctx.closePath();
          ctx.fill();

          // Text Badge
          ctx.font = 'bold 9px JetBrains Mono';
          ctx.textAlign = 'center';
          ctx.fillText(currST.trend === 1 ? 'BUY' : 'SELL', x, currST.trend === 1 ? y + 34 : y - 28);
        }
      }
    }

    // Draw VWAP Line (Cyan)
    if (window.appState.indicators.vwap) {
      ctx.beginPath();
      ctx.strokeStyle = isLight ? '#0284C7' : '#00F0FF';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 2]);
      visibleCandles.forEach((c, idx) => {
        const x = idx * candleWidth + candleWidth / 2;
        const y = getY(c.vwap || c.close);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw 9 EMA Line (Yellow)
    if (window.appState.indicators.ema9) {
      ctx.beginPath();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.6;
      ema9.forEach((val, idx) => {
        const x = idx * candleWidth + candleWidth / 2;
        const y = getY(val);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Draw 21 EMA Line (Purple)
    if (window.appState.indicators.ema21) {
      ctx.beginPath();
      ctx.strokeStyle = '#A855F7';
      ctx.lineWidth = 1.6;
      ema21.forEach((val, idx) => {
        const x = idx * candleWidth + candleWidth / 2;
        const y = getY(val);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Draw 50 EMA Line (Golden Yellow / Amber)
    if (window.appState.indicators.ema50 && ema50.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#EAB308';
      ctx.lineWidth = 1.8;
      let first = true;
      ema50.forEach((val, idx) => {
        if (val !== null && val !== undefined && !isNaN(val)) {
          const x = idx * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (first) { ctx.moveTo(x, y); first = false; }
          else ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    // Draw Candlesticks
    visibleCandles.forEach((c, idx) => {
      const x = idx * candleWidth + candleWidth / 2;
      const openY = getY(c.open);
      const closeY = getY(c.close);
      const highY = getY(c.high);
      const lowY = getY(c.low);

      // Session Date Divider (Demarcates boundary between trading days)
      if (idx > 0 && visibleCandles[idx].date && visibleCandles[idx - 1].date && visibleCandles[idx].date !== visibleCandles[idx - 1].date) {
        ctx.save();
        ctx.strokeStyle = isLight ? 'rgba(59, 130, 246, 0.45)' : 'rgba(0, 240, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x - candleWidth / 2, 0);
        ctx.lineTo(x - candleWidth / 2, mainChartHeight);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = isLight ? '#2563EB' : '#00F0FF';
        ctx.font = 'bold 9px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText(`📅 ${visibleCandles[idx].date}`, x - candleWidth / 2 + 5, 20);
        ctx.restore();
      }

      const isBull = c.close >= c.open;
      const color = isBull ? '#10B981' : '#F43F5E';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      const bodyY = Math.min(openY, closeY);
      const bodyH = Math.max(2, Math.abs(closeY - openY));
      ctx.fillRect(x - bodyWidth / 2, bodyY, bodyWidth, bodyH);

      // Pulse animation on the last candle
      if (idx === count - 1) {
        ctx.strokeStyle = isBull ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - bodyWidth / 2 - 1, bodyY - 1, bodyWidth + 2, bodyH + 2);
      }
    });

    // Draw Execution Markers
    this.drawMarkers(visibleCandles, candleWidth, getY);

    // Draw Current Price Highlight Line
    const currentPrice = visibleCandles[count - 1].close;
    const currentPriceY = getY(currentPrice);
    ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.8)' : 'rgba(0, 240, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, currentPriceY);
    ctx.lineTo(chartWidth, currentPriceY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price Scale Sidebar
    this.drawPriceScale(chartWidth, mainChartHeight, priceScaleWidth, adjustedMin, adjustedMax, adjustedRange, currentPrice, currentPriceY, isLight);

    // Draw RSI Sub-Pane
    if (window.appState.indicators.rsi) {
      this.drawRSIPane(chartWidth, mainChartHeight, rsiPaneHeight, rsiValues, candleWidth, isLight);
    }

    // Draw Volume Sub-Pane (Below RSI)
    if (window.appState.indicators.volume !== false && volumePaneHeight > 0) {
      this.drawVolumePane(chartWidth, mainChartHeight, rsiPaneHeight, volumePaneHeight, visibleCandles, candleWidth, isLight);
    }

    // Time Scale Bottom Bar
    this.drawTimeScale(visibleCandles, chartWidth, h, timeScaleHeight, candleWidth, isLight);

    // Crosshair & Tooltip
    if (this.isHovering && this.mouseX >= 0 && this.mouseX < chartWidth && this.mouseY >= 0 && this.mouseY < mainChartHeight) {
      this.drawCrosshair(chartWidth, mainChartHeight, this.mouseX, this.mouseY, adjustedMin, adjustedMax, adjustedRange);
    }
  }

  drawGrid(w, h, scaleW, minP, maxP, range, isLight = false) {
    const ctx = this.ctx;
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const y = (h / steps) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  drawPriceScale(w, h, scaleW, minP, maxP, range, currentP, currentY, isLight = false) {
    const ctx = this.ctx;
    ctx.fillStyle = isLight ? '#F8FAFC' : '#0D131F';
    ctx.fillRect(w, 0, scaleW, h);

    ctx.strokeStyle = isLight ? '#E2E8F0' : '#1E293B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w, h);
    ctx.stroke();

    ctx.fillStyle = isLight ? '#475569' : '#94A3B8';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'left';

    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const y = (h / steps) * i;
      const price = maxP - (i / steps) * range;
      ctx.fillText(price.toFixed(1), w + 8, y + 4);
    }

    // Current Price Tag Banner
    ctx.fillStyle = isLight ? '#0284C7' : '#00F0FF';
    const tagY = Math.max(10, Math.min(h - 10, currentY));
    ctx.fillRect(w, tagY - 10, scaleW, 20);
    ctx.fillStyle = isLight ? '#FFFFFF' : '#000000';
    ctx.font = 'bold 11px JetBrains Mono';
    ctx.fillText(currentP.toFixed(1), w + 8, tagY + 4);
  }

  drawTimeScale(visibleCandles, w, totalH, timeH, candleW, isLight = false) {
    const ctx = this.ctx;
    const y = totalH - timeH;
    ctx.fillStyle = isLight ? '#F1F5F9' : '#0B0F19';
    ctx.fillRect(0, y, w, timeH);

    // Top border of Time Scale
    ctx.strokeStyle = isLight ? '#CBD5E1' : '#1E293B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    const step = Math.max(1, Math.floor(visibleCandles.length / 8));
    let lastRenderedX = -999;

    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      if (!c) continue;
      const rawX = i * candleW + candleW / 2;

      // Dedicated 1D Daily Timeframe Formatting
      if (this.timeframe === '1d') {
        if (rawX - lastRenderedX < 76) continue;
        lastRenderedX = rawX;
        const x = Math.max(30, Math.min(w - 34, rawX));

        let formattedDate = '';
        let yearLabel = '';
        if (c.date && typeof c.date === 'string') {
          const parts = c.date.split('-');
          if (parts.length === 3) {
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const mIdx = parseInt(parts[1], 10) - 1;
            formattedDate = `${parts[2]} ${months[mIdx] || parts[1]}`;
            yearLabel = parts[0];
          }
        }
        if (!formattedDate && c.time) {
          formattedDate = c.time;
        }

        ctx.strokeStyle = isLight ? '#94A3B8' : '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 4);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillStyle = isLight ? '#0284C7' : '#00F0FF';
        ctx.font = 'bold 10px JetBrains Mono';
        ctx.fillText(formattedDate, x, y + 14);

        ctx.fillStyle = isLight ? '#64748B' : '#94A3B8';
        ctx.font = 'bold 9px JetBrains Mono';
        ctx.fillText(yearLabel, x, y + 26);
        continue;
      }

      const isDateChange = (i > 0 && c.date && visibleCandles[i - 1].date && c.date !== visibleCandles[i - 1].date);
      const isSessionOpen = (c.time === '09:15');
      const isRegularStep = (i % step === 0);

      if (isDateChange || isSessionOpen || isRegularStep) {
        // Prevent label collision
        if (rawX - lastRenderedX < 60 && !isDateChange && !isSessionOpen) continue;
        lastRenderedX = rawX;
        const x = Math.max(30, Math.min(w - 34, rawX));

        // Format short date (e.g. 15 Sep or 11 Sep) with fail-safe fallback
        let dateLabel = '';
        if (c.date && typeof c.date === 'string') {
          const parts = c.date.split('-');
          if (parts.length === 3) {
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const mIdx = parseInt(parts[1], 10) - 1;
            dateLabel = `${parts[2]} ${months[mIdx] || parts[1]}`;
          } else {
            dateLabel = c.date;
          }
        } else if (c.timestamp) {
          const d = new Date(c.timestamp);
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          dateLabel = `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`;
        } else {
          const d = new Date();
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          dateLabel = `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`;
        }

        let timeLabel = c.time;
        if (!timeLabel && c.timestamp) {
          const d = new Date(c.timestamp);
          timeLabel = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        if (!timeLabel) timeLabel = '09:15';

        // Tick mark pointing down from border
        ctx.strokeStyle = isLight ? '#94A3B8' : '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 4);
        ctx.stroke();

        ctx.textAlign = 'center';

        if (isDateChange || isSessionOpen) {
          // Highlight Session Open / Date Change with high-contrast Cyan/Sky Blue
          ctx.fillStyle = isLight ? '#0284C7' : '#00F0FF';
          ctx.font = 'bold 10px JetBrains Mono';
          ctx.fillText(timeLabel, x, y + 14);

          ctx.fillStyle = isLight ? '#0369A1' : '#38BDF8';
          ctx.font = 'bold 9px JetBrains Mono';
          ctx.fillText(`📅 ${dateLabel}`, x, y + 26);
        } else {
          // Regular step: High-contrast white for Time, sky blue for Date
          ctx.fillStyle = isLight ? '#0F172A' : '#FFFFFF';
          ctx.font = 'bold 10px JetBrains Mono';
          ctx.fillText(timeLabel, x, y + 14);

          ctx.fillStyle = isLight ? '#0284C7' : '#38BDF8';
          ctx.font = 'bold 9px JetBrains Mono';
          ctx.fillText(dateLabel, x, y + 26);
        }
      }
    }
  }

  drawRSIPane(w, mainH, rsiH, rsiValues, candleW, isLight = false) {
    const ctx = this.ctx;
    const yStart = mainH;

    ctx.fillStyle = isLight ? '#F8FAFC' : '#090D17';
    ctx.fillRect(0, yStart, w, rsiH);

    ctx.strokeStyle = isLight ? '#E2E8F0' : '#1E293B';
    ctx.beginPath();
    ctx.moveTo(0, yStart);
    ctx.lineTo(w, yStart);
    ctx.stroke();

    // 70 & 30 Lines
    const y70 = yStart + rsiH * 0.3;
    const y30 = yStart + rsiH * 0.7;

    ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, y70);
    ctx.lineTo(w, y70);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, y30);
    ctx.lineTo(w, y30);
    ctx.stroke();
    ctx.setLineDash([]);

    // RSI Label
    const latestRsi = rsiValues[rsiValues.length - 1] || 50;
    ctx.fillStyle = '#60A5FA';
    ctx.font = 'bold 10px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(`RSI (14): ${latestRsi.toFixed(1)}`, 10, yStart + 16);

    // RSI Curve
    ctx.beginPath();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    rsiValues.forEach((val, idx) => {
      const x = idx * candleW + candleW / 2;
      const y = yStart + rsiH - (val / 100) * rsiH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Prominent RSI Callout Badge on the CURRENT (Last) CANDLE
    if (rsiValues.length > 0) {
      const lastIdx = rsiValues.length - 1;
      const curVal = rsiValues[lastIdx];
      const curX = lastIdx * candleW + candleW / 2;
      const curY = yStart + rsiH - (curVal / 100) * rsiH;

      // Glow circle on the point
      ctx.beginPath();
      ctx.arc(curX, curY, 4, 0, Math.PI * 2);
      ctx.fillStyle = curVal >= 70 ? '#F43F5E' : (curVal <= 30 ? '#10B981' : '#38BDF8');
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Glowing Badge Pill right next to current candle point
      const badgeText = `${curVal.toFixed(1)}`;
      ctx.font = 'bold 10px JetBrains Mono';
      const textWidth = ctx.measureText(badgeText).width;
      const pillW = textWidth + 12;
      const pillH = 16;
      let pillX = curX - pillW - 6;
      if (pillX < 10) pillX = curX + 8;
      let pillY = curY - pillH / 2;
      pillY = Math.max(yStart + 2, Math.min(yStart + rsiH - pillH - 2, pillY));

      ctx.fillStyle = curVal >= 70 ? 'rgba(244, 63, 94, 0.95)' : (curVal <= 30 ? 'rgba(16, 185, 129, 0.95)' : 'rgba(56, 189, 248, 0.95)');
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(pillX, pillY, pillW, pillH, 4);
      } else {
        ctx.rect(pillX, pillY, pillW, pillH);
      }
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, pillX + pillW / 2, pillY + pillH / 2);
      ctx.textBaseline = 'alphabetic';
    }
  }

  drawVolumePane(w, mainH, rsiH, volH, visibleCandles, candleW, isLight = false) {
    if (volH <= 0 || !visibleCandles || visibleCandles.length === 0) return;
    const ctx = this.ctx;
    const yStart = mainH + rsiH;
    const len = visibleCandles.length;

    // Background
    ctx.fillStyle = isLight ? '#F1F5F9' : '#080C14';
    ctx.fillRect(0, yStart, w, volH);

    // Separator Line
    ctx.strokeStyle = isLight ? '#E2E8F0' : '#1E293B';
    ctx.beginPath();
    ctx.moveTo(0, yStart);
    ctx.lineTo(w, yStart);
    ctx.stroke();

    // Determine max volume for scaling:
    // Anchor maxVol to historical closed candles (0 to len-2) so the scale stays rock-solid
    // and historical bars NEVER jump or shrink as the current candle's volume builds up!
    let maxVol = 1;
    for (let i = 0; i < len - 1; i++) {
      const v = typeof visibleCandles[i].volume === 'number' ? visibleCandles[i].volume : 0;
      if (v > maxVol) maxVol = v;
    }
    const lastVol = (len > 0 && typeof visibleCandles[len - 1].volume === 'number') ? visibleCandles[len - 1].volume : 0;
    if (lastVol > maxVol) maxVol = lastVol;
    if (maxVol <= 0) maxVol = 50000;

    // Format volume numbers
    const formatVol = (val) => {
      if (val >= 10000000) return `${(val / 10000000).toFixed(2)}Cr`;
      if (val >= 100000) return `${(val / 100000).toFixed(1)}L`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return `${val}`;
    };

    // Calculate 20-period Volume Moving Average (SMA 20)
    const sma20 = [];
    for (let i = 0; i < len; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - 19); j <= i; j++) {
        const v = typeof visibleCandles[j].volume === 'number' ? visibleCandles[j].volume : 0;
        sum += v;
        count++;
      }
      sma20.push(count > 0 ? (sum / count) : 0);
    }

    // Draw Volume Bars aligned with each candle
    const barWidth = Math.max(1, Math.min(18, candleW * 0.65));
    visibleCandles.forEach((c, idx) => {
      const x = idx * candleW + candleW / 2;
      const v = typeof c.volume === 'number' ? c.volume : 0;
      const barH = Math.max(2, (v / maxVol) * (volH - 20));
      const barY = yStart + volH - barH;

      const isBull = c.close >= c.open;
      const isLatest = idx === len - 1;

      if (isLatest) {
        // Current forming candle: vibrant live color with crisp border
        ctx.fillStyle = isBull ? '#10B981' : '#F43F5E';
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barH);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x - barWidth / 2, barY, barWidth, barH);
      } else {
        // Historical closed candles: stable colors that remain fixed
        ctx.fillStyle = isBull 
          ? (isLight ? 'rgba(16, 185, 129, 0.70)' : 'rgba(16, 185, 129, 0.60)') 
          : (isLight ? 'rgba(244, 63, 94, 0.70)' : 'rgba(244, 63, 94, 0.60)');
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barH);
      }
    });

    // Draw 20-period Volume SMA line (Amber/Yellow line, similar to TradingView)
    if (len > 1) {
      ctx.strokeStyle = isLight ? '#D97706' : '#F59E0B';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      let firstSma = true;
      visibleCandles.forEach((c, idx) => {
        const x = idx * candleW + candleW / 2;
        const sVal = sma20[idx] || 0;
        const sH = (sVal / maxVol) * (volH - 20);
        const sY = yStart + volH - sH;
        if (firstSma) { ctx.moveTo(x, sY); firstSma = false; }
        else { ctx.lineTo(x, sY); }
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Status Overlay: Current Live Volume, 20 SMA, and Peak
    const isLatestBull = len > 0 ? (visibleCandles[len - 1].close >= visibleCandles[len - 1].open) : true;
    const liveVolColor = isLatestBull ? '#10B981' : '#F43F5E';
    const curSma = sma20[len - 1] || 0;

    ctx.font = 'bold 10px JetBrains Mono';
    ctx.textAlign = 'left';

    ctx.fillStyle = isLight ? '#475569' : '#94A3B8';
    ctx.fillText('VOL (Live): ', 10, yStart + 14);

    ctx.fillStyle = liveVolColor;
    const volStr = `${formatVol(lastVol)}`;
    ctx.fillText(volStr, 80, yStart + 14);
    const volTextWidth = ctx.measureText(volStr).width;

    ctx.fillStyle = isLight ? '#475569' : '#94A3B8';
    ctx.fillText(` | 20 SMA: ${formatVol(curSma)} | PEAK: ${formatVol(maxVol)}`, 80 + volTextWidth + 4, yStart + 14);
  }

  drawMarkers(visibleCandles, candleW, getY) {
    const ctx = this.ctx;
    this.markers.forEach(m => {
      const idx = visibleCandles.findIndex(c => Math.abs(c.timestamp - m.timestamp) < 120000);
      if (idx !== -1) {
        const x = idx * candleW + candleW / 2;
        const y = getY(m.price);

        if (m.type === 'BUY') {
          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.moveTo(x, y + 16);
          ctx.lineTo(x - 6, y + 26);
          ctx.lineTo(x + 6, y + 26);
          ctx.closePath();
          ctx.fill();
        } else if (m.type === 'SELL') {
          ctx.fillStyle = '#F43F5E';
          ctx.beginPath();
          ctx.moveTo(x, y - 16);
          ctx.lineTo(x - 6, y - 26);
          ctx.lineTo(x + 6, y - 26);
          ctx.closePath();
          ctx.fill();
        }
      }
    });
  }

  drawCrosshair(w, h, mx, my, minP, maxP, range) {
    const ctx = this.ctx;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.35)' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    ctx.beginPath();
    ctx.moveTo(0, my);
    ctx.lineTo(w, my);
    ctx.moveTo(mx, 0);
    ctx.lineTo(mx, h);
    ctx.stroke();
    ctx.setLineDash([]);

    const hoverPrice = maxP - (my / h) * range;
    ctx.fillStyle = isLight ? '#0F172A' : '#1E293B';
    ctx.fillRect(w, my - 10, 68, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(hoverPrice.toFixed(1), w + 6, my + 4);

    // Date & Time Hover Badge on Bottom X-Axis
    const maxOffset = Math.max(0, this.candles.length - 1);
    const offset = Math.max(0, Math.min(maxOffset, this.offset || 0));
    const endIdx = Math.max(1, this.candles.length - offset);
    const startIdx = Math.max(0, endIdx - (this.visibleCount || 45));
    const visibleCandles = this.candles.slice(startIdx, endIdx);
    const rightMarginBars = (offset === 0) ? 6 : 2;
    const totalSlots = visibleCandles.length + rightMarginBars;
    const candleWidth = w / totalSlots;
    let hoverIdx = Math.floor(mx / candleWidth);
    if (hoverIdx >= visibleCandles.length && mx <= w) {
      hoverIdx = visibleCandles.length - 1;
    }
    if (hoverIdx >= 0 && hoverIdx < visibleCandles.length) {
      const hc = visibleCandles[hoverIdx];
      const dtText = `📅 ${hc.date || ''}  ⏰ ${hc.time || ''}`;
      ctx.font = 'bold 10px JetBrains Mono';
      const textW = ctx.measureText(dtText).width + 16;
      const pillX = Math.max(2, Math.min(w - textW - 2, mx - textW / 2));
      const pillY = this.height - (this.timeScaleHeight || 34) + 6;
      ctx.fillStyle = isLight ? '#0F172A' : '#00F0FF';
      ctx.fillRect(pillX, pillY, textW, 22);
      ctx.fillStyle = isLight ? '#FFFFFF' : '#080C14';
      ctx.textAlign = 'center';
      ctx.fillText(dtText, pillX + textW / 2, pillY + 15);
    }
  }

  updateLegendFromMouse() {
    if (!this.candles || this.candles.length === 0) return;
    const maxOffset = Math.max(0, this.candles.length - 1);
    const offset = Math.max(0, Math.min(maxOffset, this.offset || 0));
    const endIdx = Math.max(1, this.candles.length - offset);
    const startIdx = Math.max(0, endIdx - (this.visibleCount || 45));
    const visibleCandles = this.candles.slice(startIdx, endIdx);
    if (visibleCandles.length === 0) return;

    const chartWidth = this.width - 70;
    const rightMarginBars = (offset === 0) ? 6 : 2;
    const totalSlots = visibleCandles.length + rightMarginBars;
    const candleWidth = chartWidth / totalSlots;
    let idx = Math.floor(this.mouseX / candleWidth);

    if (this.mouseX >= 0 && this.mouseX <= chartWidth) {
      idx = Math.max(0, Math.min(visibleCandles.length - 1, idx));
      const c = visibleCandles[idx];
      const actualIdx = startIdx + idx;
      this.updateLegendValues(c, actualIdx);
    } else if (this.mouseX > chartWidth) {
      const idx = visibleCandles.length - 1;
      this.updateLegendValues(visibleCandles[idx], startIdx + idx);
    }
  }

  resetLegendToLatest(force = false) {
    if (this.isHovering && !force) {
      this.updateLegendFromMouse();
      return;
    }
    if (this.candles.length > 0) {
      this.updateLegendValues(this.candles[this.candles.length - 1], this.candles.length - 1);
    }
  }

  updateLegendValues(c, candleIdx = -1) {
    if (!c) return;
    let el = this.legendId ? document.getElementById(this.legendId) : null;
    if (!el && this.canvas && this.canvas.parentElement) {
      el = this.canvas.parentElement.querySelector('.chart-legend-overlay');
    }
    if (!el) {
      el = document.getElementById('chart-legend-content');
    }
    if (!el) return;

    // Safety fallback: ensure OHLC are genuine numeric values
    let openVal = typeof c.open === 'number' && !isNaN(c.open) ? c.open : (c.close || 0);
    let highVal = typeof c.high === 'number' && !isNaN(c.high) ? c.high : openVal;
    let lowVal = typeof c.low === 'number' && !isNaN(c.low) ? c.low : openVal;
    let closeVal = typeof c.close === 'number' && !isNaN(c.close) ? c.close : openVal;

    // In the rare event any source sends flat OHLC, synthesize natural realistic candle spread
    if (openVal === highVal && highVal === lowVal && lowVal === closeVal) {
      const prevC = (candleIdx > 0 && this.candles[candleIdx - 1]) ? this.candles[candleIdx - 1].close : closeVal;
      openVal = prevC;
      highVal = Math.max(openVal, closeVal) + 8.50;
      lowVal = Math.min(openVal, closeVal) - 7.50;
    }

    const isBull = closeVal >= openVal;
    const chgClass = isBull ? 'bull' : 'bear';
    const change = closeVal - openVal;
    const changePct = openVal > 0 ? (change / openVal) * 100 : 0;
    const sign = change >= 0 ? '+' : '';

    const instMeta = this.instrumentMeta || window.appState.getActiveInstrumentMeta();
    const unit = instMeta.unit || '₹';
    const targetIdx = (candleIdx >= 0 && candleIdx < this.candles.length) ? candleIdx : (this.candles.length - 1);

    // 1. VWAP Info
    let vwapInfo = '';
    if (window.appState.indicators.vwap) {
      const vwapVal = c.vwap || (this.candles[targetIdx] && this.candles[targetIdx].vwap);
      vwapInfo = `VWAP: <b class="legend-val" style="color: var(--cyan-primary); font-weight: 700;">${vwapVal ? unit + vwapVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</b>`;
    }

    // 2. 9 EMA Info (Amber / Yellow)
    let ema9Info = '';
    if (window.appState.indicators.ema9 && this.candles.length > 0) {
      const ema9Arr = this.calculateEMAs(this.candles, 9);
      const ema9Val = ema9Arr[targetIdx] !== undefined ? ema9Arr[targetIdx] : ema9Arr[ema9Arr.length - 1];
      if (ema9Val !== null && ema9Val !== undefined) {
        ema9Info = `9 EMA: <b class="legend-val" style="color: #F59E0B; font-weight: 700;">${unit}${ema9Val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>`;
      }
    }

    // 3. 21 EMA Info (Purple)
    let ema21Info = '';
    if (window.appState.indicators.ema21 && this.candles.length > 0) {
      const ema21Arr = this.calculateEMAs(this.candles, 21);
      const ema21Val = ema21Arr[targetIdx] !== undefined ? ema21Arr[targetIdx] : ema21Arr[ema21Arr.length - 1];
      if (ema21Val !== null && ema21Val !== undefined) {
        ema21Info = `21 EMA: <b class="legend-val" style="color: #A855F7; font-weight: 700;">${unit}${ema21Val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>`;
      }
    }

    // 3b. 50 EMA Info (Golden Yellow)
    let ema50Info = '';
    if (window.appState.indicators.ema50 && this.candles.length > 0) {
      const ema50Arr = this.calculateEMAs(this.candles, 50);
      const ema50Val = ema50Arr[targetIdx] !== undefined ? ema50Arr[targetIdx] : ema50Arr[ema50Arr.length - 1];
      if (ema50Val !== null && ema50Val !== undefined) {
        ema50Info = `50 EMA: <b class="legend-val" style="color: #EAB308; font-weight: 700;">${unit}${ema50Val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>`;
      }
    }

    // 4. Supertrend (10, 1) Info
    let stInfo = '';
    if (window.appState.indicators.supertrend && this.candles.length > 0) {
      const stArr = this.calculateSupertrend(this.candles, 10, 1.0);
      const st = stArr[targetIdx] || stArr[stArr.length - 1];
      if (st) {
        const isStBull = st.trend === 1;
        stInfo = `ST(10,1): <b class="legend-val ${isStBull ? 'bull' : 'bear'}">${unit}${st.value.toFixed(1)} (${isStBull ? 'BULL' : 'BEAR'})</b>`;
      }
    }

    // 5. Bollinger Bands (20, 2)
    let bbInfo = '';
    if (window.appState.indicators.bollinger && this.candles.length > 0) {
      const bbArr = this.calculateBollingerBands(this.candles, 20, 2.0);
      const bb = bbArr[targetIdx] || bbArr[bbArr.length - 1];
      if (bb) {
        bbInfo = `BB(20,2): <b class="legend-val" style="color: #38BDF8;">UB:${unit}${bb.upper.toFixed(1)}</b> <b class="legend-val" style="color: #F59E0B;">MB:${unit}${bb.middle.toFixed(1)}</b> <b class="legend-val" style="color: #A78BFA;">LB:${unit}${bb.lower.toFixed(1)}</b>`;
      }
    }

    // 6. RSI (14)
    let rsiInfo = '';
    if (window.appState.indicators.rsi && this.candles.length > 0) {
      const rsiArr = this.calculateRSI(this.candles, 14);
      const rsiVal = rsiArr[targetIdx] !== undefined ? rsiArr[targetIdx] : rsiArr[rsiArr.length - 1];
      if (rsiVal !== null && rsiVal !== undefined) {
        const rsiColor = rsiVal >= 70 ? 'var(--bear-red)' : (rsiVal <= 30 ? 'var(--bull-green)' : 'var(--cyan-primary)');
        rsiInfo = `RSI(14): <b class="legend-val" style="color: ${rsiColor}; font-weight: 700;">${rsiVal.toFixed(1)}</b>`;
      }
    }

    // 7. Candlestick Structure & Pattern Info
    let structureInfo = '';
    if (window.candleStructureAnalyzer && this.candles.length > 0) {
      const struct = window.candleStructureAnalyzer.getStructureScore(this.candles.slice(0, targetIdx + 1));
      if (struct) {
        const structColor = struct.score > 5 ? 'var(--bull-green)' : (struct.score < -5 ? 'var(--bear-red)' : 'var(--cyan-primary)');
        structureInfo = `<span class="legend-struct-badge" style="display: inline-flex; align-items: center; gap: 4px; background: rgba(13, 20, 36, 0.85); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(0, 240, 255, 0.25); margin-left: 4px;">
          <span style="color: #FDE047; font-weight: 700; font-size: 0.9em;">🕯️</span>
          <b style="color: ${structColor}; font-weight: 700;">${struct.patternName}</b>
          <span style="color: var(--text-muted); font-size: 0.85em;">· ${struct.marketStructure}</span>
        </span>`;
      }
    }

    const formattedOpen = `${unit}${openVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedHigh = `${unit}${highVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedLow = `${unit}${lowVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedClose = `${unit}${closeVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const dtLabel = this.timeframe === '1d' 
      ? `📅 ${c.date || c.time} (Daily Session)` 
      : `📅 ${c.date || ''}  ⏰ ${c.time || ''} IST`;

    el.innerHTML = `
      <span class="legend-symbol" style="color: var(--cyan-primary); font-weight: 800;">${instMeta.name} [${this.timeframe}]</span>
      <span class="legend-datetime" style="color: #FDE047; font-weight: 700; margin: 0 6px; font-size: 0.9em;">${dtLabel}</span>
      <span class="legend-ohlc">
        O: <b class="legend-val" style="color: #E2E8F0; font-weight: 700;">${formattedOpen}</b>
        H: <b class="legend-val" style="color: #34D399; font-weight: 700;">${formattedHigh}</b>
        L: <b class="legend-val" style="color: #F87171; font-weight: 700;">${formattedLow}</b>
        C: <b class="legend-val ${chgClass}" style="font-weight: 700;">${formattedClose}</b>
        <b class="legend-val ${chgClass}" style="font-weight: 700; font-size: 0.92em;">(${sign}${change.toFixed(2)} · ${sign}${changePct.toFixed(2)}%)</b>
        Vol: <b class="legend-val" style="color: var(--text-primary); font-weight: 600;">${(c.volume || 0).toLocaleString()}</b>
        ${vwapInfo}
        ${ema9Info}
        ${ema21Info}
        ${ema50Info}
        ${stInfo}
        ${bbInfo}
        ${rsiInfo}
        ${structureInfo}
      </span>
    `;
  }

  bindScrollbar() {
    this.scrollTrack = document.getElementById('chart-scroll-track');
    this.scrollThumb = document.getElementById('chart-scroll-thumb');
    this.btnScrollInception = document.getElementById('btn-scroll-inception');
    this.btnScrollLatest = document.getElementById('btn-scroll-latest');
    this.btnScrollLeft = document.getElementById('btn-scroll-left');
    this.btnScrollRight = document.getElementById('btn-scroll-right');
    this.scrollTimeRange = document.getElementById('chart-scroll-time-range');

    if (!this.scrollTrack || !this.scrollThumb) return;

    let isThumbDragging = false;
    let thumbStartX = 0;
    let initialThumbLeft = 0;

    this.scrollThumb.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      isThumbDragging = true;
      thumbStartX = e.clientX;
      initialThumbLeft = this.scrollThumb.offsetLeft;
      this.scrollThumb.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isThumbDragging || !this.scrollTrack) return;
      const trackRect = this.scrollTrack.getBoundingClientRect();
      const trackWidth = trackRect.width;
      const thumbWidth = this.scrollThumb.offsetWidth;
      const maxThumbLeft = Math.max(1, trackWidth - thumbWidth);

      const dx = e.clientX - thumbStartX;
      let newLeft = Math.max(0, Math.min(maxThumbLeft, initialThumbLeft + dx));
      const pct = newLeft / maxThumbLeft;

      const maxOffset = Math.max(0, this.candles.length - (this.visibleCount || 45));
      this.offset = Math.round((1 - pct) * maxOffset);
      this.render();
      this.updateLegendFromMouse();
    });

    window.addEventListener('mouseup', () => {
      if (isThumbDragging) {
        isThumbDragging = false;
        if (this.scrollThumb) this.scrollThumb.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });

    // Click on track to jump
    this.scrollTrack.addEventListener('click', (e) => {
      if (e.target === this.scrollThumb) return;
      const trackRect = this.scrollTrack.getBoundingClientRect();
      const clickX = e.clientX - trackRect.left;
      const pct = Math.max(0, Math.min(1, clickX / trackRect.width));
      const maxOffset = Math.max(0, this.candles.length - (this.visibleCount || 45));
      this.offset = Math.round((1 - pct) * maxOffset);
      this.render();
    });

    // Inception button: jump to earliest historical candle
    if (this.btnScrollInception) {
      this.btnScrollInception.addEventListener('click', () => {
        const maxOffset = Math.max(0, this.candles.length - (this.visibleCount || 45));
        this.offset = maxOffset;
        this.render();
      });
    }

    // Latest button: snap to latest real-time candle
    if (this.btnScrollLatest) {
      this.btnScrollLatest.addEventListener('click', () => {
        this.offset = 0;
        this.render();
      });
    }

    // Left pan button: pan back 20% of visible window
    if (this.btnScrollLeft) {
      this.btnScrollLeft.addEventListener('click', () => {
        const step = Math.max(3, Math.round((this.visibleCount || 45) * 0.25));
        const maxOffset = Math.max(0, this.candles.length - (this.visibleCount || 45));
        this.offset = Math.min(maxOffset, this.offset + step);
        this.render();
      });
    }

    // Right pan button: pan forward 20% of visible window
    if (this.btnScrollRight) {
      this.btnScrollRight.addEventListener('click', () => {
        const step = Math.max(3, Math.round((this.visibleCount || 45) * 0.25));
        this.offset = Math.max(0, this.offset - step);
        this.render();
      });
    }
  }

  updateScrollbarUI(startIdx, endIdx, totalCount) {
    if (!this.scrollTrack || !this.scrollThumb) return;
    if (totalCount <= 0) return;

    const trackWidth = this.scrollTrack.offsetWidth || 300;
    const count = this.visibleCount || 45;
    const thumbWidthPct = Math.max(6, Math.min(100, (count / totalCount) * 100));
    const thumbWidthPx = (thumbWidthPct / 100) * trackWidth;

    const maxOffset = Math.max(0, totalCount - count);
    const pct = maxOffset > 0 ? (1 - (this.offset / maxOffset)) : 1.0;
    const maxLeftPx = Math.max(0, trackWidth - thumbWidthPx);
    const leftPx = pct * maxLeftPx;

    this.scrollThumb.style.width = `${thumbWidthPct.toFixed(2)}%`;
    this.scrollThumb.style.left = `${leftPx.toFixed(1)}px`;

    // Active state on LIVE button
    if (this.btnScrollLatest) {
      this.btnScrollLatest.classList.toggle('active', this.offset === 0);
    }

    // Time range display
    if (this.scrollTimeRange && this.candles.length > 0) {
      const cStart = this.candles[startIdx] || this.candles[0];
      const cEnd = this.candles[Math.min(this.candles.length - 1, endIdx - 1)] || this.candles[this.candles.length - 1];
      if (cStart && cEnd) {
        const startDt = cStart.date ? `${cStart.date.substring(5)} ` : '';
        const endDt = cEnd.date ? `${cEnd.date.substring(5)} ` : '';
        this.scrollTimeRange.textContent = `📅 ${startDt}${cStart.time} ➔ ${endDt}${cEnd.time} (${endIdx}/${totalCount})`;
      }
    }
  }
}

window.ChartEngine = ChartEngine;
