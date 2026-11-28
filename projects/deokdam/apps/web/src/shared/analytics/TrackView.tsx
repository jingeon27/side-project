'use client';

import { useCallback } from 'react';

import type { TTopic } from '@/shared/topics';

import { track } from './browser';
import { event } from './events';

type TView =
  | { episode: string; topic: TTopic; page?: never }
  | { episode?: undefined; topic?: undefined; page: 'stories' | 'journal' };

export function TrackView({ episode, topic, page }: TView) {
  const handleView = useCallback(
    (node: HTMLSpanElement | null) => {
      const view = episode ?? page;
      if (!node || node.dataset.seen === view) return;
      node.dataset.seen = view;
      if (episode && topic) {
        const source =
          new URLSearchParams(window.location.search).get('utm_source') === 'youtube' ? 'youtube' : 'direct';
        track(event.EpisodeOpened, { episode, topic, source });
        return;
      }
      track(page === 'stories' ? event.StoriesOpened : event.JournalOpened, {});
    },
    [episode, topic, page],
  );
  return <span hidden aria-hidden ref={handleView} />;
}
