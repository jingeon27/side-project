import { useMemo, useSyncExternalStore } from 'react';

const getServerUrl = () => null;

/**
 * 파일 하나의 blob 주소를 구독하는 동안만 만든다. 파일이 바뀌거나 화면이 사라져 구독이 끝나면 풀어 준다.
 * 렌더 중에 만들지 않으므로 StrictMode의 다시 구독에서도 풀린 주소를 보여 주지 않는다.
 */
function createObjectUrlStore(file: Blob | null) {
  const current: { url: string | null } = { url: null };
  return {
    subscribe: (onChange: () => void) => {
      if (!file) return () => undefined;
      current.url = URL.createObjectURL(file);
      onChange();
      return () => {
        if (current.url) URL.revokeObjectURL(current.url);
        current.url = null;
      };
    },
    getSnapshot: () => current.url,
  };
}

/** 고른 파일의 미리보기 주소. 파일이 없으면 null이고, 서버 렌더링에서도 null이다. */
export function useObjectUrl(file: Blob | null | undefined) {
  const store = useMemo(() => createObjectUrlStore(file ?? null), [file]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, getServerUrl);
}
