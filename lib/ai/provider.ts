import OpenAI from "openai";
import { analysisSchema, type AnalysisSchema } from "@/lib/analysis/schema";
import { normalizeAnalysis } from "@/lib/analysis/normalize";
import type { AnalysisResult, Direction } from "@/types/analysis";

export interface ChartAnalysisOptions {
  symbol?: string;
  timeframe?: string;
  direction?: Direction;
}

/**
 * BullGPT must analyze the ACTUAL visible chart.
 *
 * Important:
 * - Never invent prices.
 * - Never assume a trend without visible evidence.
 * - Read the price axis and candle structure.
 * - Use visible levels only.
 * - If a value truly cannot be read, use null/UNKNOWN.
 * - Do not turn a lack of analysis into a fake valid setup.
 */
const instructions = `
You are BullGPT, a professional technical chart-analysis engine.

Your task is to analyze the supplied TradingView screenshot itself.

IMPORTANT:
1. Inspect the actual image before answering.
2. Read the visible price scale, candles, swing highs, swing lows, volume and any visible indicators.
3. Determine the visible market structure from the candles:
   - higher highs / higher lows
   - lower highs / lower lows
   - range / consolidation
   - transition
4. Determine the visible trend.
5. Identify support and resistance ONLY from levels actually visible or strongly inferable from repeated price reactions.
6. Determine whether a trade setup is actually visible.
7. If a setup is visible, provide a technically justified entry, stop loss and target.
8. If no reliable entry is visible, entry may be null. Do NOT invent one.
9. Explain WHY the market structure and trend were classified as they were.
10. Give bullish and bearish scenarios based on the visible chart.
11. Probabilities must total exactly 100.
12. Confidence must reflect image quality and strength of evidence.
13. Never invent a symbol, timeframe, price or indicator.
14. Never claim an indicator exists if it is not visible.
15. Do not use generic trading advice instead of analyzing the screenshot.
16. Return ONLY JSON. No markdown. No commentary.

The JSON must contain every field required by the BullGPT schema.

For unknown numeric values use null.
For unknown classifications use UNKNOWN or UNCLEAR.
For absent support/resistance use [].
For limitations use an array of strings.

A useful analysis is more important than filling fields with generic text.
If the chart is readable, extract as much concrete information from it as possible.
`;

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const raw = value.trim();

    if (!raw) return null;

    const cleaned = raw.replace(/[^\d,.-]/g, "");

    if (!cleaned) return null;

    let normalized = cleaned;

    // Handle common European number formatting:
    // 1.234,56 -> 1234.56
    if (cleaned.includes(".") && cleaned.includes(",")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    }
    // Handle decimal comma:
    // 1,234 -> 1.234
    else if (cleaned.includes(",") && !cleaned.includes(".")) {
      normalized = cleaned.replace(",", ".");
    }

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asString(value: unknown, fallback = "UNCLEAR"): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Converts common AI formatting mistakes into the exact shape
 * expected by the existing schema.
 *
 * This does NOT invent chart prices.
 */
