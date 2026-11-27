'use client';

import { useId, useState, type ReactNode } from 'react';

import { Play } from 'lucide-react';

import { Button } from '@side/design-system/ui/button';

import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';

import { shortsEmbedUrl, type TShortsSource } from './source';

interface IShortsPlayerProps {
  source: TShortsSource;
  title: string;
  episode?: string;
  children?: ReactNode;
}

export function ShortsPlayer({ source, title, episode, children }: IShortsPlayerProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const playLabel = source.kind === 'playlist' ? '쇼츠 모아보기' : '쇼츠 플레이어 열기';

  const handleToggle = () => {
    if (!open) {
      track(event.ShortsPlayerOpened, episode ? { surface: 'episode', episode } : { surface: 'story-list' });
    }
    setOpen(!open);
  };

  return (
    <section className="shorts-panel" aria-labelledby={children ? undefined : id + '-title'}>
      <div className="shorts-panel-header">
        {children ?? <h3 id={id + '-title'}>{title}</h3>}
        <Button
          variant="secondary"
          icon={open ? undefined : <Play size={16} aria-hidden />}
          aria-expanded={open}
          aria-controls={id}
          onClick={handleToggle}
        >
          {open ? '플레이어 닫기' : playLabel}
        </Button>
      </div>
      <div id={id} hidden={!open}>
        {open && (
          <iframe
            className="shorts-player"
            title={title}
            src={shortsEmbedUrl(source)}
            allow="encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        )}
      </div>
    </section>
  );
}
