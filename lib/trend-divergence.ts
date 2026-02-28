/**
 * トレンド乖離（ねじれ）検出・解説ロジック
 *
 * 短期予測トレンドと直近の株価推移が矛盾するケースを検出し、
 * 4ステップのテンプレートで決定論的に解説テキストを生成する。
 */
import { TREND_DIVERGENCE } from "@/lib/constants";

// =====================================================
// 型定義
// =====================================================

export type DivergenceType = "speed_correction" | "rebound_warning";

export interface DivergenceDetectionParams {
  shortTermTrend: string; // "up" | "neutral" | "down"
  longTermTrend: string; // "up" | "neutral" | "down"
  weekChangeRate: number | null;
  rsiValue: number | null;
  deviationRate: number | null;
}

export interface DivergenceResult {
  type: DivergenceType | null;
  label: string | null;
}

export interface DivergenceExplanationParams {
  type: DivergenceType;
  weekChangeRate: number | null;
  rsiValue: number | null;
  deviationRate: number | null;
  resistancePrice: number | null;
  shortTermTrend: string;
  longTermTrend: string;
  investmentStyle: string; // "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE"
  currentPrice: number;
  shortTermPriceLow: number | null;
  shortTermPriceHigh: number | null;
  longTermPriceLow: number | null;
  longTermPriceHigh: number | null;
}

// =====================================================
// 検出関数
// =====================================================

/**
 * トレンド乖離（ねじれ）を検出する
 *
 * パターン1（スピード調整）: 株価は上昇中なのに短期予測がdown
 *   → RSI > 65 または 乖離率 > +5%
 * パターン2（リバウンド警戒）: 株価は下落中なのに短期予測がup
 *   → RSI < 35 または 長期トレンドがdown
 */
export function detectTrendDivergence(
  params: DivergenceDetectionParams,
): DivergenceResult {
  const { shortTermTrend, longTermTrend, weekChangeRate, rsiValue, deviationRate } = params;

  // weekChangeRate が不明な場合は検出不可
  if (weekChangeRate === null) {
    return { type: null, label: null };
  }

  // パターン1: 上昇中の下落予測（スピード調整）
  if (
    shortTermTrend === "down" &&
    weekChangeRate > 0 &&
    (
      (rsiValue !== null && rsiValue > TREND_DIVERGENCE.SPEED_CORRECTION_RSI) ||
      (deviationRate !== null && deviationRate > TREND_DIVERGENCE.SPEED_CORRECTION_DEVIATION)
    )
  ) {
    return {
      type: "speed_correction",
      label: "短期的なスピード調整（押し目待ち）",
    };
  }

  // パターン2: 下落中の上昇予測（リバウンド警戒）
  if (
    shortTermTrend === "up" &&
    weekChangeRate < 0 &&
    (
      (rsiValue !== null && rsiValue < TREND_DIVERGENCE.REBOUND_WARNING_RSI) ||
      longTermTrend === "down"
    )
  ) {
    return {
      type: "rebound_warning",
      label: "自律反発・リバウンド（戻り売り警戒）",
    };
  }

  return { type: null, label: null };
}

// =====================================================
// 4ステップ解説文生成
// =====================================================

const formatPrice = (price: number): string =>
  `¥${price.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`;

/**
 * トレンド乖離の解説テキストを4ステップで生成する
 *
 * STEP 1: 現状の肯定（ユーザーとの同期）
 * STEP 2: 具体的数値による「なぜ」の提示
 * STEP 3: ねじれ（短期 vs 長期）の価値定義
 * STEP 4: スタイル別の出口・入口戦略
 */
