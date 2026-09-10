import { NextResponse } from "next/server";
import { analyzeChart } from "@/lib/ai/provider";
import { validateImage } from "@/lib/validation/image";
import type { Direction } from "@/types/analysis";

export const runtime = "nodejs";
const directions = new Set<Direction>(["LONG", "SHORT", "NEUTRAL", "UNKNOWN"]);
export async function POST(request: Request) {
  try {
    const form = await request.formData(); const image = form.get("image");
    if (!(image instanceof File)) return NextResponse.json({ error: "Attach a chart image to analyze." }, { status: 400 });
    const validationError = validateImage(image);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const suppliedDirection = String(form.get("direction") || "UNKNOWN") as Direction;
    const direction = directions.has(suppliedDirection) ? suppliedDirection : "UNKNOWN";
    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const result = await analyzeChart(`data:${image.type};base64,${base64}`, { symbol: String(form.get("symbol") || "") || undefined, timeframe: String(form.get("timeframe") || "") || undefined, direction });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to analyze this chart right now.";
    const status = message.includes("configuration") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
