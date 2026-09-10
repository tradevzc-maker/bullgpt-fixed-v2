export type Direction = "LONG" | "SHORT" | "NEUTRAL" | "UNKNOWN";
export type Quality = "STRONG" | "GOOD" | "FAIR" | "WEAK" | "UNCLEAR";
export type AssessmentQuality = "GOOD" | "FAIR" | "WEAK" | "UNKNOWN";

export interface Level { price: number | null; type: "SUPPORT" | "RESISTANCE"; importance: "HIGH" | "MEDIUM" | "LOW"; reason: string; }
export interface Scenario { probability: number; description: string; confirmation: string; target: string | null; invalidation: string; }
export interface AnalysisResult {
  asset: string | null; timeframe: string | null; direction: Direction;
  current_price: number | null; entry: number | null; stop_loss: number | null; take_profit: number | null; risk_reward: number | null;
  market_structure: { classification: "BULLISH" | "BEARISH" | "RANGING" | "TRANSITIONING" | "UNCLEAR"; score: number | null; explanation: string };
  trend: { classification: "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCLEAR"; explanation: string };
  setup: { score: number | null; quality: Quality; explanation: string };
  probabilities: { bullish: number; bearish: number }; confidence: number;
  entry_assessment: { quality: AssessmentQuality; explanation: string };
  stop_loss_assessment: { quality: AssessmentQuality; explanation: string };
  take_profit_assessment: { quality: AssessmentQuality; explanation: string };
  support_levels: Level[]; resistance_levels: Level[];
  confluence: { score: number | null; factors: string[] }; risk_flags: string[];
  bullish_scenario: Scenario; bearish_scenario: Scenario; overall_assessment: string; limitations: string[];
}
