# 米国株バックテスト検証結果

## サマリ

**米国株5戦略すべて、本番投入できるエッジなし。**
2026-04-16 の初回検証および 2026-04-26 の最新データを含む再検証で同じ結論を確認。
コードは [src/backtest/us/](../../src/backtest/us/) に参考用として残置。

| 戦略 | 24ヶ月BT NetRet | WF判定 | 結論 |
|---|---:|---|---|
| GapUp | -34.8% | エッジなし | 不採用 |
| Momentum | -29.7% | エッジなし | 不採用 |
| PEAD | -8.5% | エッジなし | 不採用 |
| Mean Reversion | 0%（シグナル不発） | 検証不能 | 不採用 |
| Wheel (CSP→CC) | +10.7%（24ヶ月BT）| **過学習 ✗（OOS PF 0.25）** | 不採用 |

## 検証条件

| 項目 | 値 |
|---|---|
| ユニバース | S&P 500 + S&P 600 SmallCap = 1,106銘柄 |
| 期間 | 2024-04-25 〜 2026-04-24（24ヶ月） |
| WF構成 | IS 6ヶ月 / OOS 3ヶ月 × 7ウィンドウ |
| 予算 | $3,300（約50万円相当） |
| データソース | yfinance（OHLCV、決算日、VIX、S&P 500） |
| コスト | SEC fee + spread モデル、T+1 受渡 |

## 戦略別BT結果（2024-04-25 〜 2026-04-24, $3,300）

### GapUp

ギャップアップ +X% & 出来高サージで当日終値エントリー。日本のGU戦略と同型。

| 指標 | 値 |
|---|---:|
| Trades | 504 |
| 勝率 | 42.9% |
| PF | **0.51** |
| 期待値 | -0.63% |
| RR | 0.66 |
| 平均保有日 | 1.2d |
| MaxDD | 35.0% |
| **NetRet** | **-34.8%** |

判定: **エッジなし**。日本中小型株のような遅延エッジが米国大型株では成立しない（流動性・Algo競合）。

### Momentum

クロスセクション・モメンタム（過去N日リターン上位TopNを保有、定期リバランス）。

| 指標 | 値 |
|---|---:|
| Trades | 163 |
| 勝率 | 35.6% |
| PF | **0.41** |
| 期待値 | -1.61% |
| RR | 0.78 |
| 平均保有日 | 3.6d |
| MaxDD | 30.5% |
| **NetRet** | **-29.7%** |

判定: **エッジなし**。短期モメンタムは米国では reversal リスクが大きい。

### PEAD (Post-Earnings Announcement Drift)

決算発表後のサプライズ方向への継続トレンドを狙う。

| 指標 | 値 |
|---|---:|
| Trades | 80 |
| 勝率 | 46.3% |
| PF | **0.38** |
| 期待値 | -0.65% |
| RR | 0.46 |
| 平均保有日 | 1.6d |
| MaxDD | 9.6% |
| **NetRet** | **-8.5%** |

判定: **エッジなし**。古典的アノマリーだが、現代の米国市場では ARM/HFT に先取りされている。

### Mean Reversion

RSI<40 + ボリンジャーバンド下限割れ + 出来高サージで反発を狙う。

| 指標 | 値 |
|---|---:|
| Trades | 0（シグナル不発） |

判定: **検証不能**。エントリー条件（RSI<40 ∧ BB割れ ∧ Vol×1.0以上）が24ヶ月で1度も満たされなかった。条件緩和して再検証する場合は config を見直し。

### Wheel (CSP → assignment → CC サイクル)

OTM Put売り → assignmentで現物取得 → OTM Call売り → called away → 繰り返し。
Black-Scholes で価格付け、デルタベースで権利行使価格選定。

#### 24ヶ月BT

| 指標 | 値 |
|---|---:|
| 完了サイクル | 62 |
| CSP売却 | 62 |
| Assigned率 | 9.7% |
| CC売却 | 45 |
| Called Away率 | 11.1% |
| Early Close率 | 55.1% |
| 受領プレミアム | $492.57 |
| 年率換算プレミアム | 154.5% |
| 平均サイクル日数 | 21.6d |
| MaxDD | 17.0% |
| **NetRet** | **+10.7%** |

#### WF再走（2026-04-26）

| Window | IS PF | OOS PF | OOS Trades | OOS勝率 | 最適パラメータ |
|---:|---:|---:|---:|---:|---|
| 1 | 4.41 | 1.37 | 13 | 92.3% | pd=0.3, dte=45, pt=0.5 |
| 2 | ∞ | **0.10** | 11 | 81.8% | pd=0.15, dte=21, pt=0.5 |
| 3 | 0.63 | ∞ | 7 | 100% | pd=0.15, dte=45, pt=0.5 |
| 4 | 0.58 | 1.46 | 14 | 85.7% | pd=0.3, dte=30, pt=0.5 |
| 5 | ∞ | 0.95 | 4 | 75.0% | pd=0.15, dte=45, pt=0.5 |
| 6 | ∞ | **0.14** | 13 | 84.6% | pd=0.15, dte=21, pt=0.5 |
| 7 | 2.19 | **0.24** | 4 | 75.0% | pd=0.3, dte=45, pt=0.65 |

