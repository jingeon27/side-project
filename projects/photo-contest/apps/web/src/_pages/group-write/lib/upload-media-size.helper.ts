/** requestPostUpload가 받는 긴 변 상한. API의 post-upload.policy와 같은 값이다. */
const MAX_MEDIA_SIDE = 20_000;

function isMediaSide(side: number) {
  return Number.isInteger(side) && side >= 1 && side <= MAX_MEDIA_SIDE;
}

/**
 * 브라우저가 잰 가로·세로 중 API가 받는 값만 보낸다. 크기는 화면 틀 비율에만 쓰는 값이라
 * 범위를 벗어나면 올리기를 막지 않고 비워서 예전 틀로 보여 준다.
 */
export function uploadMediaSize(size: { width: number; height: number } | null) {
  if (!size || !isMediaSide(size.width) || !isMediaSide(size.height)) return null;
  return size;
}
