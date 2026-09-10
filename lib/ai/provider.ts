import OpenAI from "openai";
import { analysisSchema, type AnalysisSchema } from "@/lib/analysis/schema";
import { normalizeAnalysis } from "@/lib/analysis/normalize";
import type { AnalysisResult, Direction } from "@/types/analysis";

export interface ChartAnalysisOptions { symbol?: string; timeframe?: string; direction?: Direction; }

const instructions = `You are BullGPT, a cautious chart-analysis system. Inspect only visible evidence in the supplied chart screenshot. Return ONE JSON object containing every field in the required structure. Never omit fields. Unknown numeric values must be null. Do not invent prices, symbols, indicators, timeframe, levels, entries, stops, targets, or certainty. Probabilities are relative scenarios and must total 100. Be concise, evidence-based, and explicitly list limitations. For absent levels use empty lists; for weak evidence use UNKNOWN or UNCLEAR.`;

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/[^0-9,.-]/g, "");
    const normalized = cleaned.includes(".") && cleaned.includes(",")
      ? cleaned.replace(/,/g, "")
      : cleaned.replace(/,/g, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown, fallback = "UNCLEAR"): string {
  return typeof value === "string" ? value : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Vision models occasionally return a semantically useful object but omit one
 * or two optional/unknown fields. This fills only fields whose safe value is
 * explicitly known; it never invents chart prices or technical levels.
 */
function completePayload(input: unknown): unknown {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const market = (value.market_structure && typeof value.market_structure === "object" ? value.market_structure : {}) as Record<string, unknown>;
  const trend = (value.trend && typeof value.trend === "object" ? value.trend : {}) as Record<string, unknown>;
  const setup = (value.setup && typeof value.setup === "object" ? value.setup : {}) as Record<string, unknown>;
  const probabilities = (value.probabilities && typeof value.probabilities === "object" ? value.probabilities : {}) as Record<string, unknown>;
  const entry = (value.entry_assessment && typeof value.entry_assessment === "object" ? value.entry_assessment : {}) as Record<string, unknown>;
  const stop = (value.stop_loss_assessment && typeof value.stop_loss_assessment === "object" ? value.stop_loss_assessment : {}) as Record<string, unknown>;
  const target = (value.take_profit_assessment && typeof value.take_profit_assessment === "object" ? value.take_profit_assessment : {}) as Record<string, unknown>;
  const confluence = (value.confluence && typeof value.confluence === "object" ? value.confluence : {}) as Record<string, unknown>;
  const bullish = (value.bullish_scenario && typeof value.bullish_scenario === "object" ? value.bullish_scenario : {}) as Record<string, unknown>;
  const bearish = (value.bearish_scenario && typeof value.bearish_scenario === "object" ? value.bearish_scenario : {}) as Record<string, unknown>;

  let bullishProbability = asNumber(probabilities.bullish);
  let bearishProbability = asNumber(probabilities.bearish);
  if (bullishProbability === null && bearishProbability === null) {
    bullishProbability = 50;
    bearishProbability = 50;
  } else if (bullishProbability === null) {
    bullishProbability = Math.max(0, Math.min(100, 100 - (bearishProbability as number)));
  } else if (bearishProbability === null) {
    bearishProbability = Math.max(0, Math.min(100, 100 - bullishProbability));
  }

  // Keep the two scenario probabilities internally consistent. normalizeAnalysis
  // will perform the final rounding and 100%-sum enforcement.
  const total = (bullishProbability as number) + (bearishProbability as number);
  if (total > 0 && Math.abs(total - 100) > 0.001) {
    bullishProbability = ((bullishProbability as number) / total) * 100;
    bearishProbability = 100 - (bullishProbability as number);
  }

  const normalizeLevels = (levels: unknown, type: "SUPPORT" | "RESISTANCE") => asArray<Record<string, unknown>>(levels).map((item) => ({
    price: asNumber(item?.price),
    type,
    importance: ["HIGH", "MEDIUM", "LOW"].includes(String(item?.importance)) ? item.importance : "LOW",
    reason: asString(item?.reason, "UNCLEAR"),
  }));

  const normalizeScenario = (scenario: Record<string, unknown>, probability: number) => ({
    probability,
    description: asString(scenario.description),
    confirmation: asString(scenario.confirmation),
    target: scenario.target === null || scenario.target === undefined
      ? null
      : typeof scenario.target === "number" ? String(scenario.target) : asString(scenario.target, "UNCLEAR"),
    invalidation: asString(scenario.invalidation),
  });

  return {
    asset: value.asset === null || value.asset === undefined ? null : asString(value.asset, "UNCLEAR"),
    timeframe: value.timeframe === null || value.timeframe === undefined ? null : asString(value.timeframe, "UNCLEAR"),
    direction: ["LONG", "SHORT", "NEUTRAL", "UNKNOWN"].includes(String(value.direction)) ? value.direction : "UNKNOWN",
    current_price: asNumber(value.current_price),
    entry: asNumber(value.entry),
    stop_loss: asNumber(value.stop_loss),
    take_profit: asNumber(value.take_profit),
    risk_reward: asNumber(value.risk_reward),
    market_structure: {
      classification: ["BULLISH", "BEARISH", "RANGING", "TRANSITIONING", "UNCLEAR"].includes(String(market.classification)) ? market.classification : "UNCLEAR",
      score: asNumber(market.score),
      explanation: asString(market.explanation),
    },
    trend: {
      classification: ["BULLISH", "BEARISH", "NEUTRAL", "UNCLEAR"].includes(String(trend.classification)) ? trend.classification : "UNCLEAR",
      explanation: asString(trend.explanation),
    },
    setup: {
      score: asNumber(setup.score),
      quality: ["STRONG", "GOOD", "FAIR", "WEAK", "UNCLEAR"].includes(String(setup.quality)) ? setup.quality : "UNCLEAR",
      explanation: asString(setup.explanation),
    },
    probabilities: {
      bullish: Math.max(0, Math.min(100, bullishProbability as number)),
      bearish: Math.max(0, Math.min(100, bearishProbability as number)),
    },
    confidence: Math.max(0, Math.min(100, asNumber(value.confidence) ?? 0)),
    entry_assessment: {
      quality: ["GOOD", "FAIR", "WEAK", "UNKNOWN"].includes(String(entry.quality)) ? entry.quality : "UNKNOWN",
      explanation: asString(entry.explanation),
    },
    stop_loss_assessment: {
      quality: ["GOOD", "FAIR", "WEAK", "UNKNOWN"].includes(String(stop.quality)) ? stop.quality : "UNKNOWN",
      explanation: asString(stop.explanation),
    },
    take_profit_assessment: {
      quality: ["GOOD", "FAIR", "WEAK", "UNKNOWN"].includes(String(target.quality)) ? target.quality : "UNKNOWN",
      explanation: asString(target.explanation),
    },
    support_levels: normalizeLevels(value.support_levels, "SUPPORT"),
    resistance_levels: normalizeLevels(value.resistance_levels, "RESISTANCE"),
    confluence: {
      score: asNumber(confluence.score),
      factors: asArray<unknown>(confluence.factors).filter((item): item is string => typeof item === "string"),
    },
    risk_flags: asArray<unknown>(value.risk_flags).filter((item): item is string => typeof item === "string"),
    bullish_scenario: normalizeScenario(bullish, Math.round(bullishProbability as number)),
    bearish_scenario: normalizeScenario(bearish, Math.round(bearishProbability as number)),
    overall_assessment: asString(value.overall_assessment),
    limitations: asArray<unknown>(value.limitations).filter((item): item is string => typeof item === "string"),
  };
}

function parseAndValidate(raw: string): AnalysisSchema | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const completed = completePayload(parsed);
  const validated = analysisSchema.safeParse(completed);
  return validated.success ? validated.data : null;
}

