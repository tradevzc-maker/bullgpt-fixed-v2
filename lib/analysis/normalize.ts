import { AnalysisSchema } from "@/lib/analysis/schema";

export function calculateRiskReward(entry: number | null, stop: number | null, target: number | null): number | null {
  if (entry === null || stop === null || target === null) return null;
  const risk = Math.abs(entry - stop); const reward = Math.abs(target - entry);
  return risk === 0 ? null : Number((reward / risk).toFixed(2));
}
export function normalizeAnalysis(value: AnalysisSchema): AnalysisSchema {
  const bullish = Math.round(Math.max(0, Math.min(100, value.probabilities.bullish)));
  const bearish = 100 - bullish;
  return { ...value, risk_reward: calculateRiskReward(value.entry, value.stop_loss, value.take_profit), probabilities: { bullish, bearish }, bullish_scenario: { ...value.bullish_scenario, probability: bullish }, bearish_scenario: { ...value.bearish_scenario, probability: bearish } };
}
