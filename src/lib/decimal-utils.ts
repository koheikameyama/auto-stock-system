/**
 * Decimal カラムのバリデーション & 異常値検知ユーティリティ
 *
 * - DB の Decimal(precision, scale) に収まるよう値をクランプ
 * - クランプが発生した場合は異常値として検知（上場廃止の疑い）
 */

import { prisma } from "./prisma";
import { STOCK_FETCH } from "./constants";

// ── Decimal クランプ ──────────────────────────────

const DECIMAL_MAX: Record<string, number> = {
  "8,2": 999_999.99,
  "10,2": 99_999_999.99,
  "12,2": 9_999_999_999.99,
};

/**
 * Decimal(precision, scale) の範囲に収める。
 * NaN/Infinity/null/undefined は null を返す。
 * 範囲外の値はクランプされる。
 */
export function clampDecimal(
  value: number | null | undefined,
  spec: "8,2" | "10,2" | "12,2",
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const max = DECIMAL_MAX[spec];
  return Math.max(-max, Math.min(max, value));
}

/**
 * 値が Decimal の範囲を超えているか（異常値か）を判定する。
 * null/NaN/Infinity も異常値扱い（ただし元が null の場合は false）。
 */
export function isDecimalOverflow(
  value: number | null | undefined,
  spec: "8,2" | "10,2" | "12,2",
): boolean {
  if (value === null || value === undefined) return false;
  if (!Number.isFinite(value)) return true;
  const max = DECIMAL_MAX[spec];
  return Math.abs(value) > max;
}

// ── 上場廃止判定 ──────────────────────────────

/**
 * 異常データ検知時の fetchFailCount インクリメント & 廃止判定を一括実行する。
 *
 * @param stockIds 異常が検知された銘柄IDの配列
 * @param currentCounts 各銘柄の現在の fetchFailCount（id → count のMap）
 * @returns 廃止扱いにした銘柄数
 */
export async function incrementFailAndMarkDelisted(
  stockIds: string[],
  currentCounts: Map<string, number>,
): Promise<number> {
  if (stockIds.length === 0) return 0;

  // fetchFailCount を一括インクリメント
  await prisma.stock.updateMany({
    where: { id: { in: stockIds } },
    data: { fetchFailCount: { increment: 1 } },
  });

  // 閾値超え → 廃止
  const delistIds = stockIds.filter(
    (id) => (currentCounts.get(id) ?? 0) + 1 >= STOCK_FETCH.FAIL_THRESHOLD,
  );

  if (delistIds.length > 0) {
    await prisma.stock.updateMany({
      where: { id: { in: delistIds } },
      data: { isDelisted: true },
    });
    console.log(
      `  ⚠ 異常データ閾値超過: ${delistIds.length}件を上場廃止扱いに変更`,
    );
  }

  return delistIds.length;
}