function completePayload(input: unknown): unknown {
  const value =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  const market =
    value.market_structure &&
    typeof value.market_structure === "object"
      ? (value.market_structure as Record<string, unknown>)
      : {};

  const trend =
    value.trend &&
    typeof value.trend === "object"
      ? (value.trend as Record<string, unknown>)
      : {};

  const setup =
    value.setup &&
    typeof value.setup === "object"
      ? (value.setup as Record<string, unknown>)
      : {};

  const probabilities =
    value.probabilities &&
    typeof value.probabilities === "object"
      ? (value.probabilities as Record<string, unknown>)
      : {};

  const entryAssessment =
    value.entry_assessment &&
    typeof value.entry_assessment === "object"
      ? (value.entry_assessment as Record<string, unknown>)
      : {};

  const stopAssessment =
    value.stop_loss_assessment &&
    typeof value.stop_loss_assessment === "object"
      ? (value.stop_loss_assessment as Record<string, unknown>)
      : {};

  const targetAssessment =
    value.take_profit_assessment &&
    typeof value.take_profit_assessment === "object"
      ? (value.take_profit_assessment as Record<string, unknown>)
      : {};

  const confluence =
    value.confluence &&
    typeof value.confluence === "object"
      ? (value.confluence as Record<string, unknown>)
      : {};

  const bullish =
    value.bullish_scenario &&
    typeof value.bullish_scenario === "object"
      ? (value.bullish_scenario as Record<string, unknown>)
      : {};

  const bearish =
    value.bearish_scenario &&
    typeof value.bearish_scenario === "object"
      ? (value.bearish_scenario as Record<string, unknown>)
      : {};

  let bullishProbability = asNumber(probabilities.bullish);
  let bearishProbability = asNumber(probabilities.bearish);

  if (bullishProbability === null && bearishProbability === null) {
    bullishProbability = 50;
    bearishProbability = 50;
  } else if (bullishProbability === null) {
    bullishProbability = 100 - (bearishProbability ?? 0);
  } else if (bearishProbability === null) {
    bearishProbability = 100 - bullishProbability;
  }

  bullishProbability = Math.max(
    0,
    Math.min(100, bullishProbability ?? 50)
  );

  bearishProbability = Math.max(
    0,
    Math.min(100, bearishProbability ?? 50)
  );

  const probabilityTotal = bullishProbability + bearishProbability;

  if (probabilityTotal > 0 && probabilityTotal !== 100) {
    bullishProbability =
      (bullishProbability / probabilityTotal) * 100;

    bearishProbability = 100 - bullishProbability;
  }

  const normalizeLevels = (
    levels: unknown,
    type: "SUPPORT" | "RESISTANCE"
  ) =>
    asArray<Record<string, unknown>>(levels)
      .map((item) => ({
        price: asNumber(item?.price),
        type,
        importance: ["HIGH", "MEDIUM", "LOW"].includes(
          String(item?.importance)
        )
          ? item.importance
          : "LOW",
        reason: asString(item?.reason),
      }))
      .filter((item) => item.price !== null);

  const normalizeScenario = (
    scenario: Record<string, unknown>,
    probability: number
  ) => ({
    probability,
    description: asString(scenario.description),
    confirmation: asString(scenario.confirmation),
    target:
      scenario.target === null || scenario.target === undefined
        ? null
        : typeof scenario.target === "number"
          ? String(scenario.target)
          : asString(scenario.target),
    invalidation: asString(scenario.invalidation),
  });

  return {
    asset:
      value.asset === null || value.asset === undefined
        ? null
        : asString(value.asset),

    timeframe:
      value.timeframe === null || value.timeframe === undefined
        ? null
        : asString(value.timeframe),

    direction: ["LONG", "SHORT", "NEUTRAL", "UNKNOWN"].includes(
      String(value.direction)
    )
      ? value.direction
      : "UNKNOWN",

    current_price: asNumber(value.current_price),
    entry: asNumber(value.entry),
    stop_loss: asNumber(value.stop_loss),
    take_profit: asNumber(value.take_profit),
    risk_reward: asNumber(value.risk_reward),

    market_structure: {
      classification: [
        "BULLISH",
        "BEARISH",
        "RANGING",
        "TRANSITIONING",
        "UNCLEAR",
      ].includes(String(market.classification))
        ? market.classification
        : "UNCLEAR",

      score: asNumber(market.score),
      explanation: asString(market.explanation),
    },

    trend: {
      classification: [
        "BULLISH",
        "BEARISH",
        "NEUTRAL",
        "UNCLEAR",
      ].includes(String(trend.classification))
        ? trend.classification
        : "UNCLEAR",

      explanation: asString(trend.explanation),
    },

    setup: {
      score: asNumber(setup.score),

      quality: [
        "STRONG",
        "GOOD",
        "FAIR",
        "WEAK",
        "UNCLEAR",
      ].includes(String(setup.quality))
        ? setup.quality
        : "UNCLEAR",

      explanation: asString(setup.explanation),
    },

    probabilities: {
      bullish: bullishProbability,
      bearish: bearishProbability,
    },

    confidence: Math.max(
      0,
      Math.min(100, asNumber(value.confidence) ?? 0)
    ),

    entry_assessment: {
      quality: ["GOOD", "FAIR", "WEAK", "UNKNOWN"].includes(
        String(entryAssessment.quality)
      )
        ? entryAssessment.quality
        : "UNKNOWN",

      explanation: asString(entryAssessment.explanation),
    },

    stop_loss_assessment: {
      quality: ["GOOD", "FAIR", "WEAK", "UNKNOWN"].includes(
        String(stopAssessment.quality)
      )
        ? stopAssessment.quality
        : "UNKNOWN",

      explanation: asString(stopAssessment.explanation),
    },

    take_profit_assessment: {
      quality: ["GOOD", "FAIR", "WEAK", "UNKNOWN"].includes(
        String(targetAssessment.quality)
      )
        ? targetAssessment.quality
        : "UNKNOWN",

      explanation: asString(targetAssessment.explanation),
    },

    support_levels: normalizeLevels(
      value.support_levels,
      "SUPPORT"
    ),

    resistance_levels: normalizeLevels(
      value.resistance_levels,
      "RESISTANCE"
    ),

    confluence: {
      score: asNumber(confluence.score),

      factors: asArray<unknown>(
        confluence.factors
      ).filter(
        (item): item is string => typeof item === "string"
      ),
    },

    risk_flags: asArray<unknown>(
      value.risk_flags
    ).filter(
      (item): item is string => typeof item === "string"
    ),

    bullish_scenario: normalizeScenario(
      bullish,
      Math.round(bullishProbability)
    ),

    bearish_scenario: normalizeScenario(
      bearish,
      Math.round(bearishProbability)
    ),

    overall_assessment: asString(
      value.overall_assessment
    ),

    limitations: asArray<unknown>(
      value.limitations
    ).filter(
      (item): item is string => typeof item === "string"
    ),
  };
}

