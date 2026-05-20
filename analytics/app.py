"""
Synthetic Exchange - Analytics Dashboard
Real-time market analytics and portfolio monitoring powered by Streamlit
"""

import streamlit as st
import requests
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import numpy as np
import time
from datetime import datetime

# Configuration
import os
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8080")
REFRESH_INTERVAL = 3  # seconds

st.set_page_config(
    page_title="Synthetic Exchange Analytics",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom CSS
st.markdown("""
<style>
    .stApp { background-color: #0f172a; }
    .metric-card {
        background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 20px;
        text-align: center;
    }
    .metric-value { font-size: 2rem; font-weight: bold; color: #e2e8f0; }
    .metric-label { font-size: 0.85rem; color: #94a3b8; margin-top: 4px; }
    .status-live { color: #22c55e; font-weight: bold; }
    .status-offline { color: #ef4444; font-weight: bold; }
</style>
""", unsafe_allow_html=True)


def fetch_data(endpoint: str):
    """Fetch data from the backend API."""
    try:
        response = requests.get(f"{BACKEND_URL}{endpoint}", timeout=5)
        if response.status_code == 200:
            return response.json()
    except requests.exceptions.RequestException:
        return None
    return None


def main():
    # Header
    col1, col2, col3 = st.columns([3, 1, 1])
    with col1:
        st.title("📊 Synthetic Exchange Analytics")
        st.caption("Real-time market monitoring & portfolio analytics")
    
    with col2:
        health = fetch_data("/health")
        if health:
            st.markdown(f'<p class="status-live">● System Online</p>', unsafe_allow_html=True)
            st.caption(f"Uptime: {health.get('uptime', 0):.0f}s")
        else:
            st.markdown(f'<p class="status-offline">● Offline</p>', unsafe_allow_html=True)
            st.caption("Backend not reachable")
    
    with col3:
        if st.button("🔄 Refresh", use_container_width=True):
            st.rerun()

    st.divider()

    # Sidebar
    with st.sidebar:
        st.header("⚙️ Settings")
        auto_refresh = st.checkbox("Auto-refresh", value=True)
        refresh_rate = st.slider("Refresh rate (s)", 1, 30, REFRESH_INTERVAL)
        
        st.divider()
        st.header("📈 Symbols")
        symbols_data = fetch_data("/api/symbols")
        if symbols_data and "quotes" in symbols_data:
            for quote in symbols_data["quotes"]:
                change_color = "🟢" if quote.get("changePercent24h", 0) >= 0 else "🔴"
                st.text(f"{change_color} {quote['symbol']}: ${quote['price']:.2f}")

    # Main content
    if not health:
        st.error("Cannot connect to backend. Make sure the server is running on port 8080.")
        st.code("docker-compose up", language="bash")
        return

    # Fetch all data
    stats = fetch_data("/api/stats")
    market_data = fetch_data("/api/market-data")
    portfolio = fetch_data("/api/portfolio/USER_1")
    trades = fetch_data("/api/trades?count=100")

    # Top Metrics Row
    st.subheader("📊 System Metrics")
    m1, m2, m3, m4, m5 = st.columns(5)
    
    with m1:
        st.metric("Total Orders", f"{stats.get('totalOrders', 0):,}" if stats else "—")
    with m2:
        st.metric("Total Trades", f"{stats.get('totalTrades', 0):,}" if stats else "—")
    with m3:
        st.metric("WS Clients", stats.get('wsConnections', 0) if stats else "—")
    with m4:
        mid_price = stats.get('midPrice', 0) if stats else 0
        st.metric("Mid Price", f"${mid_price:.2f}" if mid_price else "—")
    with m5:
        spread = stats.get('spread', 0) if stats else 0
        st.metric("Spread", f"${spread:.4f}" if spread else "—")

    st.divider()

    # Market Data Table & Chart
    col_left, col_right = st.columns([2, 1])

    with col_left:
        st.subheader("🌐 Live Market Data")
        if market_data and isinstance(market_data, list):
            df = pd.DataFrame(market_data)
            if not df.empty:
                df["price_fmt"] = df["price"].apply(lambda x: f"${x:,.2f}")
                df["change_fmt"] = df["changePercent24h"].apply(
                    lambda x: f"+{x:.2f}%" if x >= 0 else f"{x:.2f}%"
                )
                df["volume_fmt"] = df["volume24h"].apply(
                    lambda x: f"${x/1e6:.1f}M" if x >= 1e6 else f"${x/1e3:.1f}K"
                )
                
                # Color-coded table
                display_df = df[["symbol", "price_fmt", "change_fmt", "volume_fmt"]].rename(columns={
                    "symbol": "Symbol",
                    "price_fmt": "Price",
                    "change_fmt": "24h Change",
                    "volume_fmt": "Volume",
                })
                st.dataframe(display_df, use_container_width=True, hide_index=True)

                # Price comparison chart
                fig = px.bar(
                    df.sort_values("changePercent24h", ascending=True),
                    x="changePercent24h",
                    y="symbol",
                    orientation="h",
                    color="changePercent24h",
                    color_continuous_scale=["#ef4444", "#fbbf24", "#22c55e"],
                    title="24h Price Change (%)",
                )
                fig.update_layout(
                    paper_bgcolor="#0f172a",
                    plot_bgcolor="#1e293b",
                    font_color="#e2e8f0",
                    showlegend=False,
                    height=350,
                )
                st.plotly_chart(fig, use_container_width=True)

    with col_right:
        st.subheader("💼 Portfolio Summary")
        if portfolio:
            total_value = portfolio.get("totalValue", 100000)
            total_pnl = portfolio.get("totalPnL", 0)
            pnl_pct = portfolio.get("pnlPercent", 0)
            
            st.metric(
                "Total Value",
                f"${total_value:,.2f}",
                delta=f"{pnl_pct:+.2f}%",
            )
            st.metric("Cash", f"${portfolio.get('cash', 0):,.2f}")
            st.metric(
                "Total P&L",
                f"${total_pnl:,.2f}",
                delta=f"{'Profit' if total_pnl >= 0 else 'Loss'}",
                delta_color="normal" if total_pnl >= 0 else "inverse",
            )

            # Positions
            positions = portfolio.get("positions", [])
            if positions:
                st.markdown("**Open Positions:**")
                for pos in positions:
                    direction = "🟢 LONG" if pos.get("quantity", 0) > 0 else "🔴 SHORT"
                    st.text(f"{direction} {pos['symbol']}: {abs(pos['quantity']):.2f} (${pos.get('marketValue', 0):.2f})")

    st.divider()

    # Trade Analysis
    st.subheader("📈 Trade Flow Analysis")
    
    trade_list = trades.get("trades", trades) if isinstance(trades, dict) else trades
    if trade_list and isinstance(trade_list, list) and len(trade_list) > 0:
        trades_df = pd.DataFrame(trade_list)
        
        if "timestamp" in trades_df.columns and "price" in trades_df.columns:
            trades_df["time"] = pd.to_datetime(trades_df["timestamp"], unit="ms")
            
            t1, t2 = st.columns(2)
            
            with t1:
                # Price over time
                fig_price = go.Figure()
                fig_price.add_trace(go.Scatter(
                    x=trades_df["time"],
                    y=trades_df["price"],
                    mode="lines+markers",
                    line=dict(color="#6366f1", width=2),
                    marker=dict(size=3),
                    name="Trade Price",
                ))
                fig_price.update_layout(
                    title="Trade Prices Over Time",
                    paper_bgcolor="#0f172a",
                    plot_bgcolor="#1e293b",
                    font_color="#e2e8f0",
                    height=300,
                    xaxis=dict(gridcolor="#334155"),
                    yaxis=dict(gridcolor="#334155"),
                )
                st.plotly_chart(fig_price, use_container_width=True)
            
            with t2:
                # Volume distribution
                fig_vol = go.Figure()
                fig_vol.add_trace(go.Histogram(
                    x=trades_df["quantity"],
                    nbinsx=20,
                    marker_color="#8b5cf6",
                    name="Trade Size",
                ))
                fig_vol.update_layout(
                    title="Trade Size Distribution",
                    paper_bgcolor="#0f172a",
                    plot_bgcolor="#1e293b",
                    font_color="#e2e8f0",
                    height=300,
                    xaxis=dict(gridcolor="#334155", title="Quantity"),
                    yaxis=dict(gridcolor="#334155", title="Count"),
                )
                st.plotly_chart(fig_vol, use_container_width=True)

            # Stats summary
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Avg Trade Price", f"${trades_df['price'].mean():.2f}")
            with col2:
                st.metric("Avg Trade Size", f"{trades_df['quantity'].mean():.3f}")
            with col3:
                st.metric("Price Std Dev", f"${trades_df['price'].std():.4f}")
            with col4:
                st.metric("Trade Count", len(trades_df))
    else:
        st.info("No trade data available yet. Wait for the market to generate trades.")

    # Auto-refresh
    if auto_refresh:
        time.sleep(refresh_rate)
        st.rerun()


if __name__ == "__main__":
    main()
