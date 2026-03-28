# ギャップアップ戦略 本番統合 設計書

## 概要

ギャップアップ戦略（前日終値→当日始値の窓開け上昇 + 出来高サージ）を本番トレーディングシステムに統合する。既存のbreakout-monitorに14:50のgapupスキャンを追加し、引け条件付き成行注文で発注する。

## 設計方針

- 既存のbreakout-monitorに統合（新規cronジョブ不要）
- position-monitor / exit-checker は既にstrategy対応済み → 定数追加のみ
- ポジション枠はbreakoutと独立管理（breakout: 3、gapup: 2）
- マーケットフィルターはMarketAssessment共有
- エグジットパラメータはWF検証で安定していた値で固定

## エントリーフロー

### シグナル検出（14:50 JST）

breakout-monitorの毎分ループ内で、14:50以降かつ未実行の場合に1回だけgapupスキャンを実行。

**スキャン対象**: 当日のBreakoutWatchlistEntry（breakoutと同じユニバース）

**判定条件**（`isGapUpSignal()` 既存モジュール再利用）:
1. ギャップ閾値: `(open - prevClose) / prevClose >= 3%`
2. 陽線引け: `close >= open`（14:50時点の現在値で代替）
3. ギャップ維持: `currentPrice > prevClose × 1.03`
4. 出来高サージ: `volume / avgVolume25 >= 1.5x`

**注意**: バックテストでは`close`を使ったが、本番では14:50時点の`currentPrice`で代替。15:00の終値とは若干ズレるが、引け成行で約定するため実質的に終値エントリーとなる。

### 発注

- 立花API: `sCondition="4"`（引け条件付き成行注文）
- SL: `max(currentPrice - ATR14 × 1.0, currentPrice × 0.97)`
- ポジションサイズ: リスクベース（資金の2%リスク）
- 注文有効期限: 当日限り（引け成行なので当日約定 or 失効）

### ガード条件

- MarketAssessment.shouldTrade = true
- gapupポジション数 < 2
- 資金チェック（買余力 + 投資比率）
- セクター・マクロファクター制限（breakoutと合算）
- 日次損失制限（breakoutと合算）
- 同一銘柄の重複チェック（breakoutポジションと合わせて）

## エグジットロジック

既存の`checkPositionExit()`を再利用。TradingPosition作成時にgapup用のoverride値をセット。

### パラメータ（WF検証で全ウィンドウ安定の値）

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| atrMultiplier (SL) | 1.0 | ATR×1.0のストップロス |
| beActivationMultiplier | 0.3 | ATR×0.3でブレイクイーブン発動 |
| tsActivationMultiplier | 0.5 | ATR×0.5でトレーリングストップ発動 |
| trailMultiplier | 0.3 | ATR×0.3のトレール幅 |
| maxHoldingDays | 3 | 3営業日でタイムストップ |
| maxExtendedHoldingDays | 5 | 含み益+TS時は最大5日延長 |

### ディフェンシブモード

breakoutと同じルール:
- bearish: 含み益 >= 1.0% なら微益撤退
- crisis: 全ポジション即時決済

## ポジション管理

### 独立カウント

```
breakout: MAX_POSITIONS = 3（変更なし）
gapup:    MAX_POSITIONS = 2
```

risk-managerの`canOpenPosition()`にstrategyパラメータを追加し、戦略別にポジション数を判定。

### 共通制限（戦略合算）

- セクター: 同一セクター最大1ポジション（breakout+gapup合算）
- マクロファクター: 同一マクロ最大2ポジション（合算）
- 日次損失: 3%（合算）
- 週次ドローダウン: 5%（合算）
- 月次ドローダウン: 10%（合算）

## 変更対象ファイル

### 新規作成

| ファイル | 役割 |
|---------|------|
| `src/core/gapup/gapup-scanner.ts` | GapUpScannerクラス（14:50スキャン、立花API時価取得、isGapUpSignal判定） |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/constants/gapup.ts` | ライブ用定数追加（GUARD, POSITION_MANAGEMENT） |
| `src/lib/constants/jobs.ts` | TRAILING_STOP, BREAK_EVEN_STOP, TIME_STOPに"gapup"エントリー追加 |
| `src/lib/constants/trading.ts` | GAPUP_DEFAULTS（maxPositions: 2）追加 |
| `src/core/breakout/entry-executor.ts` | strategy引数追加、gapup時の引け成行注文対応 |
| `src/jobs/breakout-monitor.ts` | 14:50 gapupスキャン追加、GapUpScanner統合 |
| `src/core/trading/risk-manager.ts` | canOpenPosition()にstrategy別ポジション数チェック追加 |
| `src/core/trading/position-monitor.ts` | gapupポジションのoverride値設定 |
| `src/core/trading/time-filter.ts` | gapup用の時間帯フィルター追加（14:50-15:00） |

### 変更不要

| ファイル | 理由 |
|---------|------|
| `prisma/schema.prisma` | TradingOrder.strategy / TradingPosition.strategyはstring型で"gapup"使用可 |
| `src/core/trading/exit-checker.ts` | 既にstrategy overrideパラメータ対応済み |
| `src/core/trading/trailing-stop.ts` | 既にstrategy overrideパラメータ対応済み |
| `src/jobs/position-monitor.ts` (exit部分) | override経由で動作するため変更不要 |
| `src/core/gapup/entry-conditions.ts` | 既存のisGapUpSignal()をそのまま再利用 |

## 1営業日のフロー

```
08:00  watchlist-builder → BreakoutWatchlistEntry保存（gapupも同じユニバース）
09:00  breakout-monitor開始（毎分）
       ├── breakout scan: Hot/Cold 2層スキャン → executeEntry("breakout")
       └── 14:50 gapup scan（1回のみ）:
           ├── 立花APIで当日OHLCV取得（watchlist全銘柄）
           ├── isGapUpSignal() でシグナル判定
           ├── MarketAssessment/リスク確認
           └── executeEntry("gapup") → 引け成行注文（sCondition="4"）
15:00  引け注文約定
15:00  position-monitor → gapupポジションopen化
       └── exit-checker: gapup用パラメータ（override）で監視開始
翌営業日〜
       └── position-monitor: BE/TS/SL/タイムストップ(3日)で決済
```

## リスク比較表

| 項目 | breakout | gapup |
|------|----------|-------|
| maxPositions | 3 | 2 |
| SL | ATR×1.0 (max 3%) | ATR×1.0 (max 3%) |
| BE発動 | ATR×1.0 | ATR×0.3 |
| TS発動 | ATR×1.5 | ATR×0.5 |
| トレール幅 | ATR×1.0 | ATR×0.3 |
| タイムストップ | 5日(延長10日) | 3日(延長5日) |
| 注文方法 | 指値（リアルタイム） | 引け成行（14:50判定） |
| セクター制限 | 合算: 同一セクター最大1 | |
| 日次損失制限 | 合算: 3% | |

## テスト戦略

- GapUpScanner: ユニットテスト（モック時価データでシグナル検出確認）
- entry-executor: 既存テストにgapup strategyケースを追加
- risk-manager: strategy別ポジション数チェックのユニットテスト
- E2E: simulation モードで14:50スキャン→引け成行注文→翌日exit確認
