export function mediaRange(header: string, size: number) {
  const matched = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!matched || (!matched[1] && !matched[2]) || size <= 0) return null;
  const start = matched[1] ? Number(matched[1]) : Math.max(0, size - Number(matched[2]));
  const end = matched[1] && matched[2] ? Math.min(Number(matched[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end };
}
