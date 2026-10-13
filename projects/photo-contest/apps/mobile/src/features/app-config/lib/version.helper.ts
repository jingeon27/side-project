const VERSION_PREFIX = /^(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?/;

/** 스토어 빌드가 `1.2`나 `1.2.3 (45)`처럼 줘도 비교할 수 있게 `x.y.z`로 맞춘다. 숫자로 시작하지 않으면 null. */
export function normalizeVersion(value: string | null | undefined) {
  const match = value?.trim().match(VERSION_PREFIX);
  if (!match) return null;
  return [match[1], match[2], match[3]].map((part) => String(Number(part ?? '0'))).join('.');
}

/** 앞에서부터 처음 읽을 수 있는 버전. 브리지 앱 정보와 User-Agent가 `x.y.z`만 받기 때문이다. */
export function pickAppVersion(...candidates: (string | null | undefined)[]) {
  for (const candidate of candidates) {
    const version = normalizeVersion(candidate);
    if (version) return version;
  }
  return null;
}

/** 숫자 단위로 비교한다 (`1.0.10` > `1.0.9`). 읽을 수 없는 값이 있으면 null. */
export function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left)?.split('.').map(Number);
  const rightParts = normalizeVersion(right)?.split('.').map(Number);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

/** 버전을 읽을 수 없으면 막지 않는다. 잘못된 설정 하나로 모든 사용자가 갇히지 않게 하기 위해서다. */
export function isUpdateRequired(currentVersion: string, minimumVersion: string) {
  return compareVersions(currentVersion, minimumVersion) === -1;
}
