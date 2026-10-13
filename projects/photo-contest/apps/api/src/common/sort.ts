/** 실행 환경의 locale에 따라 순서가 바뀌지 않도록 코드 포인트 순으로 비교한다. */
export function compareText(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
