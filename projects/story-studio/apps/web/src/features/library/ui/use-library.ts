'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';

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
export function useLibrary() {
  const [projects, setProjects] = useState<TProject[]>([]);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState('');
  const synced = useRef<TSynced>(new Map());
  const saving = useRef<Promise<void>>(Promise.resolve());

  // A work that arrives from the studio, such as scenes a writing job saved, is already in sync.
  function adopt(project: TProject) {
    synced.current.set(project.id, { project, revision: project.updatedAt });
    setProjects((current) =>
      current.some((item) => item.id === project.id)
        ? current.map((item) => (item.id === project.id ? project : item))
        : [project, ...current],
    );
  }
  async function send(pending: TPending) {
    const conflicts = await pending.reduce<Promise<number>>(async (previous, item) => {
      const count = await previous;
      const result = await saveProject(item.project, item.base);
      if ('saved' in result) {
        synced.current.set(item.project.id, { project: item.project, revision: item.project.updatedAt });
        return count;
      }
      adopt(result.conflict);
      return count + 1;
    }, Promise.resolve(0));
    return conflicts;
  }
  const save = useEffectEvent(async () => {
    if (!loaded) return;
    try {
      const conflicts = await send(pendingSaves(projects, synced.current));
      await Promise.all(
        removedIds(projects, synced.current).map(async (id) => {
          await removeProject(id);
          synced.current.delete(id);
        }),
      );
      localStorage.removeItem(outboxKey);
      setSaveError(
        conflicts ? '다른 곳에서 바뀐 작품을 다시 불러왔습니다. 방금 고친 내용을 확인해 주세요.' : '',
      );
    } catch {
      setSaveError(saveFailed);
    }
  });
  // Saves run one after another; a save asked for meanwhile waits and then saves the latest state.
  const flush = useEffectEvent(() => {
    const run = saving.current.then(() => save());
    saving.current = run;
    return run;
  });
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
        await send(readOutbox(localStorage));
        localStorage.removeItem(outboxKey);
        try {
          const raw = localStorage.getItem(libraryKey);
          await send(readLibrary(localStorage).map((project) => ({ project, base: null })));
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
        synced.current = new Map(
          library.projects.map((project) => [project.id, { project, revision: project.updatedAt }]),
        );
        setProjects(library.projects);
        setLoaded(true);
        if (library.unreadable)
          setLoadError(`읽지 못한 작품 파일이 ${library.unreadable}개 있습니다. 파일은 그대로 보존했습니다.`);
      } catch {
        if (!controller.signal.aborted)
          setLoadError('작품을 불러오지 못했습니다. 작업실 서버가 실행 중인지 확인한 뒤 새로고침해 주세요.');
      }
      if (!controller.signal.aborted) setReady(true);
    })();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => void flush(), 500);
    return () => clearTimeout(timer);
  }, [projects, loaded]);
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
