#!/usr/bin/env python3
"""
事業内容を取得してDBに保存するスクリプト

yfinanceからlongBusinessSummary（英語）を取得し、
OpenAI (gpt-4o-mini) で日本語に翻訳してStockテーブルに保存する。

全銘柄をROTATION_DAYS日で取得できるよう、
銘柄数から動的に1日の取得数を計算。
businessDescriptionUpdatedAtがNULLまたは古い順に取得。

実行方法:
  DATABASE_URL="postgresql://..." OPENAI_API_KEY="sk-..." python scripts/github-actions/fetch_business_descriptions.py
"""

import math
import os
import queue
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import psycopg2
import yfinance as yf
from openai import OpenAI

# scriptsディレクトリをPythonパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.constants import AI_CONCURRENCY_LIMIT, OPENAI_MODEL

# 全銘柄を取得するのに何日かけるか（事業内容は変わりにくいので長め）
ROTATION_DAYS = 30

# yfinanceリクエスト間隔（秒）
SLEEP_INTERVAL = 0.5


def get_database_url() -> str:
    """データベースURLを取得"""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Error: DATABASE_URL environment variable not set")
        sys.exit(1)
    return url


def get_openai_client() -> OpenAI:
    """OpenAIクライアントを取得"""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)
    return OpenAI(api_key=api_key)


def get_total_stock_count(conn) -> int:
    """全銘柄数を取得（データ取得不可銘柄を除く）"""
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM "Stock" WHERE "isDelisted" = false')
        return cur.fetchone()[0]


def calculate_daily_limit(total_stocks: int) -> int:
    """1日の取得数を計算"""
    return math.ceil(total_stocks / ROTATION_DAYS)


def fetch_stocks_to_update(conn, limit: int) -> list[dict]:
    """更新が必要な銘柄を取得（businessDescriptionUpdatedAtがNULLまたは古い順）"""
    with conn.cursor() as cur:
        cur.execute('''
            SELECT id, "tickerCode", name
            FROM "Stock"
            WHERE "isDelisted" = false
            ORDER BY
                CASE WHEN "businessDescriptionUpdatedAt" IS NULL THEN 0 ELSE 1 END,
                "businessDescriptionUpdatedAt" ASC NULLS FIRST
            LIMIT %s
        ''', (limit,))
        rows = cur.fetchall()

    return [{"id": row[0], "tickerCode": row[1], "name": row[2]} for row in rows]


def fetch_business_summary(ticker_code: str) -> str | None:
    """yfinanceから事業概要（英語）を取得"""
    try:
        stock = yf.Ticker(ticker_code)
        info = stock.info
        summary = info.get("longBusinessSummary")
        if summary and len(summary.strip()) > 0:
            return summary.strip()
        return None
    except Exception:
        return None


def translate_to_japanese(client: OpenAI, company_name: str, english_summary: str) -> str | None:
    """OpenAIで英語の事業概要を日本語に翻訳"""
    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "あなたは企業情報の翻訳者です。"
                        "英語の企業事業概要を自然な日本語に翻訳してください。"
                        "投資初心者にも分かりやすいよう、専門用語には簡単な補足を加えてください。"
                        "翻訳結果のみを出力してください。"
                    ),
                },
                {
                    "role": "user",
                    "content": f"以下は「{company_name}」の事業概要です。日本語に翻訳してください。\n\n{english_summary}",
                },
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        if content and len(content.strip()) > 0:
            return content.strip()
        return None
    except Exception as e:
        print(f"  OpenAI翻訳エラー: {e}")
        return None


def update_business_description(conn, stock_id: str, description: str | None):
    """事業内容をDBに更新（データがない場合もbusinessDescriptionUpdatedAtを更新）"""
    with conn.cursor() as cur:
        if description:
            cur.execute('''
                UPDATE "Stock"
                SET
                    "businessDescription" = %s,
                    "businessDescriptionUpdatedAt" = NOW()
                WHERE id = %s
            ''', (description, stock_id))
        else:
            # データがない場合もUpdatedAtを更新（次のローテーションまでスキップ）
            cur.execute('''
                UPDATE "Stock"
                SET "businessDescriptionUpdatedAt" = NOW()
                WHERE id = %s
            ''', (stock_id,))


