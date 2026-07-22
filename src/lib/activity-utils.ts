export type ActivityDay = {
  date: string;
  level: 0 | 1 | 2 | 3 | 4;
  count: number;
};

function previousDate(date: string) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

/** Counts consecutive active calendar days ending with the latest reported day. */
export function currentActivityStreak(days: ActivityDay[]) {
  const activityByDate = new Map(
    days.map((day) => [day.date, day.count] as const),
  );
  const latestDate = [...activityByDate.keys()].sort().at(-1);
  if (!latestDate) return 0;

  let streak = 0;
  let date = latestDate;
  while ((activityByDate.get(date) ?? 0) > 0) {
    streak += 1;
    date = previousDate(date);
  }
  return streak;
}
