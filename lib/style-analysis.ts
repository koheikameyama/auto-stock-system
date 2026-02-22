/**
 * 投資スタイル別分析の型定義と共通ロジック
 *
 * 1つの銘柄に対して、3つの投資スタイル（慎重派/バランス型/積極派）での
 * 分析結果を生成し、比較できるようにする。
 */
import { INVESTMENT_STYLES, type InvestmentStyle } from "@/lib/constants";
import {
  isSurgeStock,
  isOverheated,
  isInDecline,
} from "@/lib/stock-safety-rules";
import { MA_DEVIATION, MOMENTUM } from "@/lib/constants";

/** 投資スタイル別の購入判断結果 */
export interface PurchaseStyleAnalysis {
  recommendation: string; // "buy" | "stay" | "avoid"
  confidence: number;
  statusType: string;
  marketSignal: string;
  advice: string;
  reason: string;
  caution: string;
  buyCondition: string | null;
  buyTiming: string | null;
  dipTargetPrice: number | null;
  sellTiming: string | null;
  sellTargetPrice: number | null;
}

/** 投資スタイル別のポートフォリオ分析結果 */
export interface PortfolioStyleAnalysis {
  recommendation: string; // "buy" | "hold" | "sell"
  confidence: number;
  statusType: string;
  marketSignal: string;
  advice: string;
  shortTerm: string;
  sellReason: string | null;
  sellCondition: string | null;
  suggestedSellPercent: number | null;
  sellTiming: string | null;
  sellTargetPrice: number | null;
}

/** 全3スタイルの分析結果マップ */
export type StyleAnalysesMap<T> = Record<InvestmentStyle, T>;

const ALL_STYLES: InvestmentStyle[] = [
  INVESTMENT_STYLES.CONSERVATIVE,
  INVESTMENT_STYLES.BALANCED,
  INVESTMENT_STYLES.AGGRESSIVE,
];

/**
 * 購入判断の投資スタイル別補正を適用
 * AIの生成結果 + 非スタイル依存補正の済んだ結果を受け取り、
 * 3スタイル分の結果を返す
 */
export function applyPurchaseStyleCorrections(params: {
  baseResult: {
    recommendation: string;
    confidence: number;
    statusType: string;
    marketSignal: string;
    advice: string;
    reason: string;
    caution: string;
    buyCondition: string | null;
  };
  weekChangeRate: number | null;
  deviationRate: number | null;
  buyTimingParams: {
    deviationRate: number | null;
    rsi: number | null;
    sma25: number | null;
  };
  sellTimingParams: {
    deviationRate: number | null;
    rsi: number | null;
    sma25: number | null;
  };
  skipSafetyRules: boolean;
}): StyleAnalysesMap<PurchaseStyleAnalysis> {
  const { baseResult, weekChangeRate, deviationRate, buyTimingParams, sellTimingParams, skipSafetyRules } = params;

  const result = {} as StyleAnalysesMap<PurchaseStyleAnalysis>;

  for (const style of ALL_STYLES) {
    // ベース結果をディープコピー
    const styleResult = {
      recommendation: baseResult.recommendation,
      confidence: baseResult.confidence,
      statusType: baseResult.statusType,
      marketSignal: baseResult.marketSignal,
      advice: baseResult.advice,
      reason: baseResult.reason,
      caution: baseResult.caution,
      buyCondition: baseResult.buyCondition,
      buyTiming: null as string | null,
      dipTargetPrice: null as number | null,
      sellTiming: null as string | null,
      sellTargetPrice: null as number | null,
    };

    // スタイル依存の補正を適用
    if (!skipSafetyRules) {
      // 下落トレンドの強制補正
      if (
        isInDecline(weekChangeRate, style) &&
        styleResult.recommendation === "buy"
      ) {
        styleResult.recommendation = "stay";
        styleResult.confidence = Math.max(
          0,
          styleResult.confidence + MOMENTUM.DECLINE_CONFIDENCE_PENALTY,
        );
        styleResult.caution = `週間${weekChangeRate!.toFixed(0)}%の下落トレンドのため、様子見を推奨します。${styleResult.caution}`;
        styleResult.buyCondition =
          styleResult.buyCondition || "下落トレンドが落ち着いてから検討してください";
      }

      // 急騰銘柄の強制補正
      if (
        isSurgeStock(weekChangeRate, style) &&
        styleResult.recommendation === "buy"
      ) {
        styleResult.recommendation = "stay";
        styleResult.caution = `週間+${weekChangeRate!.toFixed(0)}%の急騰銘柄のため、様子見を推奨します。${styleResult.caution}`;
      }

      // 過熱圏の強制補正
      if (
        isOverheated(deviationRate, style) &&
        styleResult.recommendation === "buy"
      ) {
        styleResult.recommendation = "stay";
        styleResult.confidence = Math.max(
          0,
          styleResult.confidence + MA_DEVIATION.CONFIDENCE_PENALTY,
        );
        styleResult.caution = `25日移動平均線から+${deviationRate!.toFixed(1)}%乖離しており過熱圏のため、様子見を推奨します。${styleResult.caution}`;
      }
    }

    // 購入タイミング判断
    if (styleResult.recommendation === "buy") {
      const { deviationRate: devRate, rsi, sma25 } = buyTimingParams;
      const isHighDeviation =
        devRate !== null && devRate > MA_DEVIATION.DIP_BUY_THRESHOLD;
      const isOverboughtRSI =
        rsi !== null && rsi > MA_DEVIATION.RSI_OVERBOUGHT_THRESHOLD;

      if (isHighDeviation || isOverboughtRSI) {
        styleResult.buyTiming = "dip";
        styleResult.dipTargetPrice = sma25;
      } else {
        styleResult.buyTiming = "market";
      }
    }

    // 売りタイミング判定（avoid推奨時のみ）
    if (styleResult.recommendation === "avoid") {
      const { deviationRate: devRate, rsi, sma25 } = sellTimingParams;
      const isDeviationOk =
        devRate === null || devRate >= -5;
      const isRsiOk = rsi === null || rsi >= 30;

      if (isDeviationOk && isRsiOk) {
        styleResult.sellTiming = "market";
      } else {
        styleResult.sellTiming = "rebound";
        styleResult.sellTargetPrice = sma25;
      }
    }

    result[style] = styleResult;
  }

  return result;
}

