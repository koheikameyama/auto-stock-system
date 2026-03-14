export type ScoringGateType = "liquidity" | "spread" | "volatility" | "earnings" | "dividend";

export interface ScoringGateResult {
  passed: boolean;
  failedGate: ScoringGateType | null;
}
