import { describe, expect, it } from "vitest";
import { validateImage } from "./image";
describe("validateImage", () => {
  it("accepts a valid image", () => expect(validateImage(new File(["x"], "chart.png", { type: "image/png" }))).toBeNull());
  it("rejects unsupported or empty uploads", () => { expect(validateImage(new File(["x"], "chart.gif", { type: "image/gif" }))).toContain("PNG"); expect(validateImage(new File([], "chart.png", { type: "image/png" }))).toContain("non-empty"); });
});
