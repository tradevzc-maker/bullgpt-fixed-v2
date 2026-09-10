import { describe, expect, it } from "vitest";
import { calculateRiskReward } from "./normalize";
describe("calculateRiskReward", () => {
  it("calculates reward divided by risk", () => expect(calculateRiskReward(100, 95, 110)).toBe(2));
  it("returns null when an input is missing or risk is zero", () => { expect(calculateRiskReward(null, 95, 110)).toBeNull(); expect(calculateRiskReward(100, 100, 110)).toBeNull(); });
});
