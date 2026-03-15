# ドローダウン停止時のsentimentマッピング見直し

**Linear**: KOH-352
**Date**: 2026-03-15

## 背景

ドローダウン（連敗5回・週次損失5%・月次損失10%）で取引停止する際、`market-scanner.ts` が sentiment を `"bearish"` にハードコードしている。ドローダウンは自分の成績の問題であり市場環境とは無関係。市場が bullish でも bearish にマッピングされることで、`position-monitor.ts` のディフェンシブモードが不要に発動し、含み益ポジションが微益撤退（1.0%）される。

## 変更内容

### 対象ファイル

- `src/jobs/market-scanner.ts`（ドローダウン停止ブロック L288-321付近）

### 変更ロジック

ドローダウン停止時の `drawdownAssessmentData.sentiment` を、bearish ハードコードから直近の AI 市場評価に変更する。

**sentiment 取得の優先順位**:

1. 直近の `MarketAssessment` の sentiment（当日 or 前日分）
2. フォールバック: `"neutral"`（データが一切ない極端なケース）

`shouldTrade: false` による新規注文停止は維持。

### Before

```typescript
const drawdownAssessmentData = {
  sentiment: "bearish" as const,  // ハードコード
  shouldTrade: false,
  // ...
};
```

### After

```typescript
const latestAssessment = await prisma.marketAssessment.findFirst({
  orderBy: { createdAt: "desc" },
  select: { sentiment: true },
});
const sentiment = latestAssessment?.sentiment ?? "neutral";

const drawdownAssessmentData = {
  sentiment,           // AI市場評価を維持
  shouldTrade: false,  // 新規注文停止は維持
  // ...
};
```

## 影響範囲

| シナリオ | Before | After |
|----------|--------|-------|
| 連敗5回 + 市場bullish | bearish → 含み益微益撤退 | bullish → 通常監視（正しい） |
| 連敗5回 + 市場bearish | bearish → 含み益微益撤退 | bearish → 含み益微益撤退（同じ） |
| 連敗5回 + 市場crisis | bearish → 含み益微益撤退 | crisis → 全ポジション決済（より安全） |
| 週次損失5% + 市場neutral | bearish → 含み益微益撤退 | neutral → 通常監視（正しい） |

- **新規注文**: `shouldTrade: false` で停止（変更なし）
- **含み益ポジション**: 市場が bullish/neutral ならディフェンシブモード不発動
- **含み損ポジション**: 通常の SL/TS 監視を継続（変更なし）
- **市場が bearish/crisis の場合**: 従来通りディフェンシブモード発動

## リスク

- **低リスク**: 変更は sentiment の取得元のみ。`shouldTrade: false` は維持されるため、新規注文の安全弁は機能する
- **改善**: crisis 時に全ポジション決済が正しく発動するようになる（従来は bearish 扱いで含み益のみ撤退だった）
