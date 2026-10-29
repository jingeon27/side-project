'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';

import { match } from 'ts-pattern';

import { Button } from '@/shared/ui/@core/button';

interface IPostMediaPreviewProps {
  file: File;
  src: string;
  disabled?: boolean;
  onReplace: () => void;
  onRemove: () => void;
}

export function PostMediaPreview({ file, src, disabled, onReplace, onRemove }: IPostMediaPreviewProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const handleVideoRef = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    return () => video.pause();
  }, []);
  const handleLoaded = () => setStatus('ready');
  const handleUnavailable = () => setStatus('unavailable');

  return (
    <figure aria-label="선택한 파일 미리보기" className="flex flex-col gap-2">
      <div className="relative aspect-video max-h-80 overflow-hidden rounded-card bg-sunken desktop:aspect-square desktop:max-h-[40dvh]">
        {match({ status, video: file.type.startsWith('video/') })
          .with({ status: 'unavailable' }, () => (
            <p
              role="status"
              className="flex h-full items-center justify-center px-5 text-center text-body text-muted"
            >
              미리보기를 열 수 없어요. 이 기기에서 재생할 수 있는 다른 사진이나 동영상을 선택해 주세요.
            </p>
          ))
          .with({ video: true }, () => (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- 올리기 전에 고른 파일을 확인하는 미리보기라 자막 파일이 없다.
            <video
              key={src}
              ref={handleVideoRef}
              src={src}
              controls
              playsInline
              preload="auto"
              aria-label="선택한 동영상 미리보기"
              onLoadedData={handleLoaded}
              onError={handleUnavailable}
              className="h-full w-full object-contain"
            />
          ))
          .with({ video: false }, () => (
            <Image
              src={src}
              alt="선택한 사진 미리보기"
              fill
              unoptimized
              sizes="(min-width: 1024px) 540px, calc(100vw - 40px)"
              onLoad={handleLoaded}
              onError={handleUnavailable}
              className="object-contain"
            />
          ))
          .exhaustive()}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 text-caption wrap-break-word text-muted">{file.name}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button type="button" variant="secondary" size="md" disabled={disabled} onClick={onReplace}>
            파일 바꾸기
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={disabled}
            aria-label="선택한 파일 제거"
            onClick={onRemove}
          >
            제거
          </Button>
        </div>
      </figcaption>
      {status === 'loading' ? (
        <p role="status" className="text-caption text-muted">
          미리보기 불러오는 중
        </p>
      ) : null}
    </figure>
  );
}
