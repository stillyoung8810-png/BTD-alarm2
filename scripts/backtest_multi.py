"""
다분할 매매법 백테스트 (Supabase stock_prices 기반)

- 앱 다분할 로직과 동일: T = 총 투자비용/1회매수금, 전반전(0.5≤T<a/2)/후반전(a/2≤T<a-1)/쿼터(T>a-1)
- 지정가 매도 또는 MOC(쿼터)로 포지션 청산 시 T=0 → 당시 총 현금을 a로 나눠 새 1회 매수금 설정 → 다음 영업일부터 재시작
- 로컬: python scripts/backtest_multi.py (기본 파라미터 또는 .env)
- Lambda: handler(event, context) 로 event에 params + supabase_url/key 전달
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import pandas as pd
except ImportError:
    pd = None  # type: ignore

try:
    from supabase import create_client
except ImportError:
    create_client = None  # type: ignore

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

# --- 파라미터 (프론트 BacktestParamsMultiSplit와 동일) ---
DEFAULT_PARAMS: Dict[str, Any] = {
    "stock": "TQQQ",
    "targetReturnRate": 10,
    "totalSplitCount": 40,
    "oneTimeAmount": 1000,
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
    if not symbols:
        return []
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
    if df is None or df.empty:
        return pd.DataFrame(columns=["symbol", "trade_date", "close"])
    df = df.dropna(subset=["close"])
    df = df[df["close"] > 0]
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.strftime("%Y-%m-%d")
    return df.sort_values(["symbol", "trade_date"]).reset_index(drop=True)


def run_backtest(params: Dict[str, Any], df_raw: pd.DataFrame) -> Dict[str, Any]:
    """다분할 매매법 일별 시뮬레이션 → BacktestResult 형태 dict."""
    if pd is None:
        return _empty_result("pandas not available")
    df = df_clean(df_raw)
    if df.empty:
        return _empty_result("no price data")

    sym = params["stock"]
    a = int(params["totalSplitCount"])
    A = float(params["targetReturnRate"])
    one_time_init = float(params["oneTimeAmount"])
    fee_pct = float(params["feeRate"]) / 100.0

    stock_df = df[df["symbol"] == sym].sort_values("trade_date").reset_index(drop=True)
    if stock_df.empty:
        return _empty_result("insufficient stock data")

    trade_dates = stock_df["trade_date"].astype(str).tolist()
    closes = stock_df.set_index("trade_date")["close"]

    # 시뮬레이션 시작 시: 1회 매수금이 1주 가격보다 적으면 매수 불가 → 중단
    first_close = float(closes.iloc[0]) if len(closes) > 0 else 0.0
    if first_close > 0 and one_time_init < first_close:
        return _empty_result(
            "1회 매수 금액이 주식 1주 가격보다 적습니다. 자산 설정이나 분할 횟수를 조절하여 다시 진행하세요."
        )

    # 초기: a회분 현금 보유, 1회 매수금 = oneTimeAmount
    cash = a * one_time_init
    position_qty = 0.0
    position_cost = 0.0
    one_time_amount = one_time_init

    equity_curve: List[Dict[str, Any]] = []
    trades: List[Dict[str, Any]] = []
    total_invested_overall = 0.0

    for i, dt_str in enumerate(trade_dates):
        close = float(closes.iloc[i]) if i < len(closes) else 0.0
        if close <= 0:
            if position_qty > 0 or cash > 0:
                equity = cash + (position_qty * close) if position_qty else cash
                equity_curve.append({"date": dt_str, "value": round(equity, 2)})
            continue

        # T = 현재 포지션 비용 / 1회 매수금 (소수 둘째자리 올림)
        T = (position_cost / one_time_amount * 100) / 100.0 if one_time_amount > 0 else 0.0

        # 포지션 청산 직후: 새 1회 매수금 = 총 현금 / a (다음 영업일부터 사용)
        if position_qty <= 0 and cash > 0 and one_time_amount != (cash / a):
            one_time_amount = cash / a

        # --- T < 0.5: 1회차 매수 (MOC 1회분) ---
        if T < 0.5 and cash >= one_time_amount:
            if one_time_amount < close:
                return _empty_result(
                    "1회 매수 금액이 주식 1주 가격보다 적습니다. 자산 설정이나 분할 횟수를 조절하여 다시 진행하세요."
                )
            cost_with_fee = close * (1 + fee_pct)
            qty = one_time_amount / cost_with_fee
            fee = one_time_amount - qty * close
            cash -= one_time_amount
            position_qty += qty
            position_cost += qty * close
            total_invested_overall += one_time_amount
            trades.append({"date": dt_str, "type": "buy", "symbol": sym, "qty": qty, "price": close, "fee": fee})
            equity = cash + position_qty * close
            equity_curve.append({"date": dt_str, "value": round(equity, 2)})
            continue

        # --- 0.5 <= T < a/2: 전반전 (LOC 25% / 지정가 75%, LOC매수 0.5+0.5) ---
        if 0.5 <= T < a / 2 and position_qty > 0:
            base = position_cost / position_qty
            loc_factor = 1 + A * (1 - (2 * T) / a) / 100
            loc_sell_price = base * loc_factor
            limit_sell_price = base * (1 + A / 100)
            loc_buy_price = max(0.01, loc_sell_price - 0.01)

            # 매도 우선: 지정가 75%, LOC 25%
            sell_75_qty = int(position_qty * 0.75)
            sell_25_qty = position_qty - sell_75_qty
            if sell_75_qty > 0 and close >= limit_sell_price:
                cost_sold = position_cost * (sell_75_qty / position_qty)
                proceeds = sell_75_qty * limit_sell_price * (1 - fee_pct)
                fee_s = sell_75_qty * limit_sell_price * fee_pct
                cash += proceeds
                position_qty -= sell_75_qty
                position_cost -= cost_sold
                trades.append({"date": dt_str, "type": "sell", "symbol": sym, "qty": sell_75_qty, "price": limit_sell_price, "fee": fee_s})
            if sell_25_qty > 0 and close <= loc_sell_price:
                cost_sold = position_cost * (sell_25_qty / position_qty)
                proceeds = sell_25_qty * loc_sell_price * (1 - fee_pct)
                fee_s = sell_25_qty * loc_sell_price * fee_pct
                cash += proceeds
                position_qty -= sell_25_qty
                position_cost -= cost_sold
                trades.append({"date": dt_str, "type": "sell", "symbol": sym, "qty": sell_25_qty, "price": loc_sell_price, "fee": fee_s})

            # 청산 시점: T=0 → 새 1회 매수금 = 총 현금 / a
            if position_qty <= 0:
                one_time_amount = cash / a
                equity_curve.append({"date": dt_str, "value": round(cash, 2)})
                continue

            # 전반전 매수: LOC매수1(평단가) 0.5회분, LOC매수2(LOC-0.01) 0.5회분
            if one_time_amount < close:
                return _empty_result(
                    "1회 매수 금액이 주식 1주 가격보다 적습니다. 자산 설정이나 분할 횟수를 조절하여 다시 진행하세요."
                )
            half = one_time_amount * 0.5
            if cash >= half and close <= base:
                qty = half / (close * (1 + fee_pct))
                cash -= half
                position_qty += qty
                position_cost += qty * close
                total_invested_overall += half
                trades.append({"date": dt_str, "type": "buy", "symbol": sym, "qty": qty, "price": close, "fee": half - qty * close})
            if cash >= half and close <= loc_buy_price:
                qty = half / (close * (1 + fee_pct))
                cash -= half
                position_qty += qty
                position_cost += qty * close
                total_invested_overall += half
                trades.append({"date": dt_str, "type": "buy", "symbol": sym, "qty": qty, "price": close, "fee": half - qty * close})

            equity = cash + position_qty * close
            equity_curve.append({"date": dt_str, "value": round(equity, 2)})
            continue

        # --- a/2 <= T < a-1: 후반전 (LOC 25% / 지정가 75%, LOC매수 1회분) ---
        if a / 2 <= T < a - 1 and position_qty > 0:
            base = position_cost / position_qty
            loc_factor = 1 + A * (1 - (2 * T) / a) / 100
            loc_sell_price = base * loc_factor
            limit_sell_price = base * (1 + A / 100)
            loc_buy_price = max(0.01, loc_sell_price - 0.01)

            sell_75_qty = int(position_qty * 0.75)
            sell_25_qty = position_qty - sell_75_qty
            if sell_75_qty > 0 and close >= limit_sell_price:
                cost_sold = position_cost * (sell_75_qty / position_qty)
                cash += sell_75_qty * limit_sell_price * (1 - fee_pct)
                position_qty -= sell_75_qty
                position_cost -= cost_sold
                trades.append({"date": dt_str, "type": "sell", "symbol": sym, "qty": sell_75_qty, "price": limit_sell_price, "fee": sell_75_qty * limit_sell_price * fee_pct})
            if sell_25_qty > 0 and close <= loc_sell_price:
                cost_sold = position_cost * (sell_25_qty / position_qty)
                cash += sell_25_qty * loc_sell_price * (1 - fee_pct)
                position_qty -= sell_25_qty
                position_cost -= cost_sold
                trades.append({"date": dt_str, "type": "sell", "symbol": sym, "qty": sell_25_qty, "price": loc_sell_price, "fee": sell_25_qty * loc_sell_price * fee_pct})

            if position_qty <= 0:
                one_time_amount = cash / a
                equity_curve.append({"date": dt_str, "value": round(cash, 2)})
                continue

            if one_time_amount < close:
                return _empty_result(
                    "1회 매수 금액이 주식 1주 가격보다 적습니다. 자산 설정이나 분할 횟수를 조절하여 다시 진행하세요."
                )
            if cash >= one_time_amount and close <= loc_buy_price:
                qty = one_time_amount / (close * (1 + fee_pct))
                cash -= one_time_amount
                position_qty += qty
                position_cost += qty * close
                total_invested_overall += one_time_amount
                trades.append({"date": dt_str, "type": "buy", "symbol": sym, "qty": qty, "price": close, "fee": one_time_amount - qty * close})

            equity = cash + position_qty * close
            equity_curve.append({"date": dt_str, "value": round(equity, 2)})
            continue

        # --- T > a-1 && T <= a: 쿼터 (MOC 전량 매도) ---
        if T > a - 1 and T <= a and position_qty > 0:
            proceeds = position_qty * close * (1 - fee_pct)
            fee_s = position_qty * close * fee_pct
            cash += proceeds
            trades.append({"date": dt_str, "type": "sell", "symbol": sym, "qty": position_qty, "price": close, "fee": fee_s, "isMOC": True})
            position_qty = 0.0
            position_cost = 0.0
            one_time_amount = cash / a
            equity_curve.append({"date": dt_str, "value": round(cash, 2)})
            continue

        # 그 외: 평가액만 기록
        equity = cash + position_qty * close
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
    initial_capital = a * one_time_init
    total_return_pct = ((total_final - initial_capital) / initial_capital * 100) if initial_capital > 0 else 0.0
    months_actual = len(trade_dates) / 21.0 if trade_dates else 0
    years = months_actual / 12.0
    cagr = (pow(total_final / initial_capital, 1 / years) - 1) * 100 if initial_capital > 0 and years > 0 else 0.0
    mdd = min((e["drawdown"] for e in drawdown_series), default=0.0)
    sells = [t for t in trades if t["type"] == "sell"]
    wins = sum(1 for t in sells if t["price"] * t["qty"] - t.get("fee", 0) > 0)
    win_rate = (wins / len(sells) * 100) if sells else 0.0
    returns = []
    for j in range(1, len(eq_values)):
        if eq_values[j - 1] > 0:
            returns.append((eq_values[j] - eq_values[j - 1]) / eq_values[j - 1])
    avg_ret = (sum(returns) / len(returns)) if returns else 0.0
    std_ret = (sum((r - avg_ret) ** 2 for r in returns) / len(returns)) ** 0.5 if len(returns) > 1 else 0.0
    sharpe = (avg_ret / std_ret * (252 ** 0.5)) if std_ret > 0 else 0.0

    return {
        "totalReturnPct": round(total_return_pct, 2),
        "cagrPct": round(cagr, 2),
        "mddPct": round(mdd, 2),
        "winRatePct": round(win_rate, 2),
        "sharpeRatio": round(sharpe, 2),
        "avgHoldingDays": 14.0,
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
    p = {**DEFAULT_PARAMS, **(params or {})}
    months = int(p["months"])
    end = datetime.utcnow().date()
    start = end - timedelta(days=months * 31)
    start_str = start.isoformat()
    end_str = end.isoformat()
    symbols = [p["stock"]]

    client = get_supabase_client()
    raw = fetch_stock_prices(client, symbols, start_str, end_str)
    if not raw:
        return _empty_result("no data from Supabase")
    df = pd.DataFrame(raw)
    return run_backtest(p, df)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda 진입점."""
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
