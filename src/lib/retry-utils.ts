/**
 * リトライユーティリティ
 *
 * ネットワークエラー・レートリミット時の指数バックオフリトライ
 */

import { YAHOO_FINANCE } from "./constants";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * リトライ可能なエラーか判定（429 + ネットワークエラー）
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  // 429 Rate Limit
  if (msg.includes("Too Many Requests") || msg.includes("429")) return true;
  // ネットワークエラー
  if (
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("fetch failed") ||
    msg.includes("ENETUNREACH") ||
    msg.includes("EAI_AGAIN")
  )
    return true;
  // cause チェーン
  const cause = (error as { cause?: { code?: string } }).cause;
  if (cause?.code === "ETIMEDOUT" || cause?.code === "ECONNRESET") return true;
  return false;
}

/**
 * リトライ可能エラー時に指数バックオフでリトライ
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  prefix = "",
): Promise<T> {
  for (let attempt = 0; attempt < YAHOO_FINANCE.RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (
        !isRetryableError(error) ||
        attempt >= YAHOO_FINANCE.RETRY_MAX_ATTEMPTS - 1
      ) {
        throw error;
      }
      const delay = YAHOO_FINANCE.RETRY_BASE_DELAY_MS * 2 ** attempt;
      const errCode =
        error instanceof Error ? error.message.slice(0, 40) : "unknown";
      const tag = prefix ? `[${prefix}]` : "";
      console.warn(
        `${tag} ${label}: リトライ ${attempt + 1}/${YAHOO_FINANCE.RETRY_MAX_ATTEMPTS} after ${delay}ms [${errCode}]`,
      );
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}