/**
 * ポートフォリオ分析の投資スタイル別補正を適用
 */
export function applyPortfolioStyleCorrections(params: {
  baseResult: {
    recommendation: string;
    confidence: number;
    statusType: string;
    marketSignal: string;
    advice: string;
    shortTerm: string;
    sellReason: string | null;
    sellCondition: string | null;
    suggestedSellPercent: number | null;
  };
  weekChangeRate: number | null;
  isProfitable: boolean | null;
  volatility: number | null;
  sma25: number | null;
  sellTimingBase: string | null;
  sellTargetPriceBase: number | null;
}): StyleAnalysesMap<PortfolioStyleAnalysis> {
  const { baseResult, weekChangeRate, isProfitable, volatility, sma25, sellTimingBase, sellTargetPriceBase } = params;

  const result = {} as StyleAnalysesMap<PortfolioStyleAnalysis>;

  for (const style of ALL_STYLES) {
    const styleResult = {
      recommendation: baseResult.recommendation,
      confidence: baseResult.confidence,
      statusType: baseResult.statusType,
      marketSignal: baseResult.marketSignal,
      advice: baseResult.advice,
      shortTerm: baseResult.shortTerm,
      sellReason: baseResult.sellReason,
      sellCondition: baseResult.sellCondition,
      suggestedSellPercent: baseResult.suggestedSellPercent,
      sellTiming: sellTimingBase,
      sellTargetPrice: sellTargetPriceBase,
    };

    // 急騰銘柄の買い増し抑制（スタイル依存）
    if (
      isSurgeStock(weekChangeRate, style) &&
      styleResult.recommendation === "buy"
    ) {
      styleResult.recommendation = "hold";
      styleResult.shortTerm = `週間+${weekChangeRate!.toFixed(0)}%の急騰後のため、買い増しは高値掴みのリスクがあります。${styleResult.shortTerm}`;
    }

    // 戻り売りステータスの場合、sellTimingとsellTargetPriceを強制設定
    if (styleResult.statusType === "戻り売り") {
      if (styleResult.sellTiming !== "rebound") {
        styleResult.sellTiming = "rebound";
      }
      if (!styleResult.sellTargetPrice && sma25 !== null) {
        styleResult.sellTargetPrice = sma25;
      }
    }

    result[style] = styleResult;
  }

  return result;
}
