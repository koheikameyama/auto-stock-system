#!/usr/bin/env python3
"""
推奨銘柄のパフォーマンス分析スクリプト（試験用）

過去7日間の推奨銘柄が実際にどうなったか分析する。
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from pathlib import Path

import psycopg2
import yfinance as yf

# .envファイルから環境変数を読み込む
env_path = Path(__file__).resolve().parents[2] / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL not set")
        sys.exit(1)
    return url


def get_recommendations(conn, days_ago: int = 7) -> list[dict]:
    """過去N日間の推奨を取得"""
    target_date = datetime.now(timezone.utc) - timedelta(days=days_ago)

    with conn.cursor() as cur:
        cur.execute('''
            SELECT
                r.id,
                r.date,
                r."stockId",
                r.position,
                s."tickerCode",
                s.name,
                s.sector
            FROM "DailyHighlight" r
            JOIN "Stock" s ON r."stockId" = s.id
            WHERE r.date >= %s
            ORDER BY r.date DESC, r.position
        ''', (target_date,))

        rows = cur.fetchall()
        return [
            {
                "id": row[0],
                "date": row[1],
                "stockId": row[2],
                "position": row[3],
                "tickerCode": row[4],
                "name": row[5],
                "sector": row[6],
            }
            for row in rows
        ]


def fetch_historical_prices(ticker_codes: list[str], start_date: datetime, end_date: datetime) -> dict:
    """yfinanceで期間中の株価を取得"""
    if not ticker_codes:
        return {}

    symbols = [f"{t}.T" if not t.endswith(".T") else t for t in ticker_codes]

    try:
        # 少し余裕を持って取得
        start = start_date - timedelta(days=3)
        end = end_date + timedelta(days=1)

        df = yf.download(symbols, start=start, end=end, progress=False)

        if df.empty:
            return {}

        result = {}
        for ticker in ticker_codes:
            symbol = f"{ticker}.T" if not ticker.endswith(".T") else ticker
            try:
                if len(symbols) == 1:
                    close_data = df["Close"]
                else:
                    close_data = df["Close"][symbol]

                # 日付ごとの終値を辞書に
                prices = {}
                for date_idx, price in close_data.items():
                    if not pd.isna(price):
                        date_str = date_idx.strftime("%Y-%m-%d")
                        prices[date_str] = float(price)

                result[ticker] = prices
            except (KeyError, AttributeError):
                continue

        return result
    except Exception as e:
        print(f"Error fetching prices: {e}")
        return {}


def analyze_performance(recommendations: list[dict], prices: dict) -> list[dict]:
    """パフォーマンスを計算"""
    results = []
    today = datetime.now(timezone.utc).date()

    for rec in recommendations:
        ticker = rec["tickerCode"]
        rec_date = rec["date"]

        if isinstance(rec_date, datetime):
            rec_date = rec_date.date()

        price_data = prices.get(ticker, {})

        # 推奨日の株価
        rec_date_str = rec_date.strftime("%Y-%m-%d")
        price_at_rec = price_data.get(rec_date_str)

        # 今日（または最新）の株価
        today_str = today.strftime("%Y-%m-%d")
        current_price = price_data.get(today_str)

        # 最新の株価を探す
        if not current_price and price_data:
            sorted_dates = sorted(price_data.keys(), reverse=True)
            for d in sorted_dates:
                if d > rec_date_str:
                    current_price = price_data[d]
                    break

        # パフォーマンス計算
        performance = None
        days_held = (today - rec_date).days

        if price_at_rec and current_price:
            performance = ((current_price - price_at_rec) / price_at_rec) * 100

        results.append({
            **rec,
            "priceAtRec": price_at_rec,
            "currentPrice": current_price,
            "performance": round(performance, 2) if performance is not None else None,
            "daysHeld": days_held,
        })

    return results


def print_report(results: list[dict]):
    """レポートを出力"""
    print("\n" + "=" * 70)
    print("推奨銘柄パフォーマンス分析レポート")
    print("=" * 70)

    # 有効なデータのみ
    valid = [r for r in results if r["performance"] is not None]

    if not valid:
        print("分析可能なデータがありません")
        return

    # 日付ごとに集計
    by_date = defaultdict(list)
    for r in valid:
        date_str = r["date"].strftime("%Y-%m-%d") if isinstance(r["date"], datetime) else str(r["date"])
        by_date[date_str].append(r)

    print(f"\n分析期間: {min(by_date.keys())} 〜 {max(by_date.keys())}")
    print(f"有効データ数: {len(valid)} 件")

    # 全体統計
    performances = [r["performance"] for r in valid]
    avg_perf = sum(performances) / len(performances)
    positive = sum(1 for p in performances if p > 0)
    success = sum(1 for p in performances if p >= 3)

    print(f"\n【全体統計】")
    print(f"  平均リターン: {avg_perf:+.2f}%")
    print(f"  プラス率: {positive}/{len(valid)} ({positive/len(valid)*100:.1f}%)")
    print(f"  成功率(+3%以上): {success}/{len(valid)} ({success/len(valid)*100:.1f}%)")

    # ベスト/ワースト
    sorted_by_perf = sorted(valid, key=lambda x: x["performance"], reverse=True)

    print(f"\n【ベストパフォーマー】")
    for r in sorted_by_perf[:5]:
        print(f"  {r['name']} ({r['tickerCode']}): {r['performance']:+.2f}% ({r['daysHeld']}日)")

    print(f"\n【ワーストパフォーマー】")
    for r in sorted_by_perf[-5:]:
        print(f"  {r['name']} ({r['tickerCode']}): {r['performance']:+.2f}% ({r['daysHeld']}日)")

    # セクター別
    by_sector = defaultdict(list)
    for r in valid:
        sector = r["sector"] or "その他"
        by_sector[sector].append(r["performance"])

    print(f"\n【セクター別平均リターン】")
    sector_avg = [(s, sum(perfs)/len(perfs), len(perfs)) for s, perfs in by_sector.items()]
    sector_avg.sort(key=lambda x: x[1], reverse=True)
    for sector, avg, count in sector_avg[:10]:
        print(f"  {sector}: {avg:+.2f}% ({count}件)")

    # 日別サマリー
    print(f"\n【日別サマリー】")
    for date_str in sorted(by_date.keys()):
        day_results = by_date[date_str]
        day_perfs = [r["performance"] for r in day_results]
        day_avg = sum(day_perfs) / len(day_perfs)
        day_positive = sum(1 for p in day_perfs if p > 0)
        print(f"  {date_str}: 平均 {day_avg:+.2f}%, プラス {day_positive}/{len(day_perfs)}")

    print("\n" + "=" * 70)


def main():
    import pandas as pd  # yfinanceの結果処理に必要
    global pd

    print("=" * 60)
    print("Recommendation Performance Analysis")
    print("=" * 60)
    print(f"Time: {datetime.now().isoformat()}")

    conn = psycopg2.connect(get_database_url())

    try:
        # 1. 過去7日間の推奨を取得
        print("\n1. Fetching recommendations from past 7 days...")
        recommendations = get_recommendations(conn, days_ago=7)
        print(f"   Found {len(recommendations)} recommendations")

        if not recommendations:
            print("No recommendations found. Exiting.")
            return

        # ユニークな銘柄
        unique_tickers = list(set(r["tickerCode"] for r in recommendations))
        print(f"   Unique stocks: {len(unique_tickers)}")

        # 2. 株価データを取得
        print("\n2. Fetching historical prices from yfinance...")
        min_date = min(r["date"] for r in recommendations)
        max_date = datetime.now(timezone.utc)

        if isinstance(min_date, datetime):
            min_date = min_date
        else:
            min_date = datetime.combine(min_date, datetime.min.time()).replace(tzinfo=timezone.utc)

        prices = fetch_historical_prices(unique_tickers, min_date, max_date)
        print(f"   Got price data for {len(prices)} stocks")

        # 3. パフォーマンス分析
        print("\n3. Analyzing performance...")
        results = analyze_performance(recommendations, prices)

        # 4. レポート出力
        print_report(results)

    finally:
        conn.close()


if __name__ == "__main__":
    # pandasをグローバルで使えるようにする
    import pandas as pd
    main()
