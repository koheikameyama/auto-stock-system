"""
金ETF（1326.T）のバックフィル

yfinance で1326.T（NEXT FUNDS 金価格連動型上場投信）の10年分OHLCVを取得し、
StockDailyBar に market='JP' で INSERT する。
Stock テーブルにも 1326.T を登録する（金ETF検証用）。

Usage:
  python scripts/backfill-gold-etf.py [--yes] [--ticker 1326.T] [--period 10y]
"""

import argparse
import math
import os
import sys
import uuid

import yfinance as yf
import psycopg2
import psycopg2.extras


def load_database_url() -> str:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DATABASE_URL="):
                        db_url = line.split("=", 1)[1].strip('"').strip("'")
                        break
    if not db_url:
        print("ERROR: DATABASE_URL が見つかりません")
        sys.exit(1)
    return db_url


GOLD_ETFS = [
    {"ticker": "1326.T", "name": "SPDR ゴールド・シェア", "sector": "ETF"},
    {"ticker": "1540.T", "name": "純金上場信託", "sector": "ETF"},
]


def fetch_ohlcv(ticker: str, period: str) -> list[tuple]:
    """yfinanceでOHLCVデータを取得"""
    try:
        data = yf.download(
            ticker,
            period=period,
            interval="1d",
            auto_adjust=True,
            progress=False,
        )
    except Exception as e:
        print(f"  yfinance error ({ticker}): {e}")
        return []

    if data.empty:
        print(f"  データなし: {ticker}")
        return []

    import pandas as pd
    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    bars = []
    for idx, row in data.iterrows():
        dt = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx
        if hasattr(dt, "date"):
            dt = dt.date()
        try:
            o = float(row["Open"])
            h = float(row["High"])
            lo = float(row["Low"])
            c = float(row["Close"])
            v_raw = row.get("Volume")
            vol = int(float(v_raw)) if v_raw is not None else 0
        except (TypeError, ValueError):
            continue
        if any(math.isnan(x) for x in [o, h, lo, c]):
            continue
        bars.append((str(uuid.uuid4()), ticker, dt, o, h, lo, c, vol, "JP"))

    return bars


def upsert_stock(conn, ticker: str, name: str, sector: str):
    """Stock テーブルに登録（既存なら何もしない）"""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO "Stock" (id, "tickerCode", name, market, sector, "isActive", "isDelisted", "isRestricted", "createdAt")
            VALUES (%s, %s, %s, %s, %s, true, false, false, NOW())
            ON CONFLICT ("tickerCode") DO NOTHING
            """,
            (str(uuid.uuid4()), ticker, name, "JP", sector),
        )
    conn.commit()


def insert_bars(conn, bars: list[tuple]) -> int:
    if not bars:
        return 0
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO "StockDailyBar" (id, "tickerCode", date, open, high, low, close, volume, market)
            VALUES %s
            ON CONFLICT ("tickerCode", date) DO NOTHING
            """,
            bars,
        )
        inserted = cur.rowcount
    conn.commit()
    return inserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="本番DB確認スキップ")
    parser.add_argument("--ticker", type=str, default=None, help="単一ティッカー指定")
    parser.add_argument("--period", type=str, default="10y", help="期間（10y, 5y, 2y等）")
    args = parser.parse_args()

    db_url = load_database_url()
    is_prod = "localhost" not in db_url and "127.0.0.1" not in db_url

    if is_prod and not args.yes:
        print(f"本番DB に接続します: {db_url[:50]}...")
        print("続行しますか？ (y/N): ", end="")
        if input().strip().lower() != "y":
            print("中止しました")
            sys.exit(0)

    targets = GOLD_ETFS
    if args.ticker:
        targets = [t for t in GOLD_ETFS if t["ticker"] == args.ticker]
        if not targets:
            targets = [{"ticker": args.ticker, "name": args.ticker, "sector": "ETF"}]

    print("=" * 60)
    print(f"金ETF バックフィル（period={args.period}）")
    print("=" * 60)

    conn = psycopg2.connect(db_url, connect_timeout=30)

    for target in targets:
        ticker = target["ticker"]
        print(f"\n{target['name']} ({ticker}) を取得中...")

        upsert_stock(conn, ticker, target["name"], target["sector"])
        print(f"  Stock 登録済み（既存なら skip）")

        bars = fetch_ohlcv(ticker, args.period)
        if not bars:
            continue

        print(f"  取得: {len(bars)}日分")
        inserted = insert_bars(conn, bars)
        print(f"  新規INSERT: {inserted}件")

        with conn.cursor() as cur:
            cur.execute(
                'SELECT MIN(date), MAX(date), COUNT(*) FROM "StockDailyBar" WHERE "tickerCode" = %s',
                (ticker,),
            )
            min_d, max_d, cnt = cur.fetchone()
        print(f"  DB: {min_d} 〜 {max_d} ({cnt}件)")

    conn.close()
    print("\n完了")


if __name__ == "__main__":
    main()
