'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/ui/@core/button';
export function PostMediaPreview({ file, src, onRemove }: { file: File; src: string; onRemove: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    return () => video?.pause();
  }, [src]);
  const handleLoaded = () => setStatus('ready');
  const handleUnavailable = () => setStatus('unavailable');

  return (
    <figure aria-label="선택한 파일 미리보기" className="flex flex-col gap-2">
      <div className="relative aspect-video max-h-80 overflow-hidden rounded-card bg-sunken">
        {status === 'unavailable' ? (
          <p
            role="status"
            className="flex h-full items-center justify-center px-5 text-center text-body text-muted"
          >
            미리보기를 열 수 없어요. 이 기기에서 재생할 수 있는 다른 사진이나 동영상을 선택해 주세요.
          </p>
        ) : file.type.startsWith('video/') ? (
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            preload="auto"
            aria-label="선택한 동영상 미리보기"
            onLoadedData={handleLoaded}
            onError={handleUnavailable}
            className="h-full w-full object-contain"
          />
        ) : (
          <Image
            src={src}
            alt="선택한 사진 미리보기"
            fill
            unoptimized
            sizes="calc(100vw - 40px)"
            onLoad={handleLoaded}
            onError={handleUnavailable}
            className="object-contain"
          />
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-caption wrap-break-word text-muted">{file.name}</span>
        <Button type="button" variant="ghost" size="md" onClick={onRemove}>
          선택한 파일 제거
        </Button>
      </figcaption>
      {status === 'loading' ? (
        <p role="status" className="text-caption text-muted">
          미리보기 불러오는 중
        </p>
      ) : null}
    </figure>
  );
}
