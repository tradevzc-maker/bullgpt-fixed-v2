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

Analyze the ACTUAL TradingView screenshot supplied with the request.

Your job is to extract the maximum amount of useful technical information that is visibly supported by the chart.

IMPORTANT:
- Inspect the image itself before answering.
- Do not answer from generic knowledge about the asset.
- Do not invent prices, levels, indicators or setups.
- However, do NOT use UNKNOWN or UNCLEAR merely because you are not 100% certain.
- If the chart provides reasonable visual evidence, make the best evidence-based classification.
- Only use UNKNOWN/UNCLEAR when the information genuinely cannot be determined from the image.

CHART READING:

Carefully inspect:
- candlesticks
- recent price action
- swing highs
- swing lows
- higher highs
- higher lows
- lower highs
- lower lows
- breakouts
- breakdowns
- retests
- rejections
- consolidations
- support
- resistance
- volume
- every other indicator that is actually visible

Give more weight to the MOST RECENT price action than old candles.

MARKET STRUCTURE:

Classify the visible market structure as:
BULLISH, BEARISH, RANGING, TRANSITIONING or UNCLEAR.

Base the classification on actual swing structure.

For BEARISH structure, look for:
- lower highs
- lower lows
- failed recovery attempts
- breakdowns of previous lows

For BULLISH structure, look for:
- higher highs
- higher lows
- successful support reactions
- breakouts of previous highs

For RANGING structure, look for:
- repeated reactions between recognizable upper and lower boundaries.

The explanation MUST mention concrete visible evidence.

Example:
"Price formed a lower high near the previous swing high and then broke the preceding swing low, confirming a bearish sequence."

Do NOT write simply:
"Market structure is bearish."

TREND:

Classify the current visible trend as:
BULLISH, BEARISH, NEUTRAL or UNCLEAR.

Base it primarily on recent price action.

The explanation MUST describe concrete visible evidence.

SETUP:

Determine whether the chart currently offers a technically meaningful trade setup.

Classify quality as:
STRONG, GOOD, FAIR or WEAK.

Use UNCLEAR ONLY if the chart itself is genuinely unreadable.

Consider:
- market structure
- trend
- recent momentum
- support/resistance
- breakout or breakdown
- rejection
- pullback/retest
- current location of price
- potential risk/reward

IMPORTANT:

A directional bias does NOT automatically mean that a trade should be taken.

If the chart clearly has a bullish or bearish bias but there is no clean entry,
classify the setup as WEAK and explain why the setup is not actionable.

Do NOT turn a clearly readable bearish or bullish chart into UNCLEAR merely
because entry, stop or target cannot be established with sufficient precision.

Prefer:

"BEARISH BIAS — NO CLEAN ENTRY"

over:

"UNCLEAR"

when the directional evidence is clear but the trade trigger is missing.

ENTRY:

If a technically reasonable entry area can be derived from the visible chart, provide the numerical entry.

The entry may be based on:
- current price
- a visible breakout
- a retest
- a rejection
- a support/resistance reaction
- a clearly defined price zone

Do NOT require absolute certainty.

Do NOT invent a number when the price scale is genuinely unreadable.

STOP LOSS:

If a setup exists, place the stop logically beyond the relevant invalidation point.

For example:
- beyond a recent swing high for a short setup
- beyond a recent swing low for a long setup
- beyond a clearly broken support/resistance level

The stop must be technically connected to the chart structure.

TAKE PROFIT:

If a setup exists, identify the next technically meaningful target.

Prefer:
- visible support/resistance
- previous swing highs/lows
- range boundaries
- clearly visible reaction zones

Do not invent an arbitrary target simply to create a trade.

SUPPORT:

Identify visible support levels.

A support level can be based on:
- repeated price reactions
- swing lows
- consolidation boundaries
- strong rejection areas
- clearly visible horizontal levels

For each support provide:
- price
- type = SUPPORT
- importance = HIGH, MEDIUM or LOW
- reason

The reason must explain the visible evidence.

RESISTANCE:

Identify visible resistance levels using the same methodology.

For each resistance provide:
- price
- type = RESISTANCE
- importance = HIGH, MEDIUM or LOW
- reason

