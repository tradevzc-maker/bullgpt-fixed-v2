import { z } from "zod";

const quality = z.enum(["STRONG", "GOOD", "FAIR", "WEAK", "UNCLEAR"]);
const assessmentQuality = z.enum(["GOOD", "FAIR", "WEAK", "UNKNOWN"]);
const level = z.object({ price: z.number().nullable(), type: z.enum(["SUPPORT", "RESISTANCE"]), importance: z.enum(["HIGH", "MEDIUM", "LOW"]), reason: z.string() });
const scenario = z.object({ probability: z.number().min(0).max(100), description: z.string(), confirmation: z.string(), target: z.string().nullable(), invalidation: z.string() });

export const analysisSchema = z.object({
  asset: z.string().nullable(), timeframe: z.string().nullable(), direction: z.enum(["LONG", "SHORT", "NEUTRAL", "UNKNOWN"]),
  current_price: z.number().nullable(), entry: z.number().nullable(), stop_loss: z.number().nullable(), take_profit: z.number().nullable(), risk_reward: z.number().nullable(),
  market_structure: z.object({ classification: z.enum(["BULLISH", "BEARISH", "RANGING", "TRANSITIONING", "UNCLEAR"]), score: z.number().min(0).max(100).nullable(), explanation: z.string() }),
  trend: z.object({ classification: z.enum(["BULLISH", "BEARISH", "NEUTRAL", "UNCLEAR"]), explanation: z.string() }),
  setup: z.object({ score: z.number().min(0).max(100).nullable(), quality, explanation: z.string() }),
  probabilities: z.object({ bullish: z.number().min(0).max(100), bearish: z.number().min(0).max(100) }), confidence: z.number().min(0).max(100),
  entry_assessment: z.object({ quality: assessmentQuality, explanation: z.string() }), stop_loss_assessment: z.object({ quality: assessmentQuality, explanation: z.string() }), take_profit_assessment: z.object({ quality: assessmentQuality, explanation: z.string() }),
  support_levels: z.array(level), resistance_levels: z.array(level), confluence: z.object({ score: z.number().min(0).max(100).nullable(), factors: z.array(z.string()) }), risk_flags: z.array(z.string()),
  bullish_scenario: scenario, bearish_scenario: scenario, overall_assessment: z.string(), limitations: z.array(z.string())
});
export type AnalysisSchema = z.infer<typeof analysisSchema>;
