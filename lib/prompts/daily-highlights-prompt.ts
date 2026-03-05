/**
 * 日次注目銘柄のプロンプト
 *
 * daily-recommendation-prompt.ts から移行
 * "おすすめ" → "客観条件ベースの注目銘柄" に変更
 */

import {
  PROMPT_MARKET_SIGNAL_DEFINITION,
  PROMPT_NEWS_CONSTRAINTS,
} from "@/lib/stock-analysis-context";
import { SESSION_CONTEXT } from "@/lib/highlight-scoring";

export function buildDailyHighlightsPrompt(params: {
  session: string;
  styleLabel: string;
  budgetLabel: string;
  investmentStyle: string | null;
  stockSummaries: string;
  marketContext: string;
  sectorTrendContext: string;
  newsContext: string;
  ownedTickerCodes?: string[];
  watchlistTickerCodes?: string[];
}): string {
  const {
    session,
    styleLabel,
    budgetLabel,
    investmentStyle,
    stockSummaries,
    marketContext,
    sectorTrendContext,
    newsContext,
    ownedTickerCodes = [],
    watchlistTickerCodes = [],
  } = params;

  const ctx = SESSION_CONTEXT[session] || SESSION_CONTEXT.evening;

  return `あなたは株式データアナリストです。客観的な事実に基づき、データの変化が顕著な注目銘柄を特定してください。
${ctx.intro}
以下のユーザーの投資スタイルを踏まえ、${ctx.focus}を7つ選んでください。

【今回の分析の時間軸と観点】
- 分析の時間軸: ${ctx.timeHorizon}
- 重視するシグナル: ${ctx.keySignals}
- 分析の目的: ${ctx.analysisContext}
- 注意すべきシグナル: ${ctx.cautionSignals}

【ユーザーの投資スタイル】
- 投資スタイル: ${styleLabel}
- 投資資金: ${budgetLabel}
${marketContext}${sectorTrendContext}
【候補銘柄一覧（詳細分析付き）】
以下はチャート分析・ファンダメンタル分析でスコアの高い銘柄です。
この中から、データの変化が顕著でユーザーの投資スタイルに関連性の高い銘柄を選んでください。

${stockSummaries}
${newsContext}
${PROMPT_MARKET_SIGNAL_DEFINITION}

【地政学リスク指標の活用】
- VIX（恐怖指数）が30以上の場合: 市場全体が強い不安状態であることを注記
- VIXが急上昇（前日比+20%以上）の場合: 短期的な急変動リスクが高いことを注記
- WTI原油価格が急騰（前日比+5%以上）の場合: エネルギーセクター銘柄はプラス材料、輸送・製造セクターはコスト増リスクとして注記
- WTI原油価格が急落（前日比-5%以上）の場合: エネルギーセクター銘柄は逆風、消費者向けセクターにはプラス材料として注記

【決算情報の活用】
- 決算7日以内の銘柄は highlightReason で必ず決算が近いことに言及してください
- 業績好調（黒字・増益）の場合は「決算への期待感」の文脈で
- 業績不振（赤字・減益）の場合は「決算リスク」として言及

【スタイル別の注目基準】
${
  investmentStyle === "CONSERVATIVE"
    ? `【安定配当型 - 配当と安定性に関連するデータ変化に注目】
- 配当利回りが高い銘柄（2%以上、特に4%以上）のデータ変化
- PBR（株価純資産倍率）が低い割安銘柄の動向
- PER（株価収益率）が低い銘柄の変動
- 大型株（時価総額が大きい銘柄）の出来高変化
- ボラティリティが低い銘柄（安定推移）の動向
- 黒字企業のみ対象、赤字銘柄は除外`
    : investmentStyle === "AGGRESSIVE"
      ? `【アクティブ型 - モメンタムと出来高変化に注目】
- モメンタム（勢い）のある銘柄の変化
- 出来高が急増している銘柄の動向
- 小型〜中型株で成長性の高い銘柄のデータ変化
- ボラティリティが高くても、黒字で成長性がある銘柄の動向
- ただし、赤字かつ高ボラティリティの銘柄は除外`
      : `【成長投資型 - 成長性と割安さのバランスに注目】
- 売上高成長率が高い企業（10%以上、特に20%以上）のデータ変化
- ROE（自己資本利益率）が高い企業の動向
- 成長企業でPBRやPERが割安な銘柄の変動
- 時価総額、成長性、安定性のバランスが良い銘柄の動向
- 黒字企業優先、高成長の赤字企業も条件次第で対象`
}

${
  ownedTickerCodes.length > 0
    ? `【ユーザーが保有している銘柄】
以下の銘柄はユーザーが保有中です: ${ownedTickerCodes.join(", ")}
- 保有銘柄でも注目すべきデータ変化があれば選んでください
- 保有銘柄を選んだ場合、highlightReason の冒頭に「【保有中】」と付けてください

`
    : ""
}${
  watchlistTickerCodes.length > 0
    ? `【ユーザーのウォッチリスト銘柄】
以下の銘柄はユーザーが「気になる」に登録しています: ${watchlistTickerCodes.join(", ")}
- ウォッチリスト銘柄でも注目すべきデータ変化があれば選んでください
- ウォッチリスト銘柄を選んだ場合、highlightReason の冒頭に「【注目銘柄】」と付けてください

`
    : ""
}【回答ルール】
- 必ず7銘柄を選んでください（候補が7未満なら全て選ぶ）
- 7銘柄中、同一セクター（業種）は最大2銘柄まで
- テクニカル指標（RSI、MACDなど）の客観的なデータを根拠にしてください
- 財務指標も根拠に含めてください
- 理由は専門用語を使いつつ、解説を添えてください
  例: 「RSI（売られすぎ・買われすぎの指標）が30を下回り、テクニカル的な反発ポイントに接近」
- 各銘柄の highlightReason には、なぜデータ上注目に値するかを客観的に記述してください
- marketSignal は候補全体を見て市場の雰囲気を判断してください
- 各銘柄に highlightType を1つ付けてください
  選択肢: "volume_spike" / "technical_change" / "price_movement" / "ma_divergence" / "earnings_upcoming" / "sector_trend"
  - volume_spike: 出来高が急増し、市場の注目が集まっている
  - technical_change: RSI反発、MACDクロスなどテクニカル指標に変化
  - price_movement: 価格の大幅変動（急騰・急落・反転）
  - ma_divergence: 移動平均線との乖離が拡大・縮小
  - earnings_upcoming: 決算発表が近く、業績データに注目
  - sector_trend: セクター全体のトレンドに連動した動き

【制約】
${PROMPT_NEWS_CONSTRAINTS}
- 赤字企業は「業績リスク」を highlightReason で必ず言及してください。減益傾向の企業も業績悪化リスクに触れてください
- 提供されたニュース情報がある場合は、判断の根拠として活用してください
- ニュースにない情報は推測や創作をしないでください
- 「〜すべき」「〜してください」「〜をお勧めします」等の行動指示は出さないでください。事実とデータに基づく客観的な分析のみ記述してください

【回答形式】
以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。

{
  "marketSignal": "bullish" | "neutral" | "bearish",
  "stocks": [
    {
      "tickerCode": "銘柄コード",
      "highlightType": "volume_spike" | "technical_change" | "price_movement" | "ma_divergence" | "earnings_upcoming" | "sector_trend",
      "highlightReason": "注目理由（この銘柄のデータ上の変化・特徴を客観的に記述、2-3文）",
      "position": 1
    }
  ]
}`;
}
