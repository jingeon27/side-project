'use client';

import { useEffect, useRef } from 'react';

import type { TTopic } from '@/shared/topics';

import { track } from './browser';
import { event } from './events';

type TView = { episode: string; topic: TTopic } | { episode?: undefined; topic?: undefined };

export function TrackView({ episode, topic }: TView) {
  const lastView = useRef('');
  useEffect(() => {
    const view = episode ?? 'journal';
    if (lastView.current === view) return;
    lastView.current = view;
    if (episode && topic) {
      const source =
        new URLSearchParams(window.location.search).get('utm_source') === 'youtube' ? 'youtube' : 'direct';
      track(event.EpisodeOpened, { episode, topic, source });
      return;
    }
    track(event.JournalOpened, {});
  }, [episode, topic]);
  return null;
}
