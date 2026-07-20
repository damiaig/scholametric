import { describe, it, expect } from "vitest";
import { computeIntegerTicks } from "./chart-ticks";

describe("computeIntegerTicks", () => {
  it("produces distinct, evenly-spaced integers for a large max (the real bug's data shape)", () => {
    const ticks = computeIntegerTicks(104);
    expect(ticks).toEqual([0, 50, 100, 150]);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks.every(Number.isInteger)).toBe(true);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(104);
  });

  it("never collapses to a degenerate all-zero axis for a small max", () => {
    const ticks = computeIntegerTicks(1);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(1);
  });

  it("handles a zero max without dividing by zero or producing NaN", () => {
    const ticks = computeIntegerTicks(0);
    expect(ticks.every((tick) => Number.isFinite(tick))).toBe(true);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("keeps small integer domains tight (no unnecessary overshoot)", () => {
    const ticks = computeIntegerTicks(3);
    expect(ticks).toEqual([0, 1, 2, 3, 4]);
  });
});