CURRENT PRICE:

Read the current price from the visible price axis if possible.

Do not invent it.

SCENARIOS:

Create TWO scenarios:

1. Bullish scenario
2. Bearish scenario

They must be based on the actual chart.

Each scenario must include:
- probability
- description
- confirmation
- target
- invalidation

The confirmation must be a concrete chart condition.

Example:
"Confirmation would be a reclaim and close above the recent lower-high resistance."

The invalidation must also be concrete.

Example:
"Invalidation occurs if price breaks and closes below the recent swing low."

Do NOT use "UNCLEAR" for these fields if you can describe a reasonable conditional scenario.

PROBABILITIES:

Bullish and bearish probabilities must total exactly 100.

These are relative scenario estimates, NOT guaranteed predictions.

Do NOT automatically use 50/50.

If the chart clearly favors one direction, reflect that.

Example:
BULLISH 30
BEARISH 70

Do not use extreme probabilities unless the evidence is exceptionally strong.

OVERALL ASSESSMENT:

The overall assessment MUST reflect the actual chart.

Do not automatically return UNCLEAR.

If the visible structure and trend clearly favor a direction, summarize that direction.

The assessment should mention:
- current directional bias
- main technical reason
- whether a clean setup exists

CONFIDENCE:

Confidence should reflect:
- chart readability
- quality of visible evidence
- clarity of market structure
- clarity of trend
- quality of support/resistance
- quality of the potential setup

Do not give high confidence simply because the chart is readable.

CONFLUENCE:

Identify actual confluences visible on the chart.

Possible examples:
- bearish structure + bearish trend
- resistance rejection + lower high
- support + bullish reversal
- breakout + retest
- volume expansion

Do not invent indicators that are not visible.

RISK FLAGS:

List actual risks visible from the chart.

Examples:
- price near major support
- conflicting structure
- low momentum
- range conditions
- insufficient confirmation
- poor risk/reward

LIMITATIONS:

Be honest about what cannot be determined from a static screenshot.

Do not use limitations as an excuse to avoid analysis.

OUTPUT:

Return ONLY ONE valid JSON object.

Return every field required by the BullGPT schema.

Unknown numeric values must be null.

Use UNKNOWN or UNCLEAR only when the information genuinely cannot be determined.

Support and resistance may be [] only when no reliable levels can actually be identified.

When the chart shows a visible swing high, swing low, repeated reaction,
consolidation boundary or rejection area, treat it as a potentially usable
support/resistance level.

Do not require multiple perfect touches.

A clearly visible recent swing high or swing low may be reported as
LOW or MEDIUM importance when it is technically relevant.

Never invent a level that cannot be supported by the visible price scale.

Never invent information.

The final answer must represent what a professional technical analyst could reasonably conclude from the supplied screenshot.

Before returning the JSON, mentally verify:

1. Does market structure have a concrete explanation?
2. Does trend have a concrete explanation?
3. Is there a reasonable overall assessment?
4. Did I identify visible support?
5. Did I identify visible resistance?
6. Did I determine whether a setup exists?
7. If a setup exists, did I provide entry, stop loss and target?
8. Are bullish and bearish scenarios concrete?
9. Do probabilities total exactly 100?
10. Did I avoid inventing information?

Return the complete JSON object now.
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

// Never fabricate 50/50.
// If the model omitted probabilities, derive a directional bias
// from the evidence it already extracted.
if (bullishProbability === null && bearishProbability === null) {
  const structureClassification = String(market.classification);
  const trendClassification = String(trend.classification);

  const bearishEvidence =
    structureClassification === "BEARISH" ? 1 : 0;
  const bullishEvidence =
    structureClassification === "BULLISH" ? 1 : 0;

  const bearishTrend =
    trendClassification === "BEARISH" ? 1 : 0;
  const bullishTrend =
    trendClassification === "BULLISH" ? 1 : 0;

  const bearishScore = bearishEvidence + bearishTrend;
  const bullishScore = bullishEvidence + bullishTrend;

  if (bearishScore > bullishScore) {
    bearishProbability = 70;
    bullishProbability = 30;
  } else if (bullishScore > bearishScore) {
    bullishProbability = 70;
    bearishProbability = 30;
  } else {
    // Only use neutral probabilities when the chart evidence
    // genuinely does not establish a directional edge.
    bullishProbability = 50;
    bearishProbability = 50;
  }
} else if (bullishProbability === null) {
  bearishProbability = Math.max(
    0,
    Math.min(100, bearishProbability ?? 50)
  );
  bullishProbability = 100 - bearishProbability;
} else if (bearishProbability === null) {
  bullishProbability = Math.max(
    0,
    Math.min(100, bullishProbability)
  );
  bearishProbability = 100 - bullishProbability;
}

