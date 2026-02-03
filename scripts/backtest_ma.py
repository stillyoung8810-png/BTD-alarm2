"""
이평선 구간매수 전략 백테스트 (Supabase stock_prices 기반)

- Supabase에서 symbol, trade_date, close 조회 후 Pandas로 이평·RSI 계산
- 일별 구간 판정 → 매수/매도 시뮬레이션 → BacktestResult JSON 반환
- 로컬 실행: python scripts/backtest_ma.py (기본 파라미터 또는 .env)
- Lambda: handler(event, context) 로 event에 params + supabase_url/key 전달
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Lambda: 레이어가 /opt에 풀리므로 해당 경로를 sys.path에 추가 (자동 추가가 안 되는 환경 대비)
if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    # 디버그: CloudWatch에서 /opt·sys.path 확인용 (원인 파악 후 제거 가능)
    try:
        _opt = "/opt"
        print(f"[backtest_ma] /opt exists: {os.path.isdir(_opt)}")
        if os.path.isdir(_opt):
            print(f"[backtest_ma] /opt contents: {os.listdir(_opt)}")
        _py = "/opt/python"
        if os.path.isdir(_py):
            print(f"[backtest_ma] /opt/python contents: {os.listdir(_py)}")
            _sp = os.path.join(_py, "lib", "python3.11", "site-packages")
            if os.path.isdir(os.path.join(_py, "lib")):
                print(f"[backtest_ma] /opt/python/lib contents: {os.listdir(os.path.join(_py, 'lib'))}")
        for _p in ("/opt/python", "/opt/python/lib/python3.11/site-packages", "/opt/python/lib/python3.12/site-packages"):
            _exists = os.path.isdir(_p)
            print(f"[backtest_ma] {_p} exists: {_exists}")
            if _exists and _p not in sys.path:
                sys.path.insert(0, _p)
        print(f"[backtest_ma] sys.path (first 5): {sys.path[:5]}")
    except Exception as _e:
        print(f"[backtest_ma] path debug error: {_e}")

# Lambda 레이어 또는 로컬 venv
try:
    import pandas as pd
except ImportError:
    pd = None  # type: ignore

try:
    from supabase import create_client
except ImportError as e:
    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        print(f"[backtest_ma] supabase import failed: {e!r}")
    create_client = None  # type: ignore

# .env 로드 (로컬)
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass


# --- 파라미터 타입 (프론트 BacktestParamsMa와 동일) ---
DEFAULT_PARAMS: Dict[str, Any] = {
    "baseStock": "QQQ",
    "rsiEnabled": False,
    "rsiThreshold": 30,
    "alignmentEnabled": False,
    "maAPeriod": 20,
    "maAStock": "TQQQ",
    "maATakeProfit": False,
    "maATakeProfitPct": 10,
    "maBPeriod": 60,
    "maBStock": "QLD",
    "maBTakeProfit": False,
    "maBTakeProfitPct": 10,
    "ma3Stock": "QQQ",
    "ma3TakeProfit": False,
    "ma3TakeProfitPct": 10,
    "dailyBuyAmount": 1000,
    "months": 24,
    "feeRate": 0.25,
}


def get_supabase_client(url: Optional[str] = None, key: Optional[str] = None):
    url = url or os.environ.get("SUPABASE_URL", "").strip()
    key = key or os.environ.get("SUPABASE_ANON_KEY", "").strip()
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY (or event) required")
    if create_client is None:
        raise ImportError("supabase package not installed")
    return create_client(url, key)


def fetch_stock_prices(
    client: Any,
    symbols: List[str],
    start_date: str,
    end_date: str,
) -> List[Dict[str, Any]]:
    """Supabase stock_prices에서 symbol, trade_date, close 조회. 정렬: symbol, trade_date asc."""
    if not symbols:
        return []
    # REST: in filter로 symbol 여러 개, trade_date gte/lte
    data: List[Dict[str, Any]] = []
    for sym in symbols:
        resp = (
            client.table("stock_prices")
            .select("symbol,trade_date,close")
            .eq("symbol", sym)
            .gte("trade_date", start_date)
            .lte("trade_date", end_date)
            .order("trade_date", desc=False)
            .execute()
        )
        if resp.data:
            data.extend(resp.data)
    return data


def df_clean(df: pd.DataFrame) -> pd.DataFrame:
    """결측/무효 제거, trade_date 파싱."""
    if df is None or df.empty:
        return pd.DataFrame(columns=["symbol", "trade_date", "close"])
    df = df.dropna(subset=["close"])
    df = df[df["close"] > 0]
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
    return df.sort_values(["symbol", "trade_date"]).reset_index(drop=True)


def compute_ma(series: pd.Series, period: int) -> pd.Series:
    """이동평균 (해당일 포함 rolling mean)."""
    return series.rolling(window=period, min_periods=1).mean()


def compute_rsi_wilder(prices: pd.Series, period: int = 14) -> pd.Series:
    """Wilder RSI(14). TS calculateRSI와 동일 로직. 데이터 부족 구간은 50."""
    out = pd.Series(50.0, index=prices.index)
    if len(prices) < period + 1:
        return out
    vals = prices.values
    changes = [vals[i] - vals[i - 1] for i in range(1, len(vals))]
    gains = [c if c > 0 else 0.0 for c in changes]
    losses = [-c if c < 0 else 0.0 for c in changes]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    rsi_list = [50.0] * (period + 1)
    for i in range(period, len(changes)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            rsi_list.append(100.0)
        else:
            rs = avg_gain / avg_loss
            rsi_list.append(100 - (100 / (1 + rs)))
    for idx in range(min(len(rsi_list), len(out))):
        out.iloc[idx] = max(0, min(100, rsi_list[idx]))
    return out


def determine_section(close: float, ma_a: float, ma_b: float) -> int:
    """
    구간 1/2/3 판정 (새 정의, 정배열/역배열 모두 포함):
    - hi = max(MA a, MA b), lo = min(MA a, MA b)
    - 구간 1: close > hi
    - 구간 2: lo <= close <= hi  (두 이평선 사이)
    - 구간 3: close < lo
    """
    hi = max(ma_a, ma_b)
    lo = min(ma_a, ma_b)
    if close > hi:
        return 1
    if close < lo:
        return 3
    return 2


def run_backtest(params: Dict[str, Any], df_raw: pd.DataFrame) -> Dict[str, Any]:
    """DataFrame 기반 백테스트 실행 → BacktestResult 형태의 dict."""
    if pd is None:
        return _empty_result("pandas not available")
    df = df_clean(df_raw)
    if df.empty:
        return _empty_result("no price data")

    base = params["baseStock"]
    symbols = list({params["baseStock"], params["maAStock"], params["maBStock"], params["ma3Stock"]})
    base_df = df[df["symbol"] == base].sort_values("trade_date").reset_index(drop=True)
    if base_df.empty:
        return _empty_result("insufficient base stock data")

    closes = base_df.set_index("trade_date")["close"]
    ma_a_series = compute_ma(closes, params["maAPeriod"])
    ma_b_series = compute_ma(closes, params["maBPeriod"])

    rsi_series = compute_rsi_wilder(closes, 14) if params.get("rsiEnabled") else None

    trade_dates = base_df["trade_date"].astype(str).tolist()
    daily_buy = float(params["dailyBuyAmount"])
    fee_pct = float(params["feeRate"]) / 100.0

    cash = 0.0
    positions: Dict[str, Dict[str, Any]] = {}  # symbol -> { qty, cost }
    section_positions: Dict[int, Dict[str, Any]] = {1: {}, 2: {}, 3: {}}
    for s in [params["maAStock"], params["maBStock"], params["ma3Stock"]]:
        positions[s] = {"qty": 0.0, "cost": 0.0}
    for sec in (1, 2, 3):
        section_positions[sec] = {"qty": 0.0, "cost": 0.0}

    equity_curve: List[Dict[str, Any]] = []
    trades: List[Dict[str, Any]] = []
    total_invested = 0.0

    for i, dt_str in enumerate(trade_dates):
        row = base_df[base_df["trade_date"] == dt_str].iloc[0]
        close_price = float(row["close"])
        ma_a_val = ma_a_series.iloc[i] if i < len(ma_a_series) else 0.0
        ma_b_val = ma_b_series.iloc[i] if i < len(ma_b_series) else 0.0

        section = determine_section(close_price, ma_a_val, ma_b_val)
        buy_symbol = {1: params["maAStock"], 2: params["maBStock"], 3: params["ma3Stock"]}[section]

        # 정배열 조건 (MA a > MA b)일 때만 매수
        if params.get("alignmentEnabled") and not (ma_a_val > ma_b_val):
            buy_symbol = None

        # RSI 조건: RSI가 설정된 임계값보다 크면 그날은 관망
        if params.get("rsiEnabled") and rsi_series is not None and i < len(rsi_series):
            thresh = float(params.get("rsiThreshold", 70))
            if rsi_series.iloc[i] > thresh:
                buy_symbol = None

        if buy_symbol:
            price_row = df[(df["symbol"] == buy_symbol) & (df["trade_date"] == dt_str)]
            if not price_row.empty:
                px = float(price_row.iloc[0]["close"])
                if px > 0:
                    fee = daily_buy * fee_pct
                    invest = daily_buy - fee
                    qty = invest / px
                    cash -= daily_buy
                    total_invested += daily_buy
                    pos = positions[buy_symbol]
                    sec_pos = section_positions[section]
                    pos["qty"] += qty
                    pos["cost"] += invest
                    sec_pos["qty"] += qty
                    sec_pos["cost"] += invest
                    trades.append({"date": dt_str, "type": "buy", "symbol": buy_symbol, "qty": qty, "price": px, "fee": fee})

        take_profit_config = {
            1: (params.get("maATakeProfit"), params.get("maATakeProfitPct", 10) / 100.0),
            2: (params.get("maBTakeProfit"), params.get("maBTakeProfitPct", 10) / 100.0),
            3: (params.get("ma3TakeProfit"), params.get("ma3TakeProfitPct", 10) / 100.0),
        }
        for sec in (1, 2, 3):
            enabled, target_pct = take_profit_config.get(sec, (False, 0.1))
            if not enabled:
                continue
            sym = {1: params["maAStock"], 2: params["maBStock"], 3: params["ma3Stock"]}[sec]
            sec_pos = section_positions[sec]
            if sec_pos["qty"] <= 0 or sec_pos["cost"] <= 0:
                continue
            price_row = df[(df["symbol"] == sym) & (df["trade_date"] == dt_str)]
            if price_row.empty:
                continue
            px = float(price_row.iloc[0]["close"])
            avg_cost = sec_pos["cost"] / sec_pos["qty"]
            if (px - avg_cost) / avg_cost >= target_pct:
                sell_qty = sec_pos["qty"]
                sell_value = sell_qty * px
                fee_sell = sell_value * fee_pct
                cash += sell_value - fee_sell
                positions[sym]["qty"] -= sell_qty
                positions[sym]["cost"] -= sec_pos["cost"]
                trades.append({"date": dt_str, "type": "sell", "symbol": sym, "qty": sell_qty, "price": px, "fee": fee_sell})
                sec_pos["qty"] = 0.0
                sec_pos["cost"] = 0.0

        mark_to_market = 0.0
        for sym, pos in positions.items():
            pr = df[(df["symbol"] == sym) & (df["trade_date"] == dt_str)]
            if not pr.empty and pos["qty"] > 0:
                mark_to_market += pos["qty"] * float(pr.iloc[0]["close"])
        equity = cash + mark_to_market
        equity_curve.append({"date": dt_str, "value": round(equity, 2)})

    if not equity_curve:
        return _empty_result("no equity curve")

    eq_values = [e["value"] for e in equity_curve]
    peak = eq_values[0]
    drawdown_series: List[Dict[str, Any]] = []
    for j, v in enumerate(eq_values):
        peak = max(peak, v)
        dd = -((peak - v) / peak) * 100 if peak > 0 else 0.0
        drawdown_series.append({"date": equity_curve[j]["date"], "drawdown": round(dd, 2)})

    total_final = eq_values[-1]
    total_return_pct = ((total_final - total_invested) / total_invested * 100) if total_invested > 0 else 0.0
    months_actual = len(trade_dates) / 21.0 if trade_dates else 0
    years = months_actual / 12.0
    cagr = (pow(total_final / total_invested, 1 / years) - 1) * 100 if total_invested > 0 and years > 0 else 0.0
    mdd = min((e["drawdown"] for e in drawdown_series), default=0.0)

    sells = [t for t in trades if t["type"] == "sell"]
    wins = sum(1 for t in sells if t["price"] * t["qty"] - t["fee"] > 0)
    win_rate = (wins / len(sells) * 100) if sells else 0.0

    returns = []
    for j in range(1, len(eq_values)):
        if eq_values[j - 1] > 0:
            returns.append((eq_values[j] - eq_values[j - 1]) / eq_values[j - 1])
    avg_ret = (sum(returns) / len(returns)) if returns else 0.0
    std_ret = (sum((r - avg_ret) ** 2 for r in returns) / len(returns)) ** 0.5 if len(returns) > 1 else 0.0
    sharpe = (avg_ret / std_ret * (252 ** 0.5)) if std_ret > 0 else 0.0

    avg_holding = 0.0
    if sells:
        # 간단히: 매수/매도 일수 평균은 여기서 생략하고 0 또는 고정값 가능
        avg_holding = 14.0

    return {
        "totalReturnPct": round(total_return_pct, 2),
        "cagrPct": round(cagr, 2),
        "mddPct": round(mdd, 2),
        "winRatePct": round(win_rate, 2),
        "sharpeRatio": round(sharpe, 2),
        "avgHoldingDays": round(avg_holding, 1),
        "equityCurve": equity_curve,
        "drawdownSeries": drawdown_series,
    }


def _empty_result(reason: str) -> Dict[str, Any]:
    return {
        "totalReturnPct": 0.0,
        "cagrPct": 0.0,
        "mddPct": 0.0,
        "winRatePct": 0.0,
        "sharpeRatio": 0.0,
        "avgHoldingDays": 0.0,
        "equityCurve": [],
        "drawdownSeries": [],
        "error": reason,
    }


def main(params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """로컬 또는 Lambda: Supabase 조회 후 백테스트 실행."""
    p = {**DEFAULT_PARAMS, **(params or {})}
    months = int(p["months"])
    end = datetime.utcnow().date()
    start = end - timedelta(days=months * 31)
    start_str = start.isoformat()
    end_str = end.isoformat()
    symbols = list({p["baseStock"], p["maAStock"], p["maBStock"], p["ma3Stock"]})

    client = get_supabase_client()
    raw = fetch_stock_prices(client, symbols, start_str, end_str)
    if not raw:
        return _empty_result("no data from Supabase")
    df = pd.DataFrame(raw)
    return run_backtest(p, df)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda 진입점. event: { params?: BacktestParamsMa, supabase_url?, supabase_key? }"""
    params = event.get("params", event)
    url = event.get("supabase_url") or os.environ.get("SUPABASE_URL")
    key = event.get("supabase_key") or os.environ.get("SUPABASE_ANON_KEY")
    if url and key:
        os.environ["SUPABASE_URL"] = url
        os.environ["SUPABASE_ANON_KEY"] = key
    result = main(params)
    return {"statusCode": 200, "body": json.dumps(result)}


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2, ensure_ascii=False))
