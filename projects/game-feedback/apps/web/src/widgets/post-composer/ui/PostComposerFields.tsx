'use client';

import type { ReactNode } from 'react';

import { useI18n } from '@/shared/i18n';
import { ErrorNotice } from '@/shared/ui';

import type { TPostComposer } from '../model/use-post-composer';
import { PostContentFields } from './PostContentFields';

/** 글쓰기·수정 폼의 입력 영역. 화면이 고른 분류 입력(children) 아래에 제목·세부·본문과 오류를 둔다. */
export function PostComposerFields({ composer, children }: { composer: TPostComposer; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      {children}
      <PostContentFields
        form={composer.form}
        disabled={composer.pending}
        onUploadMedia={composer.handleUploadMedia}
      />
      <ErrorNotice message={composer.errorMessage && t(composer.errorMessage)} />
    </>
  );
}
