import { Phase } from '@/shared/api/generated';
export function phaseLabel(value: Phase) {
  return {
    UPCOMING: '시작 예정',
    SUBMISSION: '사진 모집 중',
    VOTING: '투표 진행 중',
    COMPLETED: '대회 종료',
  }[value];
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}
export function localDate(value: Date) {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 완료하지 못했습니다. 다시 시도해 주세요.';
}