function parseAndValidate(
  raw: string
): AnalysisSchema | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const completed = completePayload(parsed);
  const validated = analysisSchema.safeParse(completed);

  if (!validated.success) {
    console.error(
      "BULLGPT_SCHEMA_VALIDATION_FAILED:",
      JSON.stringify(validated.error.issues, null, 2)
    );

    console.error(
      "BULLGPT_COMPLETED_PAYLOAD:",
      JSON.stringify(completed, null, 2)
    );

    return null;
  }

  return validated.data;
}

/**
 * Reject obviously empty analyses.
 *
 * This prevents the UI from showing a fake "successful" analysis
 * consisting almost entirely of UNKNOWN / UNCLEAR values.
 */
function hasUsefulAnalysis(
  analysis: AnalysisSchema
): boolean {
  const hasPrice =
    analysis.current_price !== null;

  const hasLevels =
    analysis.support_levels.length > 0 ||
    analysis.resistance_levels.length > 0;

  const hasStructure =
    analysis.market_structure.classification !== "UNCLEAR" &&
    analysis.market_structure.explanation !== "UNCLEAR";

  const hasTrend =
    analysis.trend.classification !== "UNCLEAR" &&
    analysis.trend.explanation !== "UNCLEAR";

  const hasSetup =
    analysis.setup.quality !== "UNCLEAR" ||
    analysis.setup.score !== null;

  const hasScenarioExplanation =
    analysis.bullish_scenario.description !== "UNCLEAR" ||
    analysis.bearish_scenario.description !== "UNCLEAR";

  const evidenceCount = [
    hasPrice,
    hasLevels,
    hasStructure,
    hasTrend,
    hasSetup,
    hasScenarioExplanation,
  ].filter(Boolean).length;

  return evidenceCount >= 3;
}

