const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date (YYYY-MM-DD) of an instant in Cairo time. */
export function cairoDate(time: Date = new Date()): string {
  const parts = Object.fromEntries(formatter.formatToParts(time).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

/** First UTC instant of a Cairo calendar date (handles DST midnight jumps). */
export function dayStart(date: string): string {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  let lo = midnight - 18 * 3600000;
  let hi = midnight + 18 * 3600000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2000) * 1000;
    if (cairoDate(new Date(mid)) < date) lo = mid;
    else hi = mid;
  }
  return new Date(hi).toISOString();
}

/** Hour (0-23) of an instant in Cairo time. */
export function cairoHour(value: Date | string): number {
  return (
    Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: 'numeric', hourCycle: 'h23' }).format(
        new Date(value),
      ),
    ) % 24
  );
}
