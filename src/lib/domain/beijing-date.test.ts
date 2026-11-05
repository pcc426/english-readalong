import { describe, expect, it } from "vitest";
import {
  beijingDateOf,
  beijingMonthOf,
  beijingToday,
  beijingWeekStart,
  daysInMonth,
  isValidMonth,
  leadingBlanks,
  monthDates,
  monthLabel,
  monthRange,
  shiftDate,
  shiftMonth,
} from "./beijing-date";

describe("beijing-date", () => {
  it("SQLite UTC 字符串按 +8 折算，跨北京午夜正确", () => {
    expect(beijingDateOf("2026-11-04 16:30:00")).toBe("2026-11-05");
    expect(beijingDateOf("2026-11-04 15:59:59")).toBe("2026-11-04");
    expect(beijingDateOf("2026-11-04T16:30:00Z")).toBe("2026-11-05");
  });

  it("周一为每周起点", () => {
    expect(beijingWeekStart("2026-11-02")).toBe("2026-11-02");
    expect(beijingWeekStart("2026-11-05")).toBe("2026-11-02");
    expect(beijingWeekStart("2026-11-08")).toBe("2026-11-02");
  });

  it("月份工具覆盖闰年与跨年", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29);
    expect(monthDates("2026-02")).toHaveLength(28);
    expect(monthDates("2024-02")[28]).toBe("2024-02-29");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthRange("2026-11", 11)).toHaveLength(12);
    expect(monthRange("2026-11", 11)[11]).toBe("2025-12");
    expect(isValidMonth("2026-11")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("26-11")).toBe(false);
  });

  it("monthLabel 输出中文年月", () => {
    expect(monthLabel("2026-11")).toBe("2026年11月");
  });

  it("shiftDate 跨月跨年", () => {
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("月历前置空格按周一起算", () => {
    // 2026-11-01 是周日 → 前面 6 个空格
    expect(leadingBlanks("2026-11")).toBe(6);
    // 2026-06-01 是周一 → 0 个空格
    expect(leadingBlanks("2026-06")).toBe(0);
  });

  it("beijingToday 使用注入时钟", () => {
    expect(beijingToday(new Date("2026-11-04T16:30:00Z"))).toBe("2026-11-05");
    expect(beijingMonthOf("2026-11-04 16:30:00")).toBe("2026-11");
  });
});
