'use client';
import Image from 'next/image';
import type { TChatAttachment } from '@/shared/api';
import { BottomSheet, openOverlay } from '@/shared/ui';
import { useI18n } from '@/shared/i18n';

export function ChatAttachmentView({ attachment }: { attachment: TChatAttachment }) {
  const { t } = useI18n();
  if (attachment.kind === 'VIDEO')
    return (
      <video
        className="chat-attachment-media"
        src={attachment.url}
        controls
        playsInline
        preload="metadata"
        aria-label={attachment.name}
      />
    );
  return (
    <button
      type="button"
      className="chat-image-open"
      aria-label={`${t('이미지 크게 보기')}: ${attachment.name}`}
      onClick={() =>
        openOverlay(({ isOpen, close, unmount }) => (
          <BottomSheet
            open={isOpen}
            onOpenChange={(open) => {
              if (open) return;
              close();
              unmount();
            }}
            title={attachment.name}
            description={t('이미지 크게 보기')}
          >
            <Image
              className="chat-media-viewer"
              src={attachment.url}
              alt={attachment.name}
              width={1200}
              height={900}
              unoptimized
            />
          </BottomSheet>
        ))
      }
    >
      <Image
        className="chat-attachment-media"
        src={attachment.url}
        alt={attachment.name}
        width={320}
        height={240}
        unoptimized
      />
    </button>
  );
}
