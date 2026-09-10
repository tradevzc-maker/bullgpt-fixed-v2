import { describe, expect, it } from "vitest";
import { analysisSchema } from "./schema";
describe("analysis schema", () => {
  it("rejects malformed AI payloads", () => {
    expect(analysisSchema.safeParse({ asset: "BTC" }).success).toBe(false);
  });
});
