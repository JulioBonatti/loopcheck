import { describe, expect, it } from "vitest";
import { formatPercent, ratio } from "@/lib/metrics";

describe("ratio", () => {
  it("is null without countable tags", () => {
    expect(ratio(0, 0)).toBeNull();
  });

  it("is the share of the total", () => {
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe("formatPercent", () => {
  it("shows a dash when there is nothing to count", () => {
    expect(formatPercent(0, 0)).toBe("—");
  });

  it("rounds down, so 100% means really done", () => {
    expect(formatPercent(0, 3)).toBe("0%");
    expect(formatPercent(2, 3)).toBe("66%");
    expect(formatPercent(999, 1000)).toBe("99%");
    expect(formatPercent(1000, 1000)).toBe("100%");
  });
});