# センチネル値: Producerの終了を通知
_SENTINEL = None


def producer(stocks: list[dict], q: queue.Queue):
    """yfinanceから英語事業概要を順次取得してキューに入れる"""
    for stock in stocks:
        english_summary = fetch_business_summary(stock["tickerCode"])
        q.put({
            "id": stock["id"],
            "tickerCode": stock["tickerCode"],
            "name": stock["name"],
            "english_summary": english_summary,
        })
        time.sleep(SLEEP_INTERVAL)
    q.put(_SENTINEL)


def main():
    conn = psycopg2.connect(get_database_url())
    client = get_openai_client()

    try:
        # 全銘柄数から1日の取得数を計算
        total_stocks = get_total_stock_count(conn)
        daily_limit = calculate_daily_limit(total_stocks)

        print("=" * 60)
        print("事業内容の分散取得を開始（パイプライン処理）")
        print(f"開始時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"全銘柄数: {total_stocks}銘柄")
        print(f"ローテーション: {ROTATION_DAYS}日")
        print(f"今日の取得数: {daily_limit}銘柄")
        print("=" * 60)

        # 更新が必要な銘柄を取得
        stocks = fetch_stocks_to_update(conn, daily_limit)
        print(f"\n対象銘柄数: {len(stocks)}")

        if not stocks:
            print("対象銘柄がありません（全て最新）")
            return

        success_count = 0
        no_data_count = 0
        error_count = 0
        processed_count = 0
        total = len(stocks)
        start_time = time.time()
        db_lock = threading.Lock()

        # Producer-Consumer パイプライン
        # Producer: yfinance取得（順次、レート制限対策）→ キュー
        # Consumer: OpenAI翻訳（並列）→ DB保存
        q: queue.Queue = queue.Queue(maxsize=AI_CONCURRENCY_LIMIT * 2)

        # Producerスレッド開始
        producer_thread = threading.Thread(target=producer, args=(stocks, q), daemon=True)
        producer_thread.start()

        # Consumer: ThreadPoolExecutorで並列翻訳
        with ThreadPoolExecutor(max_workers=AI_CONCURRENCY_LIMIT) as executor:
            futures = []

            while True:
                item = q.get()
                if item is _SENTINEL:
                    break

                stock_data = item

                # yfinanceデータなし → DB更新のみ（翻訳不要）
                if not stock_data["english_summary"]:
                    with db_lock:
                        update_business_description(conn, stock_data["id"], None)
                        conn.commit()
                    no_data_count += 1
                    processed_count += 1
                    continue

                # OpenAI翻訳をスレッドプールに投入
                def translate_and_save(data: dict) -> dict:
                    description = translate_to_japanese(client, data["name"], data["english_summary"])
                    with db_lock:
                        try:
                            update_business_description(conn, data["id"], description)
                            conn.commit()
                        except Exception as e:
                            conn.rollback()
                            return {"ticker": data["tickerCode"], "status": "db_error", "error": str(e)}
                    if description:
                        return {"ticker": data["tickerCode"], "status": "success"}
                    return {"ticker": data["tickerCode"], "status": "translate_error"}

                futures.append(executor.submit(translate_and_save, stock_data))

            # 残りのfutureを回収
            for future in futures:
                result = future.result()
                processed_count += 1

                if result["status"] == "success":
                    success_count += 1
                    print(f"[{processed_count}/{total}] {result['ticker']}: OK")
                elif result["status"] == "translate_error":
                    error_count += 1
                    print(f"[{processed_count}/{total}] {result['ticker']}: 翻訳失敗")
                else:
                    error_count += 1
                    print(f"[{processed_count}/{total}] {result['ticker']}: DB更新エラー - {result.get('error')}")

        producer_thread.join()

        elapsed_total = (time.time() - start_time) / 60

        print("\n" + "=" * 60)
        print(f"完了: 成功={success_count}, データなし={no_data_count}, エラー={error_count}")
        print(f"実行時間: {elapsed_total:.1f}分")
        print(f"終了時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

        # 全員失敗した場合はエラー終了
        if success_count == 0 and no_data_count == 0 and error_count > 0:
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
