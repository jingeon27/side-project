import { useEffect, useState } from 'react';

import { createUseFunnel, type AnyFunnelState } from '@use-funnel/core';

import { isCaseStep, playPath } from './case-file';
import { matchesPagePath, receiptLandingPath } from './case-routes';

interface IInvestigationFunnelRoutes {
  landing: string;
  play: string;
  isStep: (value: unknown) => boolean;
}

export function createInvestigationFunnel({ landing, play, isStep }: IInvestigationFunnelRoutes) {
  function readBrowserRoute(id: string) {
    const separatePlayPage = landing !== play;
    const playing = separatePlayPage && matchesPagePath(window.location.pathname, play);
    const entries: unknown = window.history.state?.[id];
    if (!Array.isArray(entries) || !entries.length) return { playing };
    const valid = entries.every(
      (entry: unknown) =>
        !!entry &&
        typeof entry === 'object' &&
        'step' in entry &&
        (entry.step === 'landing' || isStep(entry.step)) &&
        'context' in entry &&
        !!entry.context,
    );
    if (!valid) return { playing };
    const playingInHistory = isStep(entries.at(-1)?.step);
    if (separatePlayPage && playing !== playingInHistory) return { playing };
    return { playing: playingInHistory, entries: entries as AnyFunnelState[] };
  }

  // Investigation steps live in browser history so shared URLs open the case introduction.
  return createUseFunnel(({ id, initialState }) => {
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
      url.pathname = playing ? play : landing;
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
}

export const useInvestigationFunnel = createInvestigationFunnel({
  landing: receiptLandingPath,
  play: playPath,
  isStep: isCaseStep,
});
