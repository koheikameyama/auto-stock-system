"""
Monthly Combined Strategy Mix Comparison Runner

`npm run backtest:combined -- --compare-strategy-mix` を実行し、
baseline (GU3+PSC2) vs +WB / +MOM / +WB+MOM の Calmar を比較する。

suspended 戦略を入れた構成が baseline を Calmar で上回ったら ⚠️ Slack 通知。
本番投入の最終判断材料として使う (主KPI Calmar > PF > 期待値)。

Usage:
  python scripts/run_monthly_combined_compare.py
"""

import subprocess
import sys
import os
import re
import json
import urllib.request
from typing import Optional


SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")

# baseline 比較サマリー行のパース正規表現
# 例: "+WB largecap          |       +0.82 |      +12.3% |     -1.2%"
BASELINE_DIFF_LINE = re.compile(
    r"^\s*(\+WB largecap|\+MOM largecap|\+WB\+MOM)\s*\|\s*([+-]?[\d.]+)\s*\|\s*([+-]?[\d.]+)%\s*\|\s*([+-]?[\d.]+)%"
)

# Strategy Mix 比較行のパース (絶対値)
# 例: "baseline (GU3+PSC2)   |    474 | 45.4% |  3.23 |  +1.16% |  10.7% | +171.1% |   7.47 |  13.7%"
ABSOLUTE_LINE = re.compile(
    r"^\s*(baseline \(GU3\+PSC2\)|\+WB largecap|\+MOM largecap|\+WB\+MOM)\s*\|"
    r"\s*(\d+)\s*\|\s*([\d.]+)%\s*\|\s*([\d.∞]+)\s*\|"
    r"\s*([+-]?[\d.]+)%\s*\|\s*([\d.]+)%\s*\|\s*([+-]?[\d.]+)%\s*\|\s*([\d.]+)\s*\|"
)


def run_compare() -> tuple[int, str]:
    """combined-run の compare-strategy-mix を実行"""
    cmd = [
        "npm", "run", "backtest:combined", "--",
        "--compare-strategy-mix",
        "--start", "2024-03-01",  # CLAUDE.md レジーム別検証と同じ24ヶ月期間
        "--budget", "10000000",   # 大型株combined検証で使った¥10M
    ]
    print(f"\n{'='*60}")
    print("  compare-strategy-mix 実行開始")
    print(f"{'='*60}\n")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=1800,  # 30分タイムアウト
    )

    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    return result.returncode, result.stdout


def parse_results(stdout: str) -> dict:
    """combined-run の出力から各構成の指標を抽出する"""
    rows: dict[str, dict] = {}

    # 絶対値テーブルのパース
    for line in stdout.splitlines():
        m = ABSOLUTE_LINE.match(line)
        if not m:
            continue
        label = m.group(1)
        rows[label] = {
            "trades": int(m.group(2)),
            "win_rate": float(m.group(3)),
            "pf": float(m.group(4)) if m.group(4) != "∞" else float("inf"),
            "expect": float(m.group(5)),
            "max_dd": float(m.group(6)),
            "net_ret": float(m.group(7)),
            "calmar": float(m.group(8)),
        }

    # baseline比較サマリーのパース (差分)
    diffs: dict[str, dict] = {}
    in_diff_section = False
    for line in stdout.splitlines():
        if "[baseline比較サマリー]" in line:
            in_diff_section = True
            continue
        if not in_diff_section:
            continue
        m = BASELINE_DIFF_LINE.match(line)
        if not m:
            continue
        label = m.group(1)
        diffs[label] = {
            "calmar_diff": float(m.group(2)),
            "net_ret_diff": float(m.group(3)),
            "max_dd_diff": float(m.group(4)),
        }

    return {"rows": rows, "diffs": diffs}


def detect_revival_candidates(parsed: dict) -> list[dict]:
    """suspended 構成が baseline を Calmar で上回った構成を抽出"""
    candidates = []
    for label, diff in parsed["diffs"].items():
        if diff["calmar_diff"] > 0:
            row = parsed["rows"].get(label, {})
            base = parsed["rows"].get("baseline (GU3+PSC2)", {})
            candidates.append({
                "label": label,
                "calmar": row.get("calmar"),
                "calmar_diff": diff["calmar_diff"],
                "net_ret": row.get("net_ret"),
                "net_ret_diff": diff["net_ret_diff"],
                "max_dd": row.get("max_dd"),
                "max_dd_diff": diff["max_dd_diff"],
                "baseline_calmar": base.get("calmar"),
            })
    return candidates