export async function analyzeChart(imageDataUrl: string, options: ChartAnalysisOptions): Promise<AnalysisResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("AI configuration is unavailable. Add OPENAI_API_KEY on the server and try again.");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const context = `User context (not verified chart evidence): symbol=${options.symbol || "not supplied"}; timeframe=${options.timeframe || "not supplied"}; direction=${options.direction || "AUTO"}.`;
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const imageMessage = { type: "image_url" as const, image_url: { url: imageDataUrl, detail: "high" as const } };

  async function requestJson(extraInstruction?: string) {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: extraInstruction ? 0 : 0.1,
      messages: [
        { role: "system", content: instructions },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${context}\n${extraInstruction || "Analyze this chart and return only one complete JSON object with every required field."}`,
            },
            imageMessage,
          ],
        },
      ],
    });
    return response.choices[0]?.message.content;
  }

  const raw = await requestJson();
  if (!raw) throw new Error("The analysis service returned no result.");

  let validated = parseAndValidate(raw);

  // A second pass gives the model the exact validation failures. The first pass
  // is deliberately cheap; the repair pass is only used when needed.
  if (!validated) {
    let parsedForIssues: unknown;
    try {
      parsedForIssues = JSON.parse(raw);
    } catch {
      throw new Error("The analysis service returned an unreadable result.");
    }

    const issues = analysisSchema.safeParse(completePayload(parsedForIssues));
    const details = issues.success
      ? "The object was normalized but still did not satisfy the required structure."
      : issues.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");

    const retryRaw = await requestJson(
      `Your previous answer was incomplete. Return a COMPLETE JSON object now. Keep every field, including nested fields and both scenarios. Use null for unknown numeric values, [] for absent arrays, UNKNOWN/UNCLEAR for unknown classifications, and numeric probabilities totaling 100. Do not add markdown or commentary. Validation details: ${details}`
    );

    if (retryRaw) validated = parseAndValidate(retryRaw);
  }

  if (!validated) throw new Error("The analysis service returned an invalid analysis. Please try again.");
  return normalizeAnalysis(validated);
}
