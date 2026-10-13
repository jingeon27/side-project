const SERVICE_TIME_ZONE = 'Asia/Seoul';

const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: SERVICE_TIME_ZONE,
});
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: SERVICE_TIME_ZONE,
});
const countFormat = new Intl.NumberFormat('ko-KR');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `10월 14일 (화) 오후 3:00` 형태. 서버 시각(ISO)을 서비스 시간대로 보여 준다. */
export function formatDateTime(iso: string) {
  return dateTimeFormat.format(new Date(iso));
}

/** `2026년 10월 14일` */
export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso));
}

/** `1,234` */
export function formatCount(value: number) {
  return countFormat.format(value);
}

/** 마감까지 남은 시간. 지났으면 null. */
export function formatTimeLeft(targetIso: string, now: Date = new Date()) {
  const left = new Date(targetIso).getTime() - now.getTime();
  if (left <= 0) return null;
  if (left < MINUTE) return '곧 마감';
  if (left < HOUR) return `${Math.floor(left / MINUTE)}분 남음`;
  if (left < DAY) return `${Math.floor(left / HOUR)}시간 남음`;
  return `${Math.floor(left / DAY)}일 남음`;
}

/** `<input type="datetime-local">` 값. 입력창은 기기 시간대로 보여 주므로 기기 시간대로 만든다. */
export function toDateTimeLocalValue(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * MINUTE);
  return shifted.toISOString().slice(0, 16);
}

/** `<input type="datetime-local">` 값을 서버에 보낼 ISO 시각으로 바꾼다. 형식이 틀리면 null. */
export function fromDateTimeLocalValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
