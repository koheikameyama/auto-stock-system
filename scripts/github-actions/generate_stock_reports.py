#!/usr/bin/env python3
"""
銘柄レポート生成スクリプト

ウォッチリスト（気になる銘柄）に対して、毎日レポートを生成します。
APIエンドポイントを呼び出すことで、手動実行と同じロジックを使用します。
"""

import os
import sys
from datetime import datetime

import psycopg2
import requests

# scriptsディレクトリをPythonパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.user_activity import get_active_user_filter_sql


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def get_app_url() -> str:
    url = os.environ.get("APP_URL")
    if not url:
        print("Error: APP_URL environment variable not set")
        sys.exit(1)
    return url


def get_cron_secret() -> str:
    secret = os.environ.get("CRON_SECRET")
    if not secret:
        print("Error: CRON_SECRET environment variable not set")
        sys.exit(1)
    return secret


def fetch_watchlist_stocks(conn) -> list[dict]:
    """ウォッチリストの銘柄IDを取得（アクティブユーザーのウォッチリストのみ、重複排除、チャートデータがある銘柄のみ）"""
    active_filter = get_active_user_filter_sql()
    with conn.cursor() as cur:
        cur.execute(f'''
            SELECT DISTINCT ws."stockId", s.name, s."tickerCode"
            FROM "WatchlistStock" ws
            JOIN "Stock" s ON ws."stockId" = s.id
            JOIN "User" u ON ws."userId" = u.id
            WHERE s."hasChartData" = true
              AND s."isDelisted" = false
              AND {active_filter}
        ''')
        rows = cur.fetchall()
    return [{"stockId": row[0], "name": row[1], "tickerCode": row[2]} for row in rows]


def generate_report_for_stock(app_url: str, cron_secret: str, stock_id: str) -> dict | None:
    """APIを呼び出して銘柄レポートを生成"""
    try:
        response = requests.post(
            f"{app_url}/api/stocks/{stock_id}/report",
            headers={"Authorization": f"Bearer {cron_secret}"},
            timeout=120
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"  Error: {response.status_code} - {response.text[:200]}")
            return None
    except requests.exceptions.Timeout:
        print("  Error: Request timed out")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def main():
    print("=== Starting Stock Report Generation ===")
    print(f"Time: {datetime.now().isoformat()}")

    app_url = get_app_url()
    cron_secret = get_cron_secret()
    conn = psycopg2.connect(get_database_url())

    try:
        watchlist_stocks = fetch_watchlist_stocks(conn)
        print(f"Found {len(watchlist_stocks)} stocks in watchlist")

        if not watchlist_stocks:
            print("No stocks in watchlist. Exiting.")
            return

        success_count, error_count = 0, 0

        for ws in watchlist_stocks:
            print(f"\n--- Processing: {ws['name']} ({ws['tickerCode']}) ---")

            result = generate_report_for_stock(app_url, cron_secret, ws["stockId"])

            if not result:
                print("  Failed to generate report")
                error_count += 1
                continue

            health_rank = result.get("healthRank", "N/A")
            technical_score = result.get("technicalScore", "N/A")
            fundamental_score = result.get("fundamentalScore", "N/A")

            print(f"  Generated: healthRank={health_rank}, technical={technical_score}, fundamental={fundamental_score}")
            success_count += 1

        print(f"\n=== Summary ===")
        print(f"Success: {success_count}, Errors: {error_count}")

        # 全件失敗した場合はエラー終了
        if success_count == 0 and error_count > 0:
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
