# エントリー精緻化 + ユニバース絞り込み 設計書

## 背景

現在のbreakout戦略はwalk-forward検証でOOS集計PF=0.72（過学習判定）。出口パラメータ（trail=0.3, ts=1.0）は安定しているが、エントリーの質が低くダマシ（偽ブレイク）を多く拾っている。

## 目的

1. **ユニバース絞り込み（C）**: 流動性の低い銘柄を除外し、信号の質を向上
2. **エントリー精緻化（A）**: ブレイクアウト強度と出来高トレンドの2フィルターを追加

## 変更内容

### 1. ユニバースフィルター変更

| パラメータ | 現状 | 変更後 |
|-----------|------|--------|
| `minAvgVolume25` | 50,000 | **200,000** |
| `maxPrice` | 5,000 | 5,000（変更なし） |

**理由**: 50万円の運用資金では5,000円以下の銘柄が対象上限。出来高を4倍に引き上げることで、流動性不足の小型株を除外し、ストップ注文の約定信頼性を向上させる。

### 2. 新フィルター: ブレイクアウト強度（minBreakoutAtr）

**条件**: `(close - highN) / atr14 >= minBreakoutAtr`

- 高値をATRの一定割合以上クリアに超えた場合のみエントリー許可
- 0.0 = フィルター無効（現状と同等）
- 高値をギリギリ超えただけのブレイクアウトはダマシ率が高い。クリアに超えたブレイクのみを対象とする

**型追加**: `BreakoutBacktestConfig.minBreakoutAtr?: number`（デフォルト: 0）

**walk-forwardグリッド**: `[0.0, 0.2, 0.3, 0.5]`

### 3. 新フィルター: 出来高トレンド（volumeTrendThreshold）

**条件**: `avgVolume5 / avgVolume25 >= volumeTrendThreshold`

- 直近5日の平均出来高が25日平均の一定割合以上の場合のみエントリー許可
- 1.0 = 最も緩い条件（「直近5日の出来高が25日平均以上」= 出来高が減少していないことの確認）
- 単日の出来高急増は偶発的（決算、ニュース等）。数日かけて出来高が増加しているなら機関投資家の仕込みの可能性が高い

**型追加**: `BreakoutBacktestConfig.volumeTrendThreshold?: number`（デフォルト: 1.0）

**walk-forwardグリッド**: `[1.0, 1.2, 1.5]`

### 4. walk-forwardパラメータグリッド再構成

現状の出口パラメータは trail=0.3, ts=1.0 が全ウィンドウで安定選択されている。出口グリッドを安定領域周辺に絞り、新しいエントリーパラメータの探索余地を確保する。

#### 出口グリッド（縮小）

| パラメータ | 現状 | 変更後 |
|-----------|------|--------|
| `atrMultiplier` | [0.8, 1.0, 1.2] (3) | [0.8, 1.0, 1.2] (3) 変更なし |
| `beActivationMultiplier` | [0.3, 0.5, 1.0, 1.5] (4) | **[0.3, 0.5]** (2) |
| `trailMultiplier` | [0.3, 0.5, 0.8, 1.0, 1.5] (5) | **[0.3, 0.5]** (2) |
| `tsActivationMultiplier` | [1.0, 1.5, 2.0, 2.5] (4) | **[1.0, 1.5]** (2) |

出口: 3 × 2 × 2 × 2 = **24通り**

#### エントリーグリッド（新規）

| パラメータ | グリッド |
|-----------|---------|
| `minBreakoutAtr` | [0.0, 0.2, 0.3, 0.5] (4) |
| `volumeTrendThreshold` | [1.0, 1.2, 1.5] (3) |

エントリー: 4 × 3 = **12通り**

#### 合計

24 × 12 = **288通り**（現状240通りと同等の計算量）

### 5. デフォルト設定の変更

`BREAKOUT_BACKTEST_DEFAULTS` の変更:

```
minAvgVolume25: 50_000  → 200_000
minBreakoutAtr: 0       （新規、デフォルト無効）
volumeTrendThreshold: 1.0（新規、デフォルト無効）
```

### 6. 実装箇所

| ファイル | 変更内容 |
|---------|---------|
| `src/backtest/types.ts` | `minBreakoutAtr?`, `volumeTrendThreshold?` を `BreakoutBacktestConfig` に追加 |
| `src/backtest/breakout-config.ts` | デフォルト値変更、`PARAMETER_GRID` にエントリーグリッド追加、`generateParameterCombinations` 更新 |
| `src/backtest/breakout-simulation.ts` | シグナル判定にブレイクアウト強度・出来高トレンド条件を追加 |
| `scripts/walk-forward-breakout.ts` | エントリーパラメータもコンボに含める |
| `.claude/rules/backtest.md` | パラメータグリッドの説明を更新 |

### 7. シミュレーション内の判定フロー（変更後）

```
1. 既存の前提条件チェック
   - close > 0, close <= maxPrice
   - avgVolume25 >= minAvgVolume25 (200,000)
   - atr14 / close * 100 >= minAtrPct (1.5%)

2. マーケットフィルター（既存）
   - breadth >= 0.7
   - N225 >= SMA50

3. ブレイクアウトシグナル判定（既存）
   - dailyVolume / avgVolume25 >= triggerThreshold (2.0)
   - close > highN (20日高値)
   - (close - highN) <= atr14 * maxChaseAtr (1.0)

4. ★ 新規: ブレイクアウト強度チェック
   - (close - highN) / atr14 >= minBreakoutAtr

5. ★ 新規: 出来高トレンドチェック
   - avgVolume5 / avgVolume25 >= volumeTrendThreshold

6. 確認足（翌日エントリー）（既存）
   - 翌日 close > breakout level
```

### 8. avgVolume5 の計算

`breakout-simulation.ts` 内の `analyzeTechnicals` で計算する。既に `avgVolume25` を計算している箇所に、同様に直近5日の平均出来高 `avgVolume5` を追加する。

```typescript
// 既存: avgVolume25（25日移動平均出来高）
// 新規: avgVolume5（5日移動平均出来高）
avgVolume5 = average(volume[i], volume[i-1], ..., volume[i-4])
```

### 9. 検証計画

1. 変更後に `npm run walk-forward:breakout` を実行
2. OOS集計PF >= 1.0 を最低目標とする
3. エントリーパラメータ（minBreakoutAtr, volumeTrendThreshold）の安定性を確認
   - 全ウィンドウで同じ値が選ばれれば堅牢
   - ウィンドウごとにバラつくなら過学習リスク

### 10. 成功基準

| 指標 | 現状 | 最低目標 | 理想 |
|------|------|---------|------|
| OOS集計PF | 0.72 | **>= 1.0** | >= 1.3 |
| 判定 | 過学習 ✗ | 要注意 △ | 堅牢 ✓ |
| トレード数 | - | 十分な統計的意義（各窓10+） | - |

## スコープ外

- セクターモメンタムフィルター（第2弾として検討）
- スコアフィルターの有効化（個別フィルターの効果確認後）
- maxPrice の変更（資金50万円では5,000円が適切）
- 出口ロジックの変更（安定しているため）
