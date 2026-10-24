const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a content date. Date-only values mean midnight in Asia/Seoul, the timezone the blog
 * displays, so they compare correctly with offset datetimes such as `2026-10-01T08:00:00+09:00`.
 */
export function parseContentDate(value: string): number {
  return Date.parse(dateOnly.test(value) ? `${value}T00:00:00+09:00` : value);
}
