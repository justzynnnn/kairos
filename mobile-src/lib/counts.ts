/**
 * Badge counts are read out of the bootstrap payload, and the first paint after
 * an app update can come from a snapshot an older build wrote — before those
 * fields existed. Missing is zero, not NaN.
 */
export function badgeCount(value: number | undefined) {
  return typeof value === "number" ? value : 0;
}