**集計: OOS PF 0.25, 勝率 86.4%, 全7窓アクティブ → 判定「過学習 ✗」**

判定: **エッジなし**。
- 24ヶ月BTで +10.7% 出たのは"勝ったタイミング"を全部取った結果で、ウィンドウ分割で過学習が露呈
- 勝率86.4%は高いが**負け1発のサイズが平均勝×7倍程度**（assignment後の含み損 → CC で覆えない DD）。Wheelのテール損失構造そのもの
- パラメータが `dte=21/30/45`、`pt=0.5/0.65` で全くバラバラ、安定パラメータが見つからない
- 前回WF（2026-04-16, OOS PF=0.53）と同じ結論

## 構造的に米国でエッジが出ない理由

1. **流動性とHFT競合**: 日本中小型株（時価総額数百億円帯）にあるような出来高ギャップ・遅延反応エッジは、米国S&P構成銘柄では Algo/HFT に即座に解消される
2. **コスト構造の悪化**: SEC fee + bid/ask spread + T+1金利は、低エッジ戦略では致命的
3. **手数料無料の罠**: $0手数料でも spread と PFOF（Payment For Order Flow）でコスト負担が大きい
4. **Wheel特有のテール**: 高勝率（80-90%）でも assignment 時の含み損で1発の負けが大きく、リスク調整後は赤字

## ファイル一覧

### バックテストエンジン [src/backtest/us/](../../src/backtest/us/)

- PEAD: `us-pead-config.ts` / `us-pead-simulation.ts` / `us-pead-run.ts`
- GapUp: `us-gapup-config.ts` / `us-gapup-simulation.ts` / `us-gapup-run.ts`
- Momentum: `us-momentum-config.ts` / `us-momentum-simulation.ts` / `us-momentum-run.ts`
- Mean Reversion: `us-mean-reversion-config.ts` / `us-mean-reversion-simulation.ts` / `us-mean-reversion-run.ts`
- Wheel: `us-wheel-config.ts` / `us-wheel-simulation.ts` / `us-wheel-run.ts` / `us-wheel-types.ts`
- 共通: `us-types.ts` / `us-data-fetcher.ts` / `us-trading-costs.ts` / `us-simulation-helpers.ts`
- BS価格モデル: [src/core/options-pricing.ts](../../src/core/options-pricing.ts)

### Walk-forward スクリプト [scripts/](../../scripts/)

- `walk-forward-us-pead.ts`
- `walk-forward-us-gapup.ts`
- `walk-forward-us-momentum.ts`
- `walk-forward-us-mean-reversion.ts`
- `walk-forward-us-wheel.ts`

### データバックフィル [scripts/](../../scripts/)

- `backfill-us-daily-bars.py` （S&P 500/600 OHLCV、yfinance）
- `backfill-us-earnings-dates.py` （決算日、yfinance）
- `backfill-us-index-data.py` （S&P 500、VIX）

## 実行方法（再検証する場合）

```bash
# データ更新（最新化）
DATABASE_URL="postgresql://kouheikameyama@localhost:5432/auto_stock_trader" \
  python scripts/backfill-us-daily-bars.py --index sp500 --yes
DATABASE_URL="postgresql://kouheikameyama@localhost:5432/auto_stock_trader" \
  python scripts/backfill-us-daily-bars.py --index sp600 --yes
DATABASE_URL="postgresql://kouheikameyama@localhost:5432/auto_stock_trader" \
  python scripts/backfill-us-index-data.py --yes
DATABASE_URL="postgresql://kouheikameyama@localhost:5432/auto_stock_trader" \
  python scripts/backfill-us-earnings-dates.py --yes

# 単体BT
npm run backtest:us-pead
npm run backtest:us-gapup
npm run backtest:us-momentum
npm run backtest:us-mean-reversion
npm run backtest:us-wheel

# WF
npm run walk-forward:us-pead
npm run walk-forward:us-gapup
npm run walk-forward:us-momentum
npm run walk-forward:us-mean-reversion
npm run walk-forward:us-wheel
```

## 既知の不具合

`src/backtest/metrics.ts:31` で `winRate` を 100倍済みなのに run スクリプト群（`us-*-run.ts`）で再度100倍する → 表示が「4286.0%」のような1万倍値になる。実際の値は表示の1/100。本ドキュメント内の数値は補正済。

## 今後の方針

- **再検証 NG**: 同じ戦略の細かなパラメータ調整は時間の無駄。本ドキュメントを根拠に却下する
- **新規戦略を試す場合の前提**: 米国はコスト・競合が厳しいため、(a) 期待値 > 0.5%/trade、(b) 平均保有10日以上、(c) PF > 1.5 のいずれかを満たさない戦略は最初から検討対象外とする
- **次に試すなら**:
  - オプション売り戦略（Wheel以外、たとえば Iron Condor、Credit Spread）
  - ETFローテーション（個別株より流動性とAlgo競合の影響が小さい）
  - イベントドリブン（M&A arbitrage、IPO post-lockup など）
  - ただしいずれも米国市場の効率性を踏まえると **エッジ発見の期待値は低い**
