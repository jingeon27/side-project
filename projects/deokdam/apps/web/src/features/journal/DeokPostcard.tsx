'use client';

import Image from 'next/image';

import { useQuery } from '@tanstack/react-query';
import { Copy, Download, Link2, Share2 } from 'lucide-react';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import { episodeShareUrl } from '@/shared/episodes';
import type { TTopic } from '@/shared/topics';

import { createPostcard } from './postcard-image';

import './postcard.css';

type TSource = { surface: 'episode'; episode: string; topic: TTopic } | { surface: 'journal' };
type TMethod = 'share' | 'download' | 'copy' | 'link';

interface IPostcardProps {
  title: string;
  message: string;
  art?: string;
  source: TSource;
  children?: React.ReactNode;
}

export function DeokPostcard({ title, message, art, source, children }: IPostcardProps) {
  const content = { title, message: message.trim(), art, journal: source.surface === 'journal' };
  const image = useQuery({
    queryKey: ['postcard', content],
    enabled: !!content.message,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 90);
        signal.addEventListener(
          'abort',
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      signal.throwIfAborted();
      const { blob, width, height } = await createPostcard(content);
      signal.throwIfAborted();
      const file = new File([blob], '덕담집-' + title + '.png', { type: 'image/png' });
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image unreadable'));
        reader.onerror = () => reject(new Error('Image unreadable'));
        reader.readAsDataURL(blob);
      });
      return {
        file,
        url,
        width,
        height,
        canShare: typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] }),
      };
    },
  });
  const current = image.data;

  const reportClick = (method: TMethod) => track(event.PostcardActionClicked, { ...source, method });
  const reportComplete = (method: TMethod) => {
    track(event.PostcardExported, { ...source, method });
    if (source.surface === 'journal' && (method === 'share' || method === 'copy')) {
      track(event.JournalShared, { method });
    }
    if (source.surface === 'episode' && method === 'copy') {
      track(event.MessageCopied, { episode: source.episode, topic: source.topic });
    }
  };
  const handleShare = async () => {
    if (!current) return;
    reportClick('share');
    try {
      await navigator.share({ files: [current.file], title: '덕담집 ' + title });
      reportComplete('share');
      toast.success('엽서를 공유했어요.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast.error('공유 창을 열 수 없어요. 이미지를 저장해서 보내주세요.');
    }
  };
  const handleCopy = async (method: 'copy' | 'link') => {
    const value =
      method === 'link' && source.surface === 'episode' ? episodeShareUrl(source.episode) : content.message;
    reportClick(method);
    try {
      await navigator.clipboard.writeText(value);
      reportComplete(method);
      toast.success(
        method === 'link' ? '원본 이야기 링크를 복사했어요.' : '복사했어요. 원하는 곳에 붙여 넣으세요.',
      );
    } catch {
      toast.error(
        method === 'link'
          ? '링크를 복사하지 못했어요. 다시 시도해 주세요.'
          : '문장을 길게 눌러 복사해 주세요.',
      );
    }
  };

  return (
    <div className="postcard-studio">
      <figure className="postcard-paper" aria-label="공유할 엽서 미리보기">
        {current ? (
          <Image
            className="postcard-print"
            src={current.url}
            width={current.width}
            height={current.height}
            alt={content.message}
            unoptimized
          />
        ) : (
          <div className="postcard-proof">
            {art && (
              <Image
                className="postcard-proof-art"
                src={art}
                width={1000}
                height={370}
                sizes="(max-width: 720px) 95vw, 650px"
                alt=""
              />
            )}
            <div className="postcard-proof-copy">
              <small>{title}</small>
              <p>{content.message || '보내고 싶은 문장을 적어주세요.'}</p>
            </div>
          </div>
        )}
      </figure>
      {children}
      <div className="postcard-actions">
        {current?.canShare && (
          <Button icon={<Share2 size={16} aria-hidden />} onClick={handleShare}>
            엽서 공유
          </Button>
        )}
        {current ? (
          <a
            className="postcard-download"
            data-secondary={current.canShare || undefined}
            href={current.url}
            download={current.file.name}
            onClick={() => {
              reportClick('download');
              reportComplete('download');
              toast.success('엽서 PNG 다운로드를 시작했어요.');
            }}
          >
            <Download size={16} aria-hidden /> 이미지 저장
          </a>
        ) : image.isError ? (
          <Button variant="secondary" onClick={() => image.refetch()}>
            이미지 다시 만들기
          </Button>
        ) : (
          <Button variant="secondary" disabled>
            이미지 저장
          </Button>
        )}
        <Button
          variant="ghost"
          icon={<Copy size={16} aria-hidden />}
          onClick={() => handleCopy('copy')}
          disabled={!content.message}
        >
          문장 복사
        </Button>
        {source.surface === 'episode' && (
          <Button variant="ghost" icon={<Link2 size={16} aria-hidden />} onClick={() => handleCopy('link')}>
            원본 링크 복사
          </Button>
        )}
      </div>
      {image.isError && (
        <p role="alert" className="small-muted">
          엽서를 만들지 못했어요. 다시 만들거나 문장을 복사해 주세요.
        </p>
      )}
    </div>
  );
}