export function generateDivergenceExplanation(
  params: DivergenceExplanationParams,
): string {
  const {
    type,
    weekChangeRate,
    rsiValue,
    deviationRate,
    resistancePrice,
    longTermTrend,
    investmentStyle,
    shortTermPriceLow,
    longTermPriceLow,
    longTermPriceHigh,
  } = params;

  const parts: string[] = [];

  // STEP 1: 現状の肯定
  if (type === "speed_correction") {
    parts.push("足元のチャートは力強い上昇を見せていますが、");
  } else {
    parts.push("現在は下降トレンドの最中にあり、一時的な反発が見られますが、");
  }

  // STEP 2: 具体的数値による「なぜ」の提示
  const evidences: string[] = [];
  if (type === "speed_correction") {
    if (rsiValue !== null && rsiValue > TREND_DIVERGENCE.SPEED_CORRECTION_RSI) {
      evidences.push(`RSI（過熱度を示す指標）が${rsiValue.toFixed(1)}に達しており過熱感が出ています`);
    }
    if (deviationRate !== null && deviationRate > TREND_DIVERGENCE.SPEED_CORRECTION_DEVIATION) {
      evidences.push(`移動平均線からの乖離率が+${deviationRate.toFixed(1)}%と上方に乖離しています`);
    }
    if (resistancePrice !== null) {
      evidences.push(`直近のレジスタンス（抵抗線）${formatPrice(resistancePrice)}が意識されます`);
    }
  } else {
    if (rsiValue !== null && rsiValue < TREND_DIVERGENCE.REBOUND_WARNING_RSI) {
      evidences.push(`RSI（過熱度を示す指標）が${rsiValue.toFixed(1)}と売られすぎ水準にあり、テクニカル的な反発が出ています`);
    }
    if (longTermTrend === "down") {
      evidences.push("長期トレンドは依然として下向きであり、本格的な回復とは言い切れません");
    }
    if (deviationRate !== null && deviationRate < -TREND_DIVERGENCE.SPEED_CORRECTION_DEVIATION) {
      evidences.push(`移動平均線からの乖離率が${deviationRate.toFixed(1)}%と下方に乖離しています`);
    }
  }
  if (evidences.length > 0) {
    parts.push(evidences.join("。また、") + "。");
  }

  // STEP 3: ねじれの価値定義
  if (type === "speed_correction") {
    const longTermInfo = longTermPriceLow && longTermPriceHigh
      ? `長期予測は${formatPrice(longTermPriceLow)}〜${formatPrice(longTermPriceHigh)}の上昇を維持しており、`
      : longTermTrend === "up" ? "長期トレンドは上昇を維持しており、" : "";
    parts.push(`${longTermInfo}この調整はさらなる高値を目指すための「力を蓄える期間（健全な調整）」です。`);
  } else {
    parts.push("この上昇は「トレンド転換」ではなく、含み損の整理や利確を行うための「絶好の出口チャンス」と捉えるべきです。");
  }

  // STEP 4: スタイル別の出口・入口戦略
  if (type === "speed_correction") {
    const targetPrice = shortTermPriceLow ? formatPrice(shortTermPriceLow) : null;
    switch (investmentStyle) {
      case "CONSERVATIVE":
        parts.push(
          targetPrice
            ? `安定配当型ロジックでは、リスク回避を優先し、${targetPrice}付近までの調整を待つべきです。`
            : "安定配当型ロジックでは、リスク回避を優先し、調整を確認してからエントリーすべきです。",
        );
        break;
      case "BALANCED":
        parts.push(
          targetPrice
            ? `焦らず、${targetPrice}付近への押し目（一時的な調整）での買い増しを検討しましょう。`
            : "焦らず、押し目（一時的な調整）での買い増しを検討しましょう。",
        );
        break;
      case "AGGRESSIVE":
        parts.push(
          "短期的なモメンタムを重視するなら、この波に乗る選択肢もありますが、深追いは禁物です。",
        );
        break;
    }
  } else {
    switch (investmentStyle) {
      case "CONSERVATIVE":
        parts.push("安定配当型ロジックでは、リスク回避を優先し、反発確認後に慎重に対応すべきです。");
        break;
      case "BALANCED":
        parts.push("戻り売り（一時的な上昇で売る戦略）を検討し、ポジションを軽くするのが賢明です。");
        break;
      case "AGGRESSIVE":
        parts.push("短期的なモメンタムを重視するなら、この波に乗る選択肢もありますが、深追いは禁物です。");
        break;
    }
  }

  return parts.join("");
}
