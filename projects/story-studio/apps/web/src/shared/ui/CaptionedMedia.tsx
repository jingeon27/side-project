'use client';

import { useCallback, type ComponentProps } from 'react';

function useCaptionTrack(captions?: string) {
  return useCallback(
    (track: HTMLTrackElement | null) => {
      if (!track || !captions) return;
      const url = URL.createObjectURL(new Blob([captions], { type: 'text/vtt;charset=utf-8' }));
      track.src = url;
      return () => {
        track.removeAttribute('src');
        URL.revokeObjectURL(url);
      };
    },
    [captions],
  );
}

export function CaptionedAudio({
  captions,
  ...props
}: Omit<ComponentProps<'audio'>, 'children'> & { captions: string | undefined }) {
  const track = useCaptionTrack(captions);
  return (
    <audio {...props}>
      <track ref={track} kind="captions" srcLang="ko" label="한국어" />
    </audio>
  );
}

export function CaptionedVideo({
  captions,
  ...props
}: Omit<ComponentProps<'video'>, 'children'> & { captions: string | undefined }) {
  const track = useCaptionTrack(captions);
  return (
    <video {...props}>
      <track ref={track} kind="captions" srcLang="ko" label="한국어" />
    </video>
  );
}
