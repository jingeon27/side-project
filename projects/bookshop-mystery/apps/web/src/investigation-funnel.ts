import { useEffect, useState } from 'react';

import { createUseFunnel, type AnyFunnelState } from '@use-funnel/core';

import { isCaseStep, playPath } from './case-file';

function readBrowserRoute(id: string) {
  const playing = [playPath, '/play', playPath + 'index.html'].includes(window.location.pathname);
  const entries: unknown = window.history.state?.[id];
  if (!Array.isArray(entries) || !entries.length) return { playing };
  const valid = entries.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    return (
      'step' in entry &&
      (entry.step === 'landing' || isCaseStep(entry.step)) &&
      'context' in entry &&
      !!entry.context
    );
  });
  if (!valid || playing !== isCaseStep(entries.at(-1)?.step)) return { playing };
  return { playing, entries: entries as AnyFunnelState[] };
}

// The URL distinguishes the two pages. History state keeps investigation details off shared links.
export const useInvestigationFunnel = createUseFunnel(({ id, initialState }) => {
  const [route, setRoute] = useState(() => readBrowserRoute(id));
  const fallback = route.playing ? initialState : { step: 'landing', context: {} };
  const history = route.entries ?? [fallback];
  const currentIndex = history.length - 1;

  useEffect(() => {
    const handlePopState = () => setRoute(readBrowserRoute(id));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [id]);

  function commit(method: 'pushState' | 'replaceState', next: AnyFunnelState, entries: AnyFunnelState[]) {
    const playing = next.step !== 'landing';
    const url = new URL(window.location.href);
    url.pathname = playing ? playPath : '/';
    window.history[method]({ ...window.history.state, [id]: entries }, '', url);
    setRoute({ playing, entries });
  }

  return {
    history,
    currentIndex,
    currentState: history[currentIndex] ?? fallback,
    push(next) {
      if (!route.entries) window.history.replaceState({ ...window.history.state, [id]: history }, '');
      commit('pushState', next, [...history, next]);
    },
    replace(next) {
      commit('replaceState', next, [...history.slice(0, currentIndex), next]);
    },
    go(offset) {
      window.history.go(offset);
    },
    cleanup() {
      if (!window.history.state?.[id]) return;
      const nextState = { ...window.history.state };
      delete nextState[id];
      window.history.replaceState(nextState, '');
    },
  };
});
