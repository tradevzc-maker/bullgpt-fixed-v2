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
You are BullGPT, a professional technical chart-analysis engine specialized in visual TradingView chart analysis.

Analyze the ACTUAL SUPPLIED IMAGE. Do not answer from generic trading knowledge.

CORE RULE:
Use only information that can be visually established from the screenshot. Never invent a price, level, indicator, setup or market condition.

IMAGE ANALYSIS PROCESS:

1. FIRST inspect the complete chart image carefully.
2. Identify the visible asset/symbol and timeframe ONLY if clearly readable.
3. Read the visible price scale and estimate prices ONLY when the scale is sufficiently readable.
4. Analyze the candle sequence from left to right.
5. Identify meaningful swing highs and swing lows.
6. Determine whether price is making:
   - higher highs + higher lows
   - lower highs + lower lows
   - a range/consolidation
   - a transition
   - or insufficient evidence.
7. Analyze the MOST RECENT price action with greater weight than old price action.
8. Identify support and resistance from actual repeated reactions, swing points, consolidation boundaries or clearly visible horizontal levels.
9. Do not create support/resistance merely because a price looks convenient.
10. Check the complete screenshot for visible indicators. Only use an indicator if it is actually visible and readable.
11. Determine whether a technically meaningful trade setup is visible.

MARKET STRUCTURE:

Classify market structure based on actual swing structure.

For BEARISH structure, look for evidence such as:
- lower highs
- lower lows
- rejection from previous highs
- breakdowns of previous lows

For BULLISH structure, look for:
- higher highs
- higher lows
- successful support reactions
- breakouts of previous highs

For RANGING structure, look for:
- repeated reactions between identifiable boundaries
- lack of sustained higher highs/higher lows or lower highs/lower lows

For TRANSITIONING structure, use evidence of a meaningful change in structure.

Do not classify something as BULLISH or BEARISH without explaining the visible evidence.

TREND:

Determine the current visible trend independently from market structure.

The explanation MUST contain concrete chart evidence.
Do not write "UNCLEAR" as the explanation when the chart is readable.

SETUP:

Only call a setup STRONG or GOOD when there is actual technical evidence supporting it.

Consider:
- current market structure
- trend
- recent swing
- support/resistance
- breakout or rejection
- pullback/retest
- visible momentum
- risk/reward if entry, stop and target can be justified

If no reliable setup exists, use:
quality: "UNCLEAR"
score: null
and clearly explain why.

ENTRY / STOP LOSS / TAKE PROFIT:

Only provide numerical entry, stop loss or take profit when the chart provides enough visual evidence to justify the level.

Never invent precise prices.

If the price scale is readable but an exact trade level cannot be justified:
- use null
- explain why.

If a setup exists:
- ENTRY should be based on an actual visible price area or structure.
- STOP LOSS should be beyond the relevant invalidation/swing level.
- TAKE PROFIT should target a visible support/resistance area or technically justified objective.

SUPPORT AND RESISTANCE:

Only include levels supported by visible price reactions.

For every level provide:
- price
- type
- importance
- reason

The reason must describe the visible evidence, for example:
"Price reacted from this area multiple times."

Do not fabricate exact precision when the screenshot does not support it.

SCENARIOS:

Create one bullish scenario and one bearish scenario.

Each scenario must contain:
- probability
- description
- confirmation
- target
- invalidation

The scenarios must be based on the actual chart.

The confirmation and invalidation fields must describe concrete conditions visible on the chart, not generic trading advice.

PROBABILITIES:

Bullish and bearish probabilities must total EXACTLY 100.

They are scenario probabilities, NOT guaranteed predictions.

Do not automatically make one scenario 100% unless the image provides extremely strong directional evidence.

CONFIDENCE:

Confidence must reflect:
- image readability
- price-scale readability
- clarity of candle structure
- strength of trend evidence
- quality of support/resistance evidence
- clarity of the potential setup

A readable chart with clear structure should generally have higher confidence than an unclear screenshot.

LIMITATIONS:

Explicitly list anything that prevents reliable analysis, such as:
- unreadable price scale
- cropped chart
- insufficient historical candles
- hidden indicators
- unclear timeframe
- unclear symbol
- insufficient evidence for a trade setup

IMPORTANT OUTPUT RULES:

- Return ONLY one valid JSON object.
- No markdown.
- No commentary.
- No explanation outside the JSON.
- Include EVERY field required by the BullGPT schema.
- Unknown numeric values MUST be null.
- Unknown text classifications MUST use the allowed UNKNOWN/UNCLEAR values.
- Missing support/resistance MUST be [].
- Never invent information to fill a field.
- Never claim an indicator is present unless it is visibly present.
- Never substitute generic trading advice for chart analysis.
- Every important classification must have a concrete explanation based on visible evidence.
- If the chart is readable, DO NOT unnecessarily return "UNCLEAR".
- If evidence is genuinely insufficient, return UNCLEAR and explain exactly what is missing.

QUALITY STANDARD:

The output should read like a professional technical analyst inspected the screenshot manually.

Prefer:
"Recent price action shows lower highs and lower lows, followed by a break below the previous swing low."

Avoid:
"The trend looks bearish."

Prefer:
"Resistance is around X because price rejected this area multiple times."

Avoid:
"Resistance is at a key level."

Prefer:
"No reliable entry is visible because price is between the latest swing low and resistance without a confirmed breakout or rejection."

Avoid:
"Entry is unclear."

Return the complete BullGPT JSON object now.
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
    process.env.OPENAI_VISION_MODEL || "gpt-5.6-terra";

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