export async function analyzeChart(
  imageDataUrl: string,
  options: ChartAnalysisOptions
): Promise<AnalysisResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "AI configuration is unavailable. Add OPENAI_API_KEY on the server and try again."
    );
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const context = `
User-provided context, which is NOT verified chart evidence:
symbol=${options.symbol || "not supplied"}
timeframe=${options.timeframe || "not supplied"}
direction=${options.direction || "AUTO"}
`;

  /*
   * Keep this configurable through Vercel.
   *
   * Current default remains gpt-4o-mini so your existing deployment
   * does not suddenly fail because of an unavailable model.
   *
   * For better chart analysis, set OPENAI_VISION_MODEL in Vercel
   * to a stronger vision-capable model available to your API account.
   */
  const model =
    process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

  const imageMessage = {
    type: "image_url" as const,
    image_url: {
      url: imageDataUrl,
      detail: "high" as const,
    },
  };

  async function requestJson(
    extraInstruction?: string
  ): Promise<string | null> {
    const response =
      await client.chat.completions.create({
        model,
        response_format: {
          type: "json_object",
        },
        temperature: extraInstruction ? 0 : 0.05,

        messages: [
          {
            role: "system",
            content: instructions,
          },

          {
            role: "user",
            content: [
              {
                type: "text",
                text: `
${context}

${
  extraInstruction ||
  `
Analyze the supplied TradingView screenshot now.

First inspect the chart visually.

Identify:
- visible asset/symbol
- visible timeframe
- current price if readable
- recent swing highs and lows
- market structure
- trend
- support
- resistance
- volume/visible indicators
- whether there is a valid setup
- entry, stop and target if technically justified
- bullish scenario
- bearish scenario
- confidence
- limitations

Do not answer from generic knowledge about the asset.
Use the screenshot as the primary source of evidence.
`
}
`,
              },

              imageMessage,
            ],
          },
        ],
      });

    return response.choices[0]?.message.content ?? null;
  }

  // -------------------------
  // FIRST ANALYSIS
  // -------------------------

  const raw = await requestJson();

  if (!raw) {
    throw new Error(
      "The analysis service returned no result."
    );
  }

  let validated = parseAndValidate(raw);

  // -------------------------
  // RETRY IF STRUCTURE FAILED
  // -------------------------

  if (!validated) {
    let parsedForIssues: unknown;

    try {
      parsedForIssues = JSON.parse(raw);
    } catch {
      throw new Error(
        "The analysis service returned unreadable JSON."
      );
    }

    const normalized =
      completePayload(parsedForIssues);

    const issues =
      analysisSchema.safeParse(normalized);

    const details = issues.success
      ? "The response did not satisfy the required analysis structure."
      : issues.error.issues
          .slice(0, 12)
          .map(
            (issue) =>
              `${issue.path.join(".") || "root"}: ${issue.message}`
          )
          .join("; ");

    console.error(
      "BULLGPT_FIRST_RESPONSE:",
      raw
    );

    console.error(
      "BULLGPT_VALIDATION_DETAILS:",
      details
    );

    const retryRaw = await requestJson(`
Your previous chart-analysis response could not be accepted.

Validation issue:
${details}

Analyze the IMAGE again.

Do not merely repeat the previous answer.

Read the visible chart carefully and return a complete JSON object.

Pay particular attention to:
- current visible price
- candle direction and recent momentum
- swing highs
- swing lows
- market structure
- trend
- support levels
- resistance levels
- setup quality
- entry
- stop loss
- take profit
- bullish scenario
- bearish scenario

If a number genuinely cannot be read, use null.
Do not invent numbers.

All required fields must still be present.
Probabilities must total 100.
Return JSON only.
`);

    if (retryRaw) {
      validated = parseAndValidate(retryRaw);
    }
  }

  if (!validated) {
    throw new Error(
      "The analysis service could not produce a valid chart analysis."
    );
  }

  // -------------------------
  // QUALITY CHECK
  // -------------------------

  if (!hasUsefulAnalysis(validated)) {
    console.error(
      "BULLGPT_ANALYSIS_TOO_WEAK:",
      JSON.stringify(validated, null, 2)
    );

    const retryRaw = await requestJson(`
The previous answer was structurally valid but the actual chart analysis
was too weak.

Analyze the screenshot again from scratch.

Do NOT return a generic or mostly-UNCLEAR analysis.

Extract concrete visible evidence from the chart:
- current price if readable
- market structure
- trend
- recent highs/lows
- support
- resistance
- visible momentum
- setup quality
- bullish scenario
- bearish scenario

If the chart genuinely does not provide enough evidence for a particular
field, use null or UNKNOWN for that field.

However, do not mark the entire analysis UNCLEAR when the chart contains
readable candles and price information.

Return only the complete JSON object.
`);

    if (retryRaw) {
      const retryValidated =
        parseAndValidate(retryRaw);

      if (retryValidated) {
        validated = retryValidated;
      }
    }
  }

  console.log(
    "BULLGPT_FINAL_ANALYSIS:",
    JSON.stringify(validated, null, 2)
  );

  return normalizeAnalysis(validated);
}
