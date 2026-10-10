# Banknifty AlgoEdge Pro - Agent Guidelines & Context

This workspace contains the **BankNifty AlgoEdge Pro** algorithmic intraday trading terminal and quant engine for the NSE BankNifty index (`^NSEBANK`).

## Active Custom Agent
- **Name**: `Banknifty`
- **Agent Spec**: [.agents/agents/Banknifty.md](file:///.agents/agents/Banknifty.md)

## Domain Specifications
1. **Index**: NSE BankNifty (`^NSEBANK`) F&O options and underlying spot.
2. **Options Modeling**: Black-Scholes Greeks ($\Delta$, $\Gamma$, $\Theta$, $\nu$), Put-Call Ratio (PCR), and Change-in-OI writing dynamics.
3. **Setup Filter**: Multi-timeframe CPR + Supertrend `[10, 1]` + 50 EMA. Minimum setup confluence $\ge \pm 60$.
4. **Strikes**: Deep ITM ($\Delta \ge 0.68$) with trailing stop loss locking at Cost+ (+1%) after +8% gain.
5. **Tech Stack**: Vanilla HTML5/CSS3/ES6+ JavaScript (zero external bundlers/frameworks), PWA support, local Python Yahoo Finance streaming server (`server.py`).
