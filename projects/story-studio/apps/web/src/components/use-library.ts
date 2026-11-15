'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { libraryKey, readLibrary, writeLibrary } from '../lib/library';
import type { TProject } from '../lib/story';

export function useLibrary() {
  const [projects, setProjects] = useState<TProject[]>([]);
  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState(false);
  const [storageError, setStorageError] = useState('');
  const serialized = useRef<string | undefined>(undefined);
  const flush = useEffectEvent(() => {
    if (!ready || !writable) return;
    try {
      serialized.current = writeLibrary(localStorage, projects, serialized.current);
      setStorageError('');
    } catch {
      setStorageError(
        '자동 저장하지 못했습니다. 저장 공간,브라우저 설정을 확인하고, 현재 작품을 JSON으로 백업해 주세요.',
      );
    }
  });
  useEffect(() => {
    try {
      const saved = readLibrary(localStorage);
      serialized.current = JSON.stringify(saved);
      setProjects(saved);
      setWritable(true);
    } catch {
      setStorageError(
        '기존 저장본을 읽지 못했습니다. 원본은 보존했습니다. 새 작업은 자동 저장되지 않으므로 JSON으로 백업해 주세요.',
      );
    }
    setReady(true);
    const changed = (event: StorageEvent) => {
      if (event.key === null || event.key === libraryKey) {
        setWritable(false);
        setStorageError(
          '다른 창에서 작품이 변경되었습니다. 덮어쓰지 않도록 자동 저장을 멈췄습니다. 현재 작품을 JSON으로 백업한 뒤 새로고침해 주세요.',
        );
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  useEffect(() => {
    if (!ready || !writable) return;
    const timer = setTimeout(() => flush(), 500);
    return () => clearTimeout(timer);
  }, [projects, ready, writable]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const pageHidden = () => flush();
    window.addEventListener('pagehide', pageHidden);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      flush();
      window.removeEventListener('pagehide', pageHidden);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  return { projects, setProjects, ready, storageError };
}