bullishProbability = Math.max(
  0,
  Math.min(100, bullishProbability)
);

bearishProbability = Math.max(
  0,
  Math.min(100, bearishProbability)
);

const probabilityTotal =
  bullishProbability + bearishProbability;

if (probabilityTotal > 0 && probabilityTotal !== 100) {
  bullishProbability =
    (bullishProbability / probabilityTotal) * 100;

  bearishProbability =
    100 - bullishProbability;
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

    confidence: (() => {
  const modelConfidence = asNumber(value.confidence);

  if (modelConfidence !== null) {
    return Math.max(
      0,
      Math.min(100, modelConfidence)
    );
  }

  let score = 0;

  if (
    market.classification === "BULLISH" ||
    market.classification === "BEARISH"
  ) {
    score += 25;
  }

  if (
    trend.classification === "BULLISH" ||
    trend.classification === "BEARISH"
  ) {
    score += 20;
  }

  if (asNumber(value.current_price) !== null) {
    score += 15;
  }

  if (asArray(value.support_levels).length > 0) {
    score += 10;
  }

  if (asArray(value.resistance_levels).length > 0) {
    score += 10;
  }

  if (
    setup.quality === "STRONG" ||
    setup.quality === "GOOD" ||
    setup.quality === "FAIR"
  ) {
    score += 20;
  }

  return Math.max(0, Math.min(100, score));
})(),
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
  const hasReadableStructure =
    analysis.market_structure.classification !== "UNCLEAR" &&
    analysis.market_structure.explanation.trim().length > 20;

  const hasReadableTrend =
    analysis.trend.classification !== "UNCLEAR" &&
    analysis.trend.explanation.trim().length > 20;

  const hasPrice =
    analysis.current_price !== null;

  const hasLevels =
    analysis.support_levels.length > 0 ||
    analysis.resistance_levels.length > 0;

  const hasScenario =
    analysis.bullish_scenario.description !== "UNCLEAR" ||
    analysis.bearish_scenario.description !== "UNCLEAR";

  const hasScenarioConditions =
    analysis.bullish_scenario.confirmation !== "UNCLEAR" ||
    analysis.bearish_scenario.confirmation !== "UNCLEAR";

  const hasDirectionalEvidence =
    analysis.market_structure.classification === "BULLISH" ||
    analysis.market_structure.classification === "BEARISH" ||
    analysis.trend.classification === "BULLISH" ||
    analysis.trend.classification === "BEARISH";

  /*
   * A chart with readable structure/trend and directional evidence
   * is already useful, even when there is no actionable trade.
   *
   * This is important: "NO TRADE" is a valid analysis outcome.
   */
  if (
    hasReadableStructure &&
    hasReadableTrend &&
    hasDirectionalEvidence &&
    (hasPrice || hasLevels || hasScenarioConditions)
  ) {
    return true;
  }

  /*
   * For less directional charts, require more concrete evidence.
   */
  const evidenceCount = [
    hasPrice,
    hasLevels,
    hasReadableStructure,
    hasReadableTrend,
    hasScenario,
    hasScenarioConditions,
  ].filter(Boolean).length;

  return evidenceCount >= 4;
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
   * Current default remains gpt-5.6-terra so your existing deployment
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

A valid analysis does not require a valid trade.

If the chart has a clear directional structure but lacks a sufficiently
precise entry/stop/target, preserve the directional analysis and classify
the setup as WEAK.

Use "NO TRADE" reasoning rather than making the entire analysis UNKNOWN.

Do not erase readable support, resistance, structure, trend or scenarios
just because one trade field is unavailable.

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