def notify_slack(parsed: dict, candidates: list[dict], success: bool) -> None:
    if not SLACK_WEBHOOK_URL:
        print("SLACK_WEBHOOK_URL 未設定、Slack通知をスキップ")
        return

    fields = []

    if not success:
        fields.append({
            "title": "実行失敗",
            "value": "combined compare-strategy-mix が失敗しました。GitHub Actionsログを確認してください。",
            "short": False,
        })
    else:
        # 各構成のサマリーを1フィールドにまとめる
        rows = parsed["rows"]
        baseline = rows.get("baseline (GU3+PSC2)", {})
        if baseline:
            summary_lines = [
                f"*baseline (GU3+PSC2)*: Calmar {baseline.get('calmar', 'N/A')} / NetRet {baseline.get('net_ret', 'N/A')}% / MaxDD {baseline.get('max_dd', 'N/A')}% / PF {baseline.get('pf', 'N/A')}",
            ]
            for label in ["+WB largecap", "+MOM largecap", "+WB+MOM"]:
                row = rows.get(label, {})
                diff = parsed["diffs"].get(label, {})
                if row and diff:
                    calmar_diff = diff["calmar_diff"]
                    diff_emoji = "" if calmar_diff > 0 else ""
                    summary_lines.append(
                        f"*{label}* {diff_emoji}: Calmar {row.get('calmar', 'N/A')} ({'+' if calmar_diff >= 0 else ''}{calmar_diff:.2f}) / NetRet {row.get('net_ret', 'N/A')}% / MaxDD {row.get('max_dd', 'N/A')}%"
                    )
            fields.append({
                "title": "Strategy Mix 比較",
                "value": "\n".join(summary_lines),
                "short": False,
            })

        if candidates:
            cand_lines = []
            for c in candidates:
                cand_lines.append(
                    f"*{c['label']}*: Calmar {c['calmar']} ({c['calmar_diff']:+.2f} vs baseline {c['baseline_calmar']}) / "
                    f"NetRet {c['net_ret']}% ({c['net_ret_diff']:+.1f}%) / MaxDD {c['max_dd']}% ({c['max_dd_diff']:+.1f}%)"
                )
            fields.append({
                "title": ":sparkles: 本番投入候補 (suspended構成が baseline を Calmar で超過)",
                "value": (
                    "以下の構成で baseline より Calmar が高い結果。本番投入を検討してください:\n"
                    + "\n".join(cand_lines)
                    + "\n\n判断は手動。WF判定 (monthly-walk-forward の結果) と合わせて評価し、"
                    "問題なければ `combined-run.ts` の defaultLimits または production構成を変更"
                ),
                "short": False,
            })
        else:
            fields.append({
                "title": "結論",
                "value": "baseline (GU3+PSC2) が Calmar で最良。suspended戦略の本番投入は不要。",
                "short": False,
            })

    if not success:
        color = "danger"
    elif candidates:
        color = "warning"
    else:
        color = "good"

    payload = {
        "attachments": [{
            "fallback": "Monthly Combined Strategy Mix Comparison",
            "color": color,
            "title": "Monthly Combined Strategy Mix 比較",
            "fields": fields,
            "footer": "Auto Stock Trader",
        }],
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        SLACK_WEBHOOK_URL,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
        print("Slack通知送信完了")
    except Exception as e:
        print(f"Slack通知失敗: {e}", file=sys.stderr)


def main():
    try:
        returncode, stdout = run_compare()
        success = returncode == 0
    except subprocess.TimeoutExpired:
        print("compare-strategy-mix タイムアウト", file=sys.stderr)
        success = False
        stdout = ""
    except Exception as e:
        print(f"compare-strategy-mix エラー: {e}", file=sys.stderr)
        success = False
        stdout = ""

    parsed = parse_results(stdout) if success else {"rows": {}, "diffs": {}}
    candidates = detect_revival_candidates(parsed) if success else []

    notify_slack(parsed, candidates, success)

    print(f"\n{'='*60}")
    print("  サマリー")
    print(f"{'='*60}")
    if success:
        print(f"  パース済み構成: {len(parsed['rows'])}件")
        print(f"  本番投入候補: {len(candidates)}件")
        for c in candidates:
            print(f"    - {c['label']}: Calmar {c['calmar']} ({c['calmar_diff']:+.2f} vs baseline)")
    else:
        print("  実行失敗")

    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
