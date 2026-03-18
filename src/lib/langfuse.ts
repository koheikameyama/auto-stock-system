/**
 * Langfuse トレーシング設定（OpenTelemetry ベース）
 *
 * @langfuse/openai v5 は OpenTelemetry を使用してトレーシングを行う。
 * LangfuseSpanProcessor を設定することで、input/output を含む全トレースデータが
 * Langfuse に送信される。
 *
 * 環境変数が未設定の場合は通常のOpenAIクライアントにフォールバックする。
 */

import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { setLangfuseTracerProvider } from "@langfuse/tracing";

// SDKは LANGFUSE_BASEURL を読むが、環境変数は LANGFUSE_BASE_URL で統一
if (process.env.LANGFUSE_BASE_URL && !process.env.LANGFUSE_BASEURL) {
  process.env.LANGFUSE_BASEURL = process.env.LANGFUSE_BASE_URL;
}

/** Langfuseが有効かどうか（環境変数の存在で判定） */
export function isLangfuseEnabled(): boolean {
  return !!(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
  );
}

// OTEL TracerProvider + LangfuseSpanProcessor を初期化
let spanProcessor: LangfuseSpanProcessor | null = null;

if (isLangfuseEnabled()) {
  try {
    spanProcessor = new LangfuseSpanProcessor();
    const provider = new NodeTracerProvider({
      spanProcessors: [spanProcessor],
    });
    setLangfuseTracerProvider(provider);
  } catch (error) {
    console.error("[langfuse] TracerProvider 初期化エラー:", error);
  }
}

/** observeOpenAI に渡すトレース設定 */
export interface TraceConfig {
  /** 生成の識別名（例: "assess-market", "review-trade"） */
  generationName: string;
  /** 追加メタデータ（銘柄コード等） */
  metadata?: Record<string, unknown>;
  /** セッションID（ジョブ実行単位で紐づけたい場合） */
  sessionId?: string;
  /** タグ（例: ["trading", "morning-analysis"]） */
  tags?: string[];
}

/**
 * Langfuseトレーシング付きOpenAIクライアントを取得する
 *
 * Langfuse環境変数が設定されていない場合は通常のOpenAIクライアントを返す。
 * Langfuseラッパーでエラーが発生した場合も通常のOpenAIクライアントにフォールバック。
 */
export function getTracedOpenAIClient(config: TraceConfig): OpenAI {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  if (!isLangfuseEnabled()) {
    return openai;
  }

  try {
    return observeOpenAI(openai, {
      generationName: config.generationName,
      generationMetadata: config.metadata,
      sessionId: config.sessionId,
      tags: config.tags,
    });
  } catch (error) {
    console.error(
      "[langfuse] ラッパー初期化エラー、通常クライアントにフォールバック:",
      error,
    );
    return openai;
  }
}

/**
 * Langfuseのバッファをフラッシュする
 * 短命プロセス（バッチジョブのCLI直接実行）の終了前に呼ぶ
 */
export async function flushLangfuse(): Promise<void> {
  if (!spanProcessor) return;

  try {
    await spanProcessor.forceFlush();
    await spanProcessor.shutdown();
  } catch (error) {
    console.error("[langfuse] flush エラー:", error);
  }
}
