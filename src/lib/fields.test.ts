import { describe, expect, it } from "vitest";
import { fieldKeyFromLabel } from "@/lib/fields";

describe("fieldKeyFromLabel", () => {
  it("makes a lower-case snake key without accents", () => {
    expect(fieldKeyFromLabel("Área / Sistema", [])).toBe("area_sistema");
    expect(fieldKeyFromLabel("  IO High Range (20mA) ", [])).toBe("io_high_range_20ma");
  });

  it("never collides with builtin or taken keys", () => {
    expect(fieldKeyFromLabel("Tag", [])).toBe("tag_2");
    expect(fieldKeyFromLabel("Equipment", ["equipment", "equipment_2"])).toBe("equipment_3");
  });

  it("handles labels without letters or starting with digits", () => {
    expect(fieldKeyFromLabel("###", [])).toBe("column");
    expect(fieldKeyFromLabel("4-20 mA", [])).toBe("c_4_20_ma");
  });
});
