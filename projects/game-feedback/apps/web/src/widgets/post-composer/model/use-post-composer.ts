import { useMutation } from '@tanstack/react-query';

import { useSession } from '@/features/auth';
import { uploadPostMediaMutationOptions } from '@/features/post-media';
import { useZodForm } from '@/shared/model/form';

import { focusInvalidPostContent } from './focus-invalid-post-content';
import {
  POST_DETAIL_DEFAULTS,
  postComposerSchema,
  type TPostComposerInput,
  type TPostComposerValues,
} from './post-composer.schema';
import { postContentInput } from './post-content-input';

interface IPostComposerOptions {
  /** 게시판별 세부 입력이 비어 있으면 기본값을 쓴다. */
  defaultValues: Omit<TPostComposerInput, 'editorValid'>;
  /** 화면이 만든 저장 mutation. 본문 사진 업로드와 진행·오류를 합친다. */
  save: { isPending: boolean; error: Error | null };
}

/**
 * 글쓰기와 수정이 함께 쓰는 폼 상태. 기본값, 본문 사진 업로드, 제출 값 변환과 잘못된 본문 포커스를 소유한다.
 * 저장 mutation과 성공 후 이동·알림은 화면이 정한다.
 */
export function usePostComposer({ defaultValues, save }: IPostComposerOptions) {
  const { session } = useSession();
  const upload = useMutation(uploadPostMediaMutationOptions(session.user?.id));
  const form = useZodForm(postComposerSchema, {
    defaultValues: {
      ...defaultValues,
      editorValid: true,
      coaching: defaultValues.coaching ?? POST_DETAIL_DEFAULTS.coaching,
      friendSale: defaultValues.friendSale ?? POST_DETAIL_DEFAULTS.friendSale,
      battle: defaultValues.battle ?? POST_DETAIL_DEFAULTS.battle,
    },
  });
  return {
    form,
    handleUploadMedia: upload.mutateAsync,
    pending: save.isPending || upload.isPending,
    errorMessage: save.error?.message ?? upload.error?.message,
    handleSubmit: (
      onValid: (input: ReturnType<typeof postContentInput>, values: TPostComposerValues) => Promise<void>,
    ) => form.handleSubmit((values) => onValid(postContentInput(values), values), focusInvalidPostContent),
  };
}

export type TPostComposer = ReturnType<typeof usePostComposer>;
