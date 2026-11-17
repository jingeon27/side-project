import { isAbsolute, relative, sep } from 'node:path';

// path가 root와 같지 않고 root 아래에 있는지 경로 구성 요소로 판정한다. 비교 기준은 호출한 파일 위치와 무관하다.
export const inside = (root: string, path: string) => {
  const difference = relative(root, path);
  return (
    difference !== '' && !isAbsolute(difference) && difference !== '..' && !difference.startsWith('..' + sep)
  );
};
