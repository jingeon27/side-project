'use client';

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

import { ZodError } from 'zod';

import type { TProject } from '../../story/model/story';
import { fetchLibrary, removeProject, saveProject } from '../api/library-client';
import {
  libraryKey,
  outboxKey,
  pendingSaves,
  readLibrary,
  readOutbox,
  removedIds,
  type TPending,
  type TSynced,
} from '../model/library';

const saveFailed =
  '작품을 이 컴퓨터에 저장하지 못했습니다. 작업실 서버가 실행 중인지 확인해 주세요. 화면을 열어 두면 다시 저장합니다.';

// Works are files in the studio's data folder. This hook keeps the browser's copy and saves each
// changed work back, stating the version it started from so a work changed elsewhere is not overwritten.
export function useLibrary(initialProjects: (stored: TProject[]) => TProject[]) {
  const [projects, setProjects] = useState<TProject[]>([]);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState('');
  const synced = useRef<TSynced>(new Map());
  const saving = useRef(Promise.resolve(true));
  // A queued flush (including one requested by an event handler) uses the latest committed edits.
  const latest = useRef({ loaded, projects });
  useLayoutEffect(() => {
    latest.current = { loaded, projects };
  }, [loaded, projects]);
  const openLibrary = useEffectEvent((stored = projects) => setProjects(initialProjects(stored)));

  // A work that arrives from the studio, such as scenes a writing job saved, is already in sync.
  const adopt = useCallback((project: TProject) => {
    synced.current.set(project.id, { project, revision: project.updatedAt });
    setProjects((current) =>
      current.some((item) => item.id === project.id)
        ? current.map((item) => (item.id === project.id ? project : item))
        : [project, ...current],
    );
  }, []);
  const send = useCallback(
    async (pending: TPending, signal?: AbortSignal) => {
      return pending.reduce<Promise<number>>(async (previous, item) => {
        const count = await previous;
        signal?.throwIfAborted();
        const result = await saveProject(item.project, item.base);
        signal?.throwIfAborted();
        if ('saved' in result) {
          synced.current.set(item.project.id, { project: item.project, revision: item.project.updatedAt });
          return count;
        }
        adopt(result.conflict);
        return count + 1;
      }, Promise.resolve(0));
    },
    [adopt],
  );
  const flush = useCallback(() => {
    const run = saving.current.then(async () => {
      const snapshot = latest.current;
      if (!snapshot.loaded) return false;
      try {
        const removed = removedIds(snapshot.projects, synced.current);
        const conflicts = await send(pendingSaves(snapshot.projects, synced.current));
        await Promise.all(
          removed.map(async (id) => {
            await removeProject(id);
            synced.current.delete(id);
          }),
        );
        if (snapshot === latest.current) localStorage.removeItem(outboxKey);
        setSaveError(
          conflicts ? '다른 곳에서 바뀐 작품을 다시 불러왔습니다. 방금 고친 내용을 확인해 주세요.' : '',
        );
        return conflicts === 0;
      } catch {
        setSaveError(saveFailed);
        return false;
      }
    });
    saving.current = run;
    return run;
  }, [send]);
  const stash = useEffectEvent(() => {
    if (!loaded) return;
    const pending = pendingSaves(projects, synced.current);
    try {
      if (pending.length) localStorage.setItem(outboxKey, JSON.stringify(pending));
    } catch {
      /* The outbox is a second chance; the save below is still attempted. */
    }
    void flush();
  });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        // Edits the last visit could not save go first, then works still kept in the old browser storage.
        await send(readOutbox(localStorage), controller.signal);
        controller.signal.throwIfAborted();
        localStorage.removeItem(outboxKey);
        try {
          const raw = localStorage.getItem(libraryKey);
          await send(
            readLibrary(localStorage).map((project) => ({ project, base: null })),
            controller.signal,
          );
          controller.signal.throwIfAborted();
          if (raw !== null) {
            localStorage.setItem(`${libraryKey}.moved`, raw);
            localStorage.removeItem(libraryKey);
          }
        } catch (error) {
          if (!(error instanceof SyntaxError) && !(error instanceof ZodError)) throw error;
          setLoadError(
            '이전 브라우저 저장본을 읽지 못했습니다. 원본은 보존했습니다. 필요한 작품은 JSON 백업으로 가져와 주세요.',
          );
        }
        const library = await fetchLibrary(controller.signal);
        controller.signal.throwIfAborted();
        synced.current = new Map(
          library.projects.map((project) => [project.id, { project, revision: project.updatedAt }]),
        );
        openLibrary(library.projects);
        setLoaded(true);
        if (library.unreadable)
          setLoadError(`읽지 못한 작품 파일이 ${library.unreadable}개 있습니다. 파일은 그대로 보존했습니다.`);
      } catch {
        if (controller.signal.aborted) return;
        setLoadError('작품을 불러오지 못했습니다. 작업실 서버가 실행 중인지 확인한 뒤 새로고침해 주세요.');
        openLibrary();
      }
      if (!controller.signal.aborted) setReady(true);
    })();
    return () => controller.abort();
  }, [send]);
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => void flush(), 500);
    return () => clearTimeout(timer);
  }, [projects, loaded, flush]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') stash();
    };
    const pageHidden = () => stash();
    window.addEventListener('pagehide', pageHidden);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      // Leaving the studio for another page saves what the half second delay still holds.
      stash();
      window.removeEventListener('pagehide', pageHidden);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  return { projects, setProjects, ready, storageError: saveError || loadError, adopt, flush };
}
