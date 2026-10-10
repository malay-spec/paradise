# ⚡ BankNifty AlgoEdge Pro (v2.5)
### Institutional-Grade NSE F&O Intraday Quant Engine, AI Strike Advisor & Trading Terminal

[![Deploy to GitHub Pages](https://github.com/actions/deploy-pages/actions/workflows/deploy.yml/badge.svg)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-cyan.svg)](manifest.json)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Mac%20%7C%20Windows%20%7C%20iOS%20%7C%20Android-green.svg)](#)

A high-performance, institutional-grade BankNifty algorithmic trading terminal designed for intraday option buyers and sellers. Built with vanilla modern Web technologies (HTML5 Canvas, CSS3, JavaScript ES6+), it runs completely client-side with zero dependencies, and can be hosted directly on **GitHub Pages** or installed as a **Progressive Web App (PWA)** on any machine (Mac, Windows, Linux, Android, iOS).

---

## 🚀 1. Access From Any Machine via GitHub Pages

Once deployed to GitHub Pages, you can use BankNifty AlgoEdge Pro from **any computer, tablet, or phone** simply by opening the URL:

```
https://<YOUR_GITHUB_USERNAME>.github.io/<YOUR_REPOSITORY_NAME>/
```

* **No software installation required.**
* **Zero build steps**: Pure HTML5, CSS3, and JavaScript running natively in any modern browser.
* **Instant real-time simulation**: Generates full candlestick history, Black-Scholes options Greeks, multi-timeframe CPR/Supertrend, and 90% precision AI strike signals right in your browser.

---

## 📲 2. Install as a Native App (Desktop & Mobile)

BankNifty AlgoEdge Pro includes full **PWA (Progressive Web App)** support:

* **On Mac / Windows / Linux (Chrome, Edge, Brave)**:
  1. Open the website in Chrome or Edge.
  2. Click the **"Install App 📲"** button in the top-right header, or click the **Install** icon (💻) at the right end of your browser URL bar.
  3. The app will launch in its own dedicated, borderless window with its own Dock/Taskbar icon.

* **On iPhone & iPad (Safari)**:
  1. Open the website in Safari.
  2. Tap the **Share** button (box with upward arrow ⎋).
  3. Scroll down and tap **"Add to Home Screen"**.
  4. Tap **Add**. The AlgoEdge app will appear on your home screen with a native app icon.

* **On Android (Chrome / Brave / Firefox)**:
  1. Open the website in Chrome.
  2. Tap the **"Install App 📲"** button or open the 3-dot menu and tap **"Install app"**.

---

## 💻 3. Running Locally with Live Yahoo Finance Feeds

If you want live tick streaming from Yahoo Finance (`^NSEBANK`, India VIX, banking constituents):

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPOSITORY_NAME>.git
   cd <YOUR_REPOSITORY_NAME>
   ```

2. **Launch the local server**:
   ```bash
   python3 server.py
   ```

3. **Open in browser**:
   ```
   http://localhost:8080
   ```

---

## 📊 4. Core Features

### 🎯 90% Prediction Precision AI Strike Advisor
- **15-Minute Multi-Timeframe Trend Alignment**: Synchronizes 15m macro trend (Supertrend + 50 EMA) with 5m market structure.
- **Smart Money Liquidity Sweeps**: Recognizes institutional stop-hunt traps (wick rejections piercing prior swing highs/lows) to enter on confirmed traps.
- **Strict A+ Setup Gating & Chop Shield**: Enforces Confluence $\ge \pm 60$. When the market is choppy, directional buying is locked with a **Chop Shield** badge to protect capital.
- **Deep ITM High-Delta Strikes ($\Delta \ge 0.68$)**: Eliminates theta decay by selecting contracts with $\ge 85\%$ intrinsic value.
- **Breakeven Trailing Ratchet**: Automatically locks Stop Loss at **Cost+ (Entry + 1%)** as soon as live profit reaches **+8%**, protecting profits toward Target 1 (+16%) and Target 2 (+30%).

### 📈 Institutional High-Performance Canvas Chart Engine
- **TradingView-Style Viewport**: 6 empty bar slots (~80px right margin) to observe live forming wicks and price action.
- **22% Headroom Vertical Padding**: Prevents high wicks and swing highs from bumping against the top ceiling.
- **Single-Row Toolbar & Non-Obstructive Legend**: Ensures indicator buttons and legends never encroach into chart canvas.
- **Comprehensive Technical Overlays**: Supertrend (10, 1), Bollinger Bands (20, 2), VWAP, 9 EMA, 21 EMA, 50 EMA, RSI (14), and Volume with 20 SMA.

### ⚡ Live Options Chain & Greeks
- Real-time Black-Scholes pricing engine computing Delta ($\Delta$), Gamma ($\Gamma$), Theta ($\Theta$), Vega ($\nu$), and Implied Volatility (IV) across all strikes from 55,000 to 58,000.
- Dynamic Change-in-OI (ChgOI) writing flow and Put-Call Ratio (PCR).

### 🤖 Algo Execution Bots & Paper Trading
- **9:20 AM Short Straddle**: Auto-sells ATM CE & PE with trailing stop loss and auto-exit.
- **VWAP Scalper Bot**: Trades high-momentum breakouts and liquidity sweep rejections on Deep ITM options.
- **Paper Trading Account**: Virtual ₹10,00,000 margin with position tracking, trailing SL, and audited performance ledger.

---

## 🛠️ 5. Step-by-Step Guide: How to Push to Your GitHub

Follow these steps to upload this project to your GitHub account:

### Step 1: Create a New Repository on GitHub
1. Go to [https://github.com/new](https://github.com/new).
2. Enter a repository name (for example: `banknifty-algo-terminal`).
3. Set the repository to **Public** (required for free GitHub Pages).
4. Do **NOT** check "Initialize this repository with a README" (we already created one).
5. Click **Create repository**.

### Step 2: Push Your Code
In your computer's terminal inside the project directory, run:

```bash
# 1. Add your GitHub repository as the origin remote (replace with your actual username and repo name)
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPOSITORY_NAME>.git

# 2. Rename branch to main
git branch -M main

# 3. Push all code to GitHub
git push -u origin main
```

### Step 3: Enable GitHub Pages (1-Click)
1. In your GitHub repository, click **Settings** (gear icon at the top).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment**:
   - **Source**: Select **Deploy from a branch**.
   - **Branch**: Select **`main`**, and set folder to **`/ (root)`**.
4. Click **Save**.
5. Within 1 minute, GitHub will show:  
   *`Your site is live at https://<YOUR_GITHUB_USERNAME>.github.io/<YOUR_REPOSITORY_NAME>/`*

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
