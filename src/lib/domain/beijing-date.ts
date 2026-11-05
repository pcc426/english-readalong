const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** SQLite datetime('now') 是 UTC 的 "YYYY-MM-DD HH:MM:SS"；补 Z 再解析。 */
export function parseDbUtc(value: string): Date {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
}

export function beijingDateOf(value: Date | string): string {
  const date = typeof value === "string" ? parseDbUtc(value) : value;
  return new Date(date.getTime() + BEIJING_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function beijingMonthOf(value: Date | string): string {
  return beijingDateOf(value).slice(0, 7);
}

export function beijingToday(now: Date = new Date()): string {
  return beijingDateOf(now);
}

export function shiftDate(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

/** 该日期所在周的周一（周一为 0，周日为 6）。 */
export function beijingWeekStart(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return shiftDate(date, -((utc.getUTCDay() + 6) % 7));
}

export function isValidMonth(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const monthNo = Number(month.slice(5, 7));
  return monthNo >= 1 && monthNo <= 12;
}

export function daysInMonth(month: string): number {
  const [year, monthNo] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
}

export function monthDates(month: string): string[] {
  return Array.from(
    { length: daysInMonth(month) },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`
  );
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNo] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNo - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(
    shifted.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [year, monthNo] = month.split("-").map(Number);
  return `${year}年${monthNo}月`;
}

/** current + 之前 monthsBack 个月；monthsBack=11 即共 12 个月。 */
export function monthRange(current: string, monthsBack: number): string[] {
  return Array.from({ length: monthsBack + 1 }, (_, index) =>
    shiftMonth(current, -index)
  );
}

/** 周一为第一列（0）；返回该月 1 日前面的空格数。 */
export function leadingBlanks(month: string): number {
  const [year, monthNo] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNo - 1, 1));
  return (first.getUTCDay() + 6) % 7;
}
